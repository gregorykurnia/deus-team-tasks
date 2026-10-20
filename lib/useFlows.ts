"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { Flow, NewFlow } from "./types";
import { reportSnapshot } from "./connection";
import { addFlow, deleteFlow, FLOWS, updateFlow } from "./flowWrites";

export const flowsQuery = () => query(collection(db, FLOWS), orderBy("order", "asc"));
export const toFlow = (d: QueryDocumentSnapshot): Flow => ({ ...(d.data() as NewFlow), id: d.id });

export function useFlows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(flowsQuery(), { includeMetadataChanges: true }, (snap) => {
      reportSnapshot("flows", snap.metadata.fromCache);
      setFlows(snap.docs.map(toFlow));
      setLoading(false);
    });
  }, []);

  return { flows, loading, addFlow, updateFlow, deleteFlow };
}
