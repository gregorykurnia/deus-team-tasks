"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

const COLLECTION = "taskGroups";

interface TaskGroupDoc {
  name: string;
  order: number;
}

export function useTaskGroups() {
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => (d.data() as TaskGroupDoc).name));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addGroup(name: string) {
    await addDoc(collection(db, COLLECTION), { name, order: Date.now() } as TaskGroupDoc);
  }

  return { groups, loading, addGroup };
}
