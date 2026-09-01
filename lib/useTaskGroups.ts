"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

const COLLECTION = "taskGroups";

interface TaskGroupDoc {
  name: string;
  order: number;
  starred?: boolean;
}

export interface TaskGroup {
  id: string;
  name: string;
  starred: boolean;
}

export function useTaskGroups() {
  const [groupDocs, setGroupDocs] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setGroupDocs(
        snap.docs.map((d) => {
          const data = d.data() as TaskGroupDoc;
          return { id: d.id, name: data.name, starred: !!data.starred };
        })
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addGroup(name: string) {
    await addDoc(collection(db, COLLECTION), { name, order: Date.now(), starred: false } as TaskGroupDoc);
  }

  async function deleteGroup(name: string) {
    const match = groupDocs.find((g) => g.name === name);
    if (!match) return;
    await deleteDoc(doc(db, COLLECTION, match.id));
  }

  async function toggleStarGroup(name: string) {
    const match = groupDocs.find((g) => g.name === name);
    if (!match) return;
    await updateDoc(doc(db, COLLECTION, match.id), { starred: !match.starred });
  }

  const sortedGroupDocs = [...groupDocs].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1));
  const groups = sortedGroupDocs.map((g) => g.name);
  const starredGroups = new Set(groupDocs.filter((g) => g.starred).map((g) => g.name));

  return { groups, groupDocs: sortedGroupDocs, starredGroups, loading, addGroup, deleteGroup, toggleStarGroup };
}
