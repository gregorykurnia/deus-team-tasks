"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, query, orderBy, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { Task, NewTask } from "./types";
import { SEED_TASKS } from "./seedData";
import { addTask, deleteTask, TASKS, updateTask } from "./taskWrites";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    const q = query(collection(db, TASKS), orderBy("order", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty && !seeded) {
        setSeeded(true);
        const batch = writeBatch(db);
        SEED_TASKS.forEach((t) => {
          const ref = doc(collection(db, TASKS));
          batch.set(ref, t);
        });
        await batch.commit();
        return;
      }
      const rows: Task[] = snap.docs.map((d) => ({ ...(d.data() as NewTask), id: d.id }));
      setTasks(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [seeded]);

  return { tasks, loading, addTask, updateTask, deleteTask };
}
