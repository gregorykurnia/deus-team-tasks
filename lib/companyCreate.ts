import { doc, runTransaction } from "firebase/firestore";
import type { CompanyPatch } from "./companyEdit";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";

export const PIPELINE = "pipeline";

// Both the app and the connector allocate IDs in the tasks project.
const counterRef = () => doc(db, "settings", "companyIds");

export function companyRef(id: number) {
  return doc(clientsDb, PIPELINE, String(id));
}

export async function allocateCompanyId(knownMaxId: number): Promise<number> {
  return runTransaction(db, async (tx) => {
    const ref = counterRef();
    const snap = await tx.get(ref);
    const next = Math.max(Number(snap.data()?.next ?? 1), knownMaxId + 1);
    tx.set(ref, { next: next + 1 }, { merge: true });
    return next;
  });
}

// A deleted company may predate the counter. Keep its ID retired too.
export async function retireCompanyId(id: number): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = counterRef();
    const snap = await tx.get(ref);
    const next = Number(snap.data()?.next ?? 1);
    if (next <= id) tx.set(ref, { next: id + 1 }, { merge: true });
  });
}

export async function createCompany(fields: CompanyPatch, knownMaxId: number, onAllocate?: (id: number) => void): Promise<number> {
  let floor = knownMaxId;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await allocateCompanyId(floor);
    onAllocate?.(id);
    const ref = companyRef(id);
    const entries = Object.entries({ ...fields, id }).filter(([, value]) => value !== undefined);
    let attemptedCreate = false;
    const created = await runTransaction(clientsDb, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        if (!attemptedCreate) return false;
        // A transaction retry can see its own create after a lost reply. Confirm its fields without writing again.
        const stored = snap.data();
        if (Object.keys(stored).length === entries.length && entries.every(([key, value]) => stored[key] === value)) return true;
        throw new Error("Couldn't confirm whether the company was added. Check the company list before retrying.");
      }
      attemptedCreate = true;
      tx.set(ref, Object.fromEntries(entries));
      return true;
    });
    if (created) return id;
    floor = id;
  }
  throw new Error("Couldn't find a free id for the new company.");
}
