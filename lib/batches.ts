import { writeBatch, type Firestore, type WriteBatch } from "firebase/firestore";

// Firestore takes at most 500 writes per batch; 450 leaves room.
export const BATCH_LIMIT = 450;

export type BatchOp = (batch: WriteBatch) => void;

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
  size = BATCH_LIMIT
): Promise<T[]> {
  const done: T[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size).filter(keep);
    if (chunk.length === 0) continue;
    const batch = writeBatch(db);
    chunk.forEach((item) => write(batch, item));
    try {
      await batch.commit();
    } catch (err) {
      if (done.length === 0) throw err;
      throw new PartlyCommitted(done, [...chunk, ...items.slice(i + size).filter(keep)], err);
    }
    done.push(...chunk);
  }
  return done;
}

// The same for writes that aren't one per item.
export async function commitInChunks(db: Firestore, ops: BatchOp[], size = BATCH_LIMIT): Promise<void> {
  await commitEach(db, ops, (batch, op) => op(batch), undefined, size);
}
