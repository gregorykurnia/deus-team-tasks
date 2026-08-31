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
import { Task, NewTask } from "./types";
import { SEED_TASKS } from "./seedData";

const COLLECTION = "tasks";

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty && !seeded) {
        setSeeded(true);
        const batch = writeBatch(db);
        SEED_TASKS.forEach((t) => {
          const ref = doc(collection(db, COLLECTION));
          batch.set(ref, t);
        });
        await batch.commit();
        return;
      }
      const rows: Task[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as NewTask) }));
      setTasks(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [seeded]);

  async function addTask(task: NewTask) {
    await addDoc(collection(db, COLLECTION), stripUndefined(task));
  }

  async function updateTask(id: string, patch: Partial<NewTask>) {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined(patch));
  }

  async function deleteTask(id: string) {
    await deleteDoc(doc(db, COLLECTION, id));
  }

  return { tasks, loading, addTask, updateTask, deleteTask };
}
