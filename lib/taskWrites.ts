// Every task write goes through here. A field set to undefined is cleared with
// deleteField(), the document id is never stored as a field, finishing a task
// records when (completedAt), and nothing is written with no connection.
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc } from "firebase/firestore";
import { commitInChunks } from "./batches";
import { assertOnline } from "./connection";
import { db } from "./firebase";
import { kindOf, type CompaniesById } from "./kinds";
import type { NewTask, Task } from "./types";

export const TASKS = "tasks";

export type Undo = () => Promise<void>;

type TaskPatch = Partial<NewTask> & { id?: unknown };

// Marking done records when; marking not done clears it. A task already done
// keeps its date when it's saved again.
export function withCompletedAt<P extends TaskPatch>(patch: P, current?: Pick<Task, "completed" | "completedAt">, now = Date.now()): P {
  if (patch.completed === true && !current?.completed) return { ...patch, completedAt: now };
  if (patch.completed === true) return { ...patch, completedAt: current?.completedAt };
  if (patch.completed === false) return { ...patch, completedAt: undefined };
  return patch;
}

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
  assertOnline("No connection. The task wasn't added.");
  const ref = await addDoc(collection(db, TASKS), toNewTaskDoc(withCompletedAt(task)));
  return ref.id;
}

// Pass the task as it is now, so finishing it again doesn't move its date.
export async function updateTask(id: string, patch: TaskPatch, current?: Task): Promise<void> {
  assertOnline("No connection. The task wasn't saved.");
  await updateDoc(doc(db, TASKS, id), toTaskUpdate(withCompletedAt(patch, current)));
}

export async function deleteTask(id: string): Promise<void> {
  assertOnline("No connection. The task wasn't deleted.");
  await deleteDoc(doc(db, TASKS, id));
}

export async function deleteTasks(ids: string[]): Promise<void> {
  assertOnline("No connection. The tasks weren't deleted.");
  await commitInChunks(
    db,
    ids.map((id) => (batch) => batch.delete(doc(db, TASKS, id)))
  );
}

// Mark done or not done, with Undo that puts each task back as it was.
export async function setTasksDone(tasks: Task[], done: boolean): Promise<Undo> {
  assertOnline(`No connection. The ${tasks.length === 1 ? "task wasn't" : "tasks weren't"} marked ${done ? "done" : "not done"}.`);
  const changed = tasks.filter((t) => !!t.completed !== done);
  const now = Date.now();
  await commitInChunks(
    db,
    changed.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate(withCompletedAt({ completed: done }, t, now))))
  );
  return () => putBackDone(changed);
}

// Undo for marking done or not done: each task back to done or not as it was
// (pass them as they were), with its finished date.
export async function putBackDone(tasks: Task[]): Promise<void> {
  assertOnline("No connection. The change wasn't undone.");
  await commitInChunks(
    db,
    tasks.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ completed: !!t.completed, completedAt: t.completedAt })))
  );
}

// Moving to a task group applies to internal work only (D-008): company tasks
// stay with their companies. `group` null makes the tasks ungrouped.
export async function moveTasksToGroup(
  tasks: Task[],
  group: string | null,
  companies: CompaniesById
): Promise<{ moved: number; skipped: number; undo: Undo }> {
  assertOnline("No connection. The tasks weren't moved.");
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
      assertOnline("No connection. The change wasn't undone.");
      await commitInChunks(
        db,
        moving.map((t) => (batch) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: t.taskGroup })))
      );
    },
  };
}
