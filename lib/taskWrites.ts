// Every task write goes through here. A field set to undefined is cleared with
// deleteField(), and the document id is never stored as a field.
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc } from "firebase/firestore";
import { commitInChunks } from "./batches";
import { db } from "./firebase";
import { kindOf, type CompaniesById } from "./kinds";
import type { NewTask, Task } from "./types";

export const TASKS = "tasks";

export type Undo = () => Promise<void>;

type TaskPatch = Partial<NewTask> & { id?: unknown };

// What a new task stores: no undefined values, no id.
export function toNewTaskDoc(task: NewTask & { id?: unknown }): Record<string, unknown> {
  const { id: _id, ...rest } = task;
  void _id;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}

// What an update stores: undefined clears the field, the id is dropped.
export function toTaskUpdate(patch: TaskPatch): Record<string, unknown> {
  const { id: _id, ...rest } = patch;
  void _id;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
}

export async function addTask(task: NewTask): Promise<string> {
  const ref = await addDoc(collection(db, TASKS), toNewTaskDoc(task));
  return ref.id;
}

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  await updateDoc(doc(db, TASKS, id), toTaskUpdate(patch));
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(doc(db, TASKS, id));
}

export async function deleteTasks(ids: string[]): Promise<void> {
  await commitInChunks(
    db,
    ids.map((id) => (batch) => batch.delete(doc(db, TASKS, id)))
  );
}

// Mark done or not done, with Undo that puts each task back as it was.
export async function setTasksDone(tasks: Task[], done: boolean): Promise<Undo> {
  const changed = tasks.filter((t) => !!t.completed !== done);
  await commitInChunks(
    db,
    changed.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ completed: done })))
  );
  return async () => {
    await commitInChunks(
      db,
      changed.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ completed: !!t.completed })))
    );
  };
}

// Moving to a task group applies to internal work only (D-008): company tasks
// stay with their companies. `group` null makes the tasks ungrouped.
export async function moveTasksToGroup(
  tasks: Task[],
  group: string | null,
  companies: CompaniesById
): Promise<{ moved: number; skipped: number; undo: Undo }> {
  const internal = tasks.filter((t) => kindOf(t, companies) === "internal");
  const moving = internal.filter((t) => (t.taskGroup ?? null) !== group);
  await commitInChunks(
    db,
    moving.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: group ?? undefined })))
  );
  return {
    moved: moving.length,
    skipped: tasks.length - internal.length,
    undo: async () => {
      await commitInChunks(
        db,
        moving.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: t.taskGroup })))
      );
    },
  };
}
