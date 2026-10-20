"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { Flow, NewFlow } from "./types";
import { reportSnapshot } from "./connection";
import { addFlow, deleteFlow, FLOWS, updateFlow } from "./flowWrites";

export function useFlows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, FLOWS), orderBy("order", "asc"));
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      reportSnapshot("flows", snap.metadata.fromCache);
      setFlows(snap.docs.map((d) => ({ ...(d.data() as NewFlow), id: d.id })));
      setLoading(false);
    });
  }, []);

  return { flows, loading, addFlow, updateFlow, deleteFlow };
}
