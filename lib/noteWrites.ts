// Qualification notes writes. Notes keep writing with no connection (D-014):
// Firestore queues them on the device and saves them when it's back.
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { createEmptyProspectJournalEntry, type ProspectJournalEntry } from "./prospectJournalTypes";
import type { PipelineEntry } from "./clientTypes";

export const NOTES = "prospectJournal";

function notesRef(id: string) {
  return doc(clientsDb, NOTES, id);
}

// A company's notes, started if there are none yet. Each company has at most
// one set (U5).
export async function startNotesForCompany(c: PipelineEntry, notes: ProspectJournalEntry[]): Promise<string> {
  const existing = notes.find((n) => n.pipelineEntryId === c.id);
  if (existing) return existing.id;
  const entry = { ...createEmptyProspectJournalEntry(`pipeline-${c.id}`), pipelineEntryId: c.id, prospectName: c.company };
  await setDoc(notesRef(entry.id), entry);
  return entry.id;
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
