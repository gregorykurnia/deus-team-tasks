"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, orderBy, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { Task, NewTask } from "./types";
import { reportSnapshot } from "./connection";
import { addTask, deleteTask, TASKS, updateTask } from "./taskWrites";

export const tasksQuery = () => query(collection(db, TASKS), orderBy("order", "asc"));
export const toTask = (d: QueryDocumentSnapshot): Task => ({ ...(d.data() as NewTask), id: d.id });

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const latest = useRef<Task[]>([]);

  useEffect(() => {
    return onSnapshot(tasksQuery(), { includeMetadataChanges: true }, (snap) => {
      reportSnapshot("tasks", snap.metadata.fromCache);
      const rows = snap.docs.map(toTask);
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
