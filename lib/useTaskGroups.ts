"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

const COLLECTION = "taskGroups";

interface TaskGroupDoc {
  name: string;
  order: number;
}

export interface TaskGroup {
  id: string;
  name: string;
}

export function useTaskGroups() {
  const [groupDocs, setGroupDocs] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setGroupDocs(snap.docs.map((d) => ({ id: d.id, name: (d.data() as TaskGroupDoc).name })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addGroup(name: string) {
    await addDoc(collection(db, COLLECTION), { name, order: Date.now() } as TaskGroupDoc);
  }

  async function deleteGroup(name: string) {
    const match = groupDocs.find((g) => g.name === name);
    if (!match) return;
    await deleteDoc(doc(db, COLLECTION, match.id));
  }

  const groups = groupDocs.map((g) => g.name);

  return { groups, groupDocs, loading, addGroup, deleteGroup };
}
