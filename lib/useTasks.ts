"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { Task, NewTask } from "./types";
import { reportSnapshot } from "./connection";
import { addTask, deleteTask, TASKS, updateTask } from "./taskWrites";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const latest = useRef<Task[]>([]);

  useEffect(() => {
    const q = query(collection(db, TASKS), orderBy("order", "asc"));
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      reportSnapshot("tasks", snap.metadata.fromCache);
      const rows: Task[] = snap.docs.map((d) => ({ ...(d.data() as NewTask), id: d.id }));
      latest.current = rows;
      setTasks(rows);
      setLoading(false);
    });
  }, []);

  // The task as it is now goes along, so saving a finished task keeps its date.
  function update(id: string, patch: Partial<NewTask>) {
    return updateTask(id, patch, latest.current.find((t) => t.id === id));
  }

  return { tasks, loading, addTask, updateTask: update, deleteTask };
}
