// Qualification notes writes. Notes keep writing with no connection (D-014):
// Firestore queues them on the device and saves them when it's back.
import { deleteDoc, doc, getDoc, getDocFromCache, setDoc, type DocumentSnapshot } from "firebase/firestore";
import { getConnection } from "./connection";
import { clientsDb } from "./firebaseClients";
import { createEmptyProspectJournalEntry, type ProspectJournalEntry } from "./prospectJournalTypes";
import type { PipelineEntry } from "./clientTypes";

export const NOTES = "prospectJournal";

function notesRef(id: string) {
  return doc(clientsDb, NOTES, id);
}

// What's stored under a notes id: from the server when online, else from the
// device's copy. Null when it can't be told.
async function storedNotes(id: string): Promise<DocumentSnapshot | null> {
  try {
    return getConnection().online ? await getDoc(notesRef(id)) : await getDocFromCache(notesRef(id));
  } catch {
    return null;
  }
}

// A company's notes, started if there are none yet. Each company has at most
// one set (U5). Starting works with no connection too: the new set is saved
// once it's back.
export async function startNotesForCompany(c: PipelineEntry, notes: ProspectJournalEntry[]): Promise<string> {
  const existing = notes.find((n) => n.pipelineEntryId === c.id);
  if (existing) return existing.id;
  // The usual id, unless something is (or may be) stored there already: notes
  // not loaded on this screen yet, or kept from a deleted company with this id.
  let id = `pipeline-${c.id}`;
  const stored = await storedNotes(id);
  if (stored?.exists() && stored.get("pipelineEntryId") === c.id) return id;
  if (!stored || stored.exists()) id = `pipeline-${c.id}-${crypto.randomUUID()}`;
  const entry = { ...createEmptyProspectJournalEntry(id), pipelineEntryId: c.id, prospectName: c.company };
  const write = setDoc(notesRef(id), entry);
  // Offline, the write only finishes once the connection is back: don't wait.
  if (getConnection().online) await write;
  else write.catch((err) => console.error("Notes couldn't be started", err));
  return id;
}

// Notes for someone not tracked yet (U6).
export async function createNotes(prospectName = ""): Promise<string> {
  const entry = { ...createEmptyProspectJournalEntry(crypto.randomUUID()), prospectName };
  await setDoc(notesRef(entry.id), entry);
  return entry.id;
}

// Saves what changed, stamped with the time it was edited.
export async function saveNotes(id: string, patch: Partial<Omit<ProspectJournalEntry, "id">>): Promise<void> {
  await setDoc(notesRef(id), { ...patch, updatedAt: Date.now() }, { merge: true });
}

export async function linkNotes(entry: ProspectJournalEntry, c: PipelineEntry): Promise<void> {
  await saveNotes(entry.id, { pipelineEntryId: c.id, prospectName: entry.prospectName || c.company });
}

export async function deleteNotes(id: string): Promise<void> {
  await deleteDoc(notesRef(id));
}
