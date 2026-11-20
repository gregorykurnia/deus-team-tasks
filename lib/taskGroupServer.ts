import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { wibToday } from "./followupServer";
import { GroupNameError, groupNameProblem, groupNamesInUse, isTaskGroupName, matchTaskGroupName, sortGroups, TaskGroupError, TASK_GROUPS, type TASK_GROUP_ACTIONS } from "./taskGroupModel";
import { isOpen } from "./taskQueries";
import { TASKS, toTaskUpdate } from "./taskWriteFields";
import type { Task } from "./types";

export { matchTaskGroupName, TaskGroupError } from "./taskGroupModel";

const MAX_GROUP_TASKS = 400;

export interface ChangeTaskGroupInput {
  action: (typeof TASK_GROUP_ACTIONS)[number];
  name: string;
  newName?: string;
  starred?: boolean;
  taskCount?: number;
}

interface GroupSummary {
  id: string | null;
  name: string;
  starred: boolean;
  openTasks: number;
  taskCount: number;
}

async function readGroupData(db: Firestore, transaction: Transaction) {
  const groupDocs = await transaction.get(db.collection(TASK_GROUPS).select("name", "starred", "order"));
  const taskDocs = await transaction.get(db.collection(TASKS).orderBy("taskGroup")
    .select("taskGroup", "completed", "parkedAt", "parkedUntil"));
  const records = groupDocs.docs.flatMap((doc) => {
    const { name, starred, order } = doc.data();
    if (!isTaskGroupName(name)) return [];
    return [{ id: doc.id, ref: doc.ref, name, starred: !!starred, order: Number.isFinite(order) ? Number(order) : Infinity }];
  }).sort((a, b) => a.order - b.order);
  const tasks = taskDocs.docs.flatMap((doc) => {
    const task = doc.data() as Pick<Task, "taskGroup" | "completed" | "parkedAt" | "parkedUntil">;
    if (!isTaskGroupName(task.taskGroup)) return [];
    return [{ ...task, taskGroup: task.taskGroup, ref: doc.ref }];
  });
  return { records, tasks, names: [...new Set(groupNamesInUse(records, tasks))] };
}

export async function listTaskGroups(): Promise<{ groups: GroupSummary[] }> {
  const { adminDb } = await import("./admin");
  const { records, tasks, names } = await adminDb.runTransaction((transaction) => readGroupData(adminDb, transaction), { readOnly: true });
  const groups = new Map<string, GroupSummary>();
  for (const { id, name, starred } of records) {
    const group = groups.get(name);
    if (group) group.starred ||= starred;
    else groups.set(name, { id, name, starred, openTasks: 0, taskCount: 0 });
  }
  for (const name of names) {
    if (!groups.has(name)) groups.set(name, { id: null, name, starred: false, openTasks: 0, taskCount: 0 });
  }
  const today = wibToday();
  for (const task of tasks) {
    const group = groups.get(task.taskGroup)!;
    group.taskCount++;
    if (isOpen(task, today)) group.openTasks++;
  }
  return { groups: sortGroups([...groups.values()]) };
}

function assertNameAvailable(name: string, names: string[]) {
  const problem = groupNameProblem(name, names.map((name) => ({ name })));
  if (problem) throw new GroupNameError(problem);
}

export async function changeTaskGroup(input: ChangeTaskGroupInput) {
  const { action, taskCount } = input;
  const newName = input.newName?.trim() ?? "";
  if (!input.name.trim() || (action === "rename" && !newName)) throw new GroupNameError("missing");
  if ((action === "rename" || action === "delete") && (taskCount === undefined || !Number.isSafeInteger(taskCount) || taskCount < 0)) {
    throw new TaskGroupError("Use the total taskCount from list_task_groups.");
  }

  // The server SDK reads the queries inside the transaction, including on retries.
  // This covers membership changes and new records as well as changes to known documents.
  const { adminDb } = await import("./admin");
  const groups = adminDb.collection(TASK_GROUPS);
  return adminDb.runTransaction(async (transaction) => {
    const { records, tasks, names } = await readGroupData(adminDb, transaction);
    if (action === "create") {
      const name = input.name.trim();
      assertNameAvailable(name, names);
      const ref = groups.doc();
      const starred = input.starred ?? false;
      transaction.create(ref, { name, order: Date.now(), starred });
      return { created: true, id: ref.id, name, starred };
    }

    const name = matchTaskGroupName(input.name, names);
    if (!name) {
      if (action === "delete" || (action === "rename" && names.includes(newName))) return { alreadyDone: true };
      throw new TaskGroupError(`Group “${input.name}” could not be found. Use list_task_groups to check its current name.`);
    }
    const groupRecords = records.filter((record) => record.name === name);
    if (action === "star" || action === "unstar") {
      const starred = action === "star";
      if (groupRecords.length === 0) transaction.create(groups.doc(), { name, order: Date.now(), starred });
      for (const record of groupRecords) {
        if (record.starred !== starred) transaction.update(record.ref, { starred });
      }
      return { name, starred };
    }

    if (action === "rename" && name === newName) return { alreadyDone: true };
    const members = tasks.filter((task) => task.taskGroup === name);
    if (members.length > MAX_GROUP_TASKS) throw new TaskGroupError("Rename or delete this group in the app.");
    if (members.length !== taskCount) {
      throw new TaskGroupError(`The task count for “${name}” changed from ${taskCount} to ${members.length}. List the groups again and get confirmation for the new counts.`);
    }

    if (action === "rename") {
      assertNameAvailable(newName, names.filter((other) => other !== name));
      for (const task of members) transaction.update(task.ref, toTaskUpdate({ taskGroup: newName }, FieldValue.delete));
      for (const record of groupRecords) transaction.update(record.ref, { name: newName });
      return { renamed: true, name: newName, tasksMoved: members.length };
    }

    for (const task of members) transaction.update(task.ref, toTaskUpdate({ taskGroup: undefined }, FieldValue.delete));
    for (const record of groupRecords) transaction.delete(record.ref);
    return { deleted: true, name, tasksUngrouped: members.length };
  });
}
