// Task groups. Tasks refer to their group by name, so renaming or deleting a
// group updates its tasks in the same batches.
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { commitInChunks, type BatchOp } from "./batches";
import { assertOnline } from "./connection";
import { db } from "./firebase";
import { TASKS, toTaskUpdate } from "./taskWrites";
import type { Task } from "./types";

export const TASK_GROUPS = "taskGroups";

export interface TaskGroup {
  id: string;
  name: string;
  starred: boolean;
}

// A group a task names but that has no record of its own (left by older data).
export interface GroupRef {
  id?: string;
  name: string;
}

export type GroupNameProblem = "missing" | "taken";

export class GroupNameError extends Error {
  constructor(public problem: GroupNameProblem) {
    super(problem === "missing" ? "Enter a name." : "A group with that name already exists.");
  }
}

// A group's name is required and unique, ignoring case (guide 5.5).
export function groupNameProblem(name: string, groups: GroupRef[], exceptId?: string): GroupNameProblem | null {
  const clean = name.trim();
  if (!clean) return "missing";
  const key = clean.toLowerCase();
  return groups.some((g) => g.id !== exceptId && g.name.trim().toLowerCase() === key) ? "taken" : null;
}

// Starred groups first, then in the order they were made.
export function sortGroups<G extends TaskGroup>(groups: G[]): G[] {
  return [...groups].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1));
}

// Group names to show: every group, plus names that only tasks still carry.
export function groupNamesInUse(groups: GroupRef[], tasks: Pick<Task, "taskGroup">[]): string[] {
  const names = groups.map((g) => g.name);
  for (const t of tasks) if (t.taskGroup && !names.includes(t.taskGroup)) names.push(t.taskGroup);
  return names;
}

export async function createTaskGroup(name: string, groups: GroupRef[], starred = false): Promise<string> {
  const problem = groupNameProblem(name, groups);
  if (problem) throw new GroupNameError(problem);
  assertOnline("No connection. The task group wasn't created.");
  const ref = await addDoc(collection(db, TASK_GROUPS), { name: name.trim(), order: Date.now(), starred });
  return ref.id;
}

export async function setGroupStarred(groupId: string, starred: boolean): Promise<void> {
  assertOnline("No connection. The task group wasn't changed.");
  await updateDoc(doc(db, TASK_GROUPS, groupId), { starred });
}

function tasksIn(group: GroupRef, tasks: Task[]) {
  return tasks.filter((t) => t.taskGroup === group.name);
}

// The group's own records: its id, and every record with its name (tasks can
// arrive before groups, and older data may hold two records of one name).
async function groupRecordIds(group: GroupRef): Promise<string[]> {
  const snap = await getDocs(query(collection(db, TASK_GROUPS), where("name", "==", group.name)));
  return [...new Set([...(group.id ? [group.id] : []), ...snap.docs.map((d) => d.id)])];
}

// Renames the group and every task in it. Returns how many tasks moved with it.
export async function renameTaskGroup(group: GroupRef, newName: string, groups: GroupRef[], tasks: Task[]): Promise<number> {
  const problem = groupNameProblem(newName, groups, group.id);
  if (problem) throw new GroupNameError(problem);
  assertOnline("No connection. The task group wasn't renamed.");
  const name = newName.trim();
  const members = tasksIn(group, tasks);
  // The group's own record goes last, so a failure part way leaves it to retry.
  const ops: BatchOp[] = members.map((t) => (b) => b.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: name })));
  for (const id of await groupRecordIds(group)) ops.push((b) => b.update(doc(db, TASK_GROUPS, id), { name }));
  await commitInChunks(db, ops);
  return members.length;
}

// Deletes the group; its tasks stay and become ungrouped (W11). Returns how
// many tasks that was.
export async function deleteTaskGroup(group: GroupRef, tasks: Task[]): Promise<number> {
  assertOnline("No connection. The task group wasn't deleted.");
  const members = tasksIn(group, tasks);
  const ops: BatchOp[] = members.map((t) => (b) => b.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: undefined })));
  for (const id of await groupRecordIds(group)) ops.push((b) => b.delete(doc(db, TASK_GROUPS, id)));
  await commitInChunks(db, ops);
  return members.length;
}
