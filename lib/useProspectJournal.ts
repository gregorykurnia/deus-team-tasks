"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, type QueryDocumentSnapshot } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { ProspectJournalEntry } from "./prospectJournalTypes";
import { NOTES } from "./noteWrites";
import { reportSnapshot } from "./connection";

export const notesQuery = () => collection(clientsDb, NOTES);
// Oldest change first, as the notes have always been listed.
export function toNotes(docs: QueryDocumentSnapshot[]): ProspectJournalEntry[] {
  return docs
    .map((item) => {
      const entry = item.data() as ProspectJournalEntry;
      return { ...entry, id: item.id, detailedRemarks: entry.detailedRemarks ?? "" };
    })
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

export function useProspectJournal() {
  const [entries, setEntries] = useState<ProspectJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      notesQuery(),
      { includeMetadataChanges: true },
      (snapshot) => {
        reportSnapshot("notes", snapshot.metadata.fromCache);
        setEntries(toNotes(snapshot.docs));
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load the prospect journal", error);
        setLoading(false);
      }
    );
  }, []);

  return { entries, loading };
}
