"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { sortGroups, TASK_GROUPS, type TaskGroup } from "./taskGroups";
import { reportSnapshot } from "./connection";

export type { TaskGroup } from "./taskGroups";

export const taskGroupsQuery = () => query(collection(db, TASK_GROUPS), orderBy("order", "asc"));
export function toTaskGroup(d: QueryDocumentSnapshot): TaskGroup {
  const data = d.data() as { name: string; starred?: boolean };
  return { id: d.id, name: data.name, starred: !!data.starred };
}

export function useTaskGroups() {
  const [groupDocs, setGroupDocs] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(taskGroupsQuery(), { includeMetadataChanges: true }, (snap) => {
      reportSnapshot("taskGroups", snap.metadata.fromCache);
      setGroupDocs(snap.docs.map(toTaskGroup));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const sortedGroupDocs = sortGroups(groupDocs);
  const groups = sortedGroupDocs.map((g) => g.name);
  const starredGroups = new Set(groupDocs.filter((g) => g.starred).map((g) => g.name));

  return { groups, groupDocs: sortedGroupDocs, starredGroups, loading };
}
