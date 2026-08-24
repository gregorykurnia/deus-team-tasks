"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, setDoc, deleteDoc, doc } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { PipelineEntry } from "./clientTypes";
import { SEED_PIPELINE } from "./clientSeedData";

const COLLECTION = "pipeline";

export function useClientPipeline() {
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientsDb, COLLECTION),
      async (snap) => {
        if (snap.empty && !seeded) {
          setSeeded(true);
          await Promise.all(SEED_PIPELINE.map((e) => setDoc(doc(clientsDb, COLLECTION, String(e.id)), e)));
          return;
        }
        const rows = snap.docs.map((d) => d.data() as PipelineEntry);
        setEntries(rows);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [seeded]);

  function nextId() {
    return entries.length ? Math.max(...entries.map((d) => d.id)) + 1 : 1;
  }

  async function saveEntry(entry: PipelineEntry) {
    await setDoc(doc(clientsDb, COLLECTION, String(entry.id)), entry);
  }

  async function deleteEntry(id: number) {
    await deleteDoc(doc(clientsDb, COLLECTION, String(id)));
  }

  return { entries, loading, nextId, saveEntry, deleteEntry };
}
