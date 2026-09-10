"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { ProspectJournalEntry } from "./prospectJournalTypes";

const COLLECTION = "prospectJournal";

export function useProspectJournal() {
  const [entries, setEntries] = useState<ProspectJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(clientsDb, COLLECTION),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => item.data() as ProspectJournalEntry)
          .sort((a, b) => a.updatedAt - b.updatedAt);
        setEntries(rows);
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load the prospect journal", error);
        setLoading(false);
      }
    );
  }, []);

  async function saveEntry(entry: ProspectJournalEntry) {
    await setDoc(doc(clientsDb, COLLECTION, entry.id), entry);
  }

  async function deleteEntry(id: string) {
    await deleteDoc(doc(clientsDb, COLLECTION, id));
  }

  return { entries, loading, saveEntry, deleteEntry };
}
