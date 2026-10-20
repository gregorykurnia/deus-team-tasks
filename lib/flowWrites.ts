// Flow writes. Flows are read only with no connection (D-018), and every
// change records when the flow was last edited.
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc } from "firebase/firestore";
import { assertOnline } from "./connection";
import { db } from "./firebase";
import type { NewFlow } from "./types";

export const FLOWS = "flows";

export async function addFlow(flow: NewFlow): Promise<string> {
  assertOnline("No connection. The flow wasn't created.");
  const ref = await addDoc(collection(db, FLOWS), { ...flow, updatedAt: Date.now() });
  return ref.id;
}

export async function updateFlow(id: string, patch: Partial<NewFlow>): Promise<void> {
  assertOnline("No connection. The flow wasn't saved.");
  const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
  await updateDoc(doc(db, FLOWS, id), { ...data, updatedAt: Date.now() });
}

export async function deleteFlow(id: string): Promise<void> {
  assertOnline("No connection. The flow wasn't deleted.");
  await deleteDoc(doc(db, FLOWS, id));
}
