import { writeBatch, type Firestore, type WriteBatch } from "firebase/firestore";
import { requestAssignNotify } from "./assignNotifyRequests";

// Firestore takes at most 500 writes per batch; 450 leaves room.
export const BATCH_LIMIT = 450;

export type BatchOp = (batch: WriteBatch) => void;

// Observe the shared batch itself so a new bulk save cannot bypass assignment notices.
function assignmentBatch(batch: WriteBatch, ids: Set<string>): WriteBatch {
  return new Proxy(batch, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (key === "set" || key === "update") {
          const ref = args[0] as { path?: string } | undefined;
          const data = args[1];
          const responsible = data && typeof data === "object" ? Object.hasOwn(data, "responsible")
            : args.some((field, index) => index % 2 === 1 && field === "responsible");
          if (responsible && typeof ref?.path === "string" && /^tasks\/[^/]+$/.test(ref.path)) ids.add(ref.path.slice(6));
        }
        const result = Reflect.apply(value, target, args);
        return result === target ? receiver : result;
      };
    },
  });
}

// A list longer than one batch that stopped part way: the items in `done` were saved, in the batches before the one
// that failed, and `left` weren't (the failed batch and every one after it).
export class PartlyCommitted<T> extends Error {
  constructor(
    readonly done: T[],
    readonly left: T[],
    cause: unknown
  ) {
    super(`${done.length} of ${done.length + left.length} writes were saved`, { cause });
    this.name = "PartlyCommitted";
  }
}

// Writes each item in batches of 450 and returns the items written. Each batch is all or nothing, and a list longer
// than one batch is committed batch by batch, in order. Items `keep` turns down just before their batch goes (a task
// a colleague deleted meanwhile, which would fail the whole batch) are left out. When the first batch fails, its error
// is thrown as it is; when a later one fails, PartlyCommitted says what was saved.
export async function commitEach<T>(
  db: Firestore,
  items: T[],
  write: (batch: WriteBatch, item: T) => void,
  keep: (item: T) => boolean = () => true,
  size = BATCH_LIMIT,
  onAssignments: (ids: readonly string[]) => void = requestAssignNotify
): Promise<T[]> {
  const done: T[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size).filter(keep);
    if (chunk.length === 0) continue;
    const ids = new Set<string>();
    const batch = assignmentBatch(writeBatch(db), ids);
    chunk.forEach((item) => write(batch, item));
    try {
      await batch.commit();
    } catch (err) {
      if (done.length === 0) throw err;
      throw new PartlyCommitted(done, [...chunk, ...items.slice(i + size).filter(keep)], err);
    }
    done.push(...chunk);
    if (ids.size) onAssignments([...ids]);
  }
  return done;
}

// The same for writes that aren't one per item.
export async function commitInChunks(db: Firestore, ops: BatchOp[], size = BATCH_LIMIT): Promise<void> {
  await commitEach(db, ops, (batch, op) => op(batch), undefined, size);
}
