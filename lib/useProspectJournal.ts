"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { ProspectJournalEntry } from "./prospectJournalTypes";
import { NOTES } from "./noteWrites";

export function useProspectJournal() {
  const [entries, setEntries] = useState<ProspectJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(clientsDb, NOTES),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => {
            const entry = item.data() as ProspectJournalEntry;
            return {
              ...entry,
              id: item.id,
              detailedRemarks: entry.detailedRemarks ?? "",
            };
          })
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

  return { entries, loading };
}
