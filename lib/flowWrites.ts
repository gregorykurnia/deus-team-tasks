// Flow writes. Flows are read only with no connection (D-018), and every
// change records when the flow was last edited.
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc } from "firebase/firestore";
import { assertOnline } from "./connection";
import { db } from "./firebase";
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

export async function updateFlow(id: string, patch: Partial<NewFlow>): Promise<void> {
  assertOnline("No connection. The flow wasn't saved.");
  const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : withoutUnset(v)]));
  await updateDoc(doc(db, FLOWS, id), { ...data, updatedAt: Date.now() });
}

export async function deleteFlow(id: string): Promise<void> {
  assertOnline("No connection. The flow wasn't deleted.");
  await deleteDoc(doc(db, FLOWS, id));
}
