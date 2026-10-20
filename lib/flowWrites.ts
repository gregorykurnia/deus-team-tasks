// Flow writes. Flows are read only with no connection (D-018), and every
// change records when the flow was last edited.
import { addDoc, collection, deleteDoc, deleteField, doc, runTransaction, updateDoc } from "firebase/firestore";
import { assertOnline } from "./connection";
import { db } from "./firebase";
import { applyChange, type FlowChange } from "./flows";
import type { NewFlow } from "./types";

export const FLOWS = "flows";

export async function addFlow(flow: NewFlow): Promise<string> {
  assertOnline("No connection. The flow wasn't created.");
  const ref = await addDoc(collection(db, FLOWS), withoutUnset({ ...flow, updatedAt: Date.now() }));
  return ref.id;
}

// Leaves out unset values inside steps (a branch with no "loop to"), which
// Firestore refuses. Top-level unset values clear the field instead.
export function withoutUnset<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUnset) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([k, v]) => (v === undefined ? [] : [[k, withoutUnset(v)]]))
    ) as T;
  }
  return value;
}

const stored = (patch: Partial<NewFlow>) =>
  Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : withoutUnset(v)]));

export async function updateFlow(id: string, patch: Partial<NewFlow>): Promise<void> {
  assertOnline("No connection. The flow wasn't saved.");
  await updateDoc(doc(db, FLOWS, id), { ...stored(patch), updatedAt: Date.now() });
}

// One flow's changes from this device run one after another, so each starts from the one before it: typing into a part
// just added finds that part in the stored flow (R3).
const queued = new Map<string, Promise<unknown>>();

// A change made on the server's newest version of the flow, so two people editing different steps at once both keep
// their edit. Nothing is written when the change changes nothing there. A flow that's gone fails with "not-found".
// Resolves with the `updatedAt` written (null when nothing was): a transaction's write reaches the screen only with the
// server's next snapshot, so the editor can tell when the data has caught up.
export function changeFlow(id: string, change: FlowChange): Promise<number | null> {
  try {
    assertOnline("No connection. The flow wasn't saved.");
  } catch (err) {
    return Promise.reject(err);
  }
  const ref = doc(db, FLOWS, id);
  const run = (queued.get(id) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() =>
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw Object.assign(new Error("The flow isn't there any more."), { code: "not-found" });
        const { patch } = applyChange({ ...(snap.data() as NewFlow), id }, change);
        if (!Object.keys(patch).length) return null;
        const updatedAt = Math.max(Date.now(), Number(snap.data().updatedAt ?? 0) + 1);
        tx.update(ref, { ...stored(patch), updatedAt });
        return updatedAt;
      })
    );
  queued.set(id, run);
  const done = () => {
    if (queued.get(id) === run) queued.delete(id);
  };
  run.then(done, done);
  return run;
}

export async function deleteFlow(id: string): Promise<void> {
  assertOnline("No connection. The flow wasn't deleted.");
  await deleteDoc(doc(db, FLOWS, id));
}
