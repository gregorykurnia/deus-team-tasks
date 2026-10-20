"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, setDoc, doc } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { PipelineEntry } from "./clientTypes";
import { SEED_PIPELINE } from "./clientSeedData";
import { PIPELINE } from "./companyWrites";

export function useClientPipeline() {
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientsDb, PIPELINE),
      async (snap) => {
        if (snap.empty && !seeded) {
          setSeeded(true);
          await Promise.all(SEED_PIPELINE.map((e) => setDoc(doc(clientsDb, PIPELINE, String(e.id)), e)));
          return;
        }
        // Each company also stores its id inside; the document's own id backs it up.
        const rows = snap.docs.map((d) => {
          const data = d.data() as PipelineEntry;
          return typeof data.id === "number" ? data : { ...data, id: Number(d.id) };
        });
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

  // The highest id in use: new ids are allocated above it (companyWrites.addCompany).
  const maxId = entries.reduce((m, e) => Math.max(m, e.id), 0);

  return { entries, loading, maxId };
}
