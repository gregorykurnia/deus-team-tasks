"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Flow, NewFlow } from "./types";
import { SEED_FLOWS } from "./flowSeed";

const COLLECTION = "flows";

export function useFlows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty && !seeded) {
        setSeeded(true);
        const batch = writeBatch(db);
        SEED_FLOWS.forEach((f) => {
          const ref = doc(collection(db, COLLECTION));
          batch.set(ref, f);
        });
        await batch.commit();
        return;
      }
      const rows: Flow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as NewFlow) }));
      setFlows(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [seeded]);

  async function addFlow(flow: NewFlow) {
    const ref = await addDoc(collection(db, COLLECTION), flow);
    return ref.id;
  }

  async function updateFlow(id: string, patch: Partial<NewFlow>) {
    await updateDoc(doc(db, COLLECTION, id), patch);
  }

  async function deleteFlow(id: string) {
    await deleteDoc(doc(db, COLLECTION, id));
  }

  return { flows, loading, addFlow, updateFlow, deleteFlow };
}
