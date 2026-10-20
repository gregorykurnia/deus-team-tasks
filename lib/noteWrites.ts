// Qualification notes writes. Notes keep writing with no connection (D-014):
// Firestore queues them on the device and saves them when it's back.
import { deleteDoc, deleteField, doc, getDoc, getDocFromCache, onSnapshot, setDoc, updateDoc, type DocumentSnapshot } from "firebase/firestore";
import { assertOnline, getConnection } from "./connection";
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

// Notes for someone not tracked yet (U6). Starting, linking and deleting need the connection; only writing doesn't.
export async function createNotes(prospectName = ""): Promise<string> {
  assertOnline("No connection. The notes weren’t started.");
  const entry = { ...createEmptyProspectJournalEntry(crypto.randomUUID()), prospectName };
  await setDoc(notesRef(entry.id), entry);
  return entry.id;
}

// Saves what changed, stamped with the time it was edited.
export async function saveNotes(id: string, patch: Partial<Omit<ProspectJournalEntry, "id">>): Promise<void> {
  await setDoc(notesRef(id), { ...patch, updatedAt: Date.now() }, { merge: true });
}

// Saves what was written into notes that are there, and never brings deleted notes back as a half-empty set. With no
// connection the change waits on the device and saves once it's back (D-014), so the promise only settles then.
export async function writeNotes(id: string, patch: Partial<Omit<ProspectJournalEntry, "id" | "pipelineEntryId">>): Promise<void> {
  await updateDoc(notesRef(id), { ...patch, updatedAt: Date.now() });
}

// Whether changes to these notes are still waiting on the device to reach the server: the save line (guide 4.15).
export function watchNotesPending(id: string, onChange: (pending: boolean) => void): () => void {
  return onSnapshot(
    notesRef(id),
    { includeMetadataChanges: true },
    (snap) => onChange(snap.metadata.hasPendingWrites),
    // The listener closed: the writes' own failures tell if they didn't save.
    () => onChange(false)
  );
}

// Links notes for someone not tracked yet to a tracked company (U6). Returns the undo, which unlinks them again.
// Both fail on notes deleted meanwhile, rather than bringing them back as a half-empty set.
export async function linkNotes(entry: ProspectJournalEntry, c: PipelineEntry): Promise<() => Promise<void>> {
  assertOnline("No connection. The notes weren’t linked.");
  const name = entry.prospectName;
  await updateDoc(notesRef(entry.id), { pipelineEntryId: c.id, prospectName: name || c.company, updatedAt: Date.now() });
  return async () => {
    assertOnline("No connection. The notes are still linked.");
    await updateDoc(notesRef(entry.id), { pipelineEntryId: deleteField(), prospectName: name, updatedAt: Date.now() });
  };
}

export async function deleteNotes(id: string): Promise<void> {
  assertOnline("No connection. The notes weren’t deleted.");
  await deleteDoc(notesRef(id));
}
