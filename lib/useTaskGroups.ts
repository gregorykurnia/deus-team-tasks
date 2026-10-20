"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { sortGroups, TASK_GROUPS, type TaskGroup } from "./taskGroups";

export type { TaskGroup } from "./taskGroups";

export function useTaskGroups() {
  const [groupDocs, setGroupDocs] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, TASK_GROUPS), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setGroupDocs(
        snap.docs.map((d) => {
          const data = d.data() as { name: string; starred?: boolean };
          return { id: d.id, name: data.name, starred: !!data.starred };
        })
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const sortedGroupDocs = sortGroups(groupDocs);
  const groups = sortedGroupDocs.map((g) => g.name);
  const starredGroups = new Set(groupDocs.filter((g) => g.starred).map((g) => g.name));

  return { groups, groupDocs: sortedGroupDocs, starredGroups, loading };
}
