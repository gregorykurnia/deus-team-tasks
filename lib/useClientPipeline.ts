"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, type QueryDocumentSnapshot } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { PipelineEntry } from "./clientTypes";
import { reportSnapshot } from "./connection";
import { PIPELINE } from "./companyWrites";

export const companiesQuery = () => collection(clientsDb, PIPELINE);
export function toCompany(d: QueryDocumentSnapshot): PipelineEntry {
  const data = d.data() as PipelineEntry;
  return typeof data.id === "number" ? data : { ...data, id: Number(d.id) };
}

export function useClientPipeline() {
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      companiesQuery(),
      { includeMetadataChanges: true },
      (snap) => {
        reportSnapshot("companies", snap.metadata.fromCache);
        // Each company also stores its id inside; the document's own id backs it up.
        setEntries(snap.docs.map(toCompany));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
  }, []);

  // The highest id in use: new ids are allocated above it (companyWrites.addCompany).
  const maxId = entries.reduce((m, e) => Math.max(m, e.id), 0);

  return { entries, loading, maxId };
}
