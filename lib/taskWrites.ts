// Every task write goes through here. A field set to undefined is cleared with
// deleteField(), the document id is never stored as a field, finishing a task
// records when (completedAt), and nothing is written with no connection.
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc, type WriteBatch } from "firebase/firestore";
import { commitEach, PartlyCommitted } from "./batches";
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

// A change to many tasks that stopped part way, when a batch after the first failed (lib/batches): `changed` were
// saved, `left` weren't, and `undo` puts back the ones that were (null for a delete, which has no Undo).
export class PartlyChanged extends Error {
  constructor(
    readonly changed: number,
    readonly left: number,
    readonly undo: Undo | null,
    cause: unknown
  ) {
    super(`${changed} of ${changed + left} tasks were changed`, { cause });
    this.name = "PartlyChanged";
  }
}

// Whether a task is still there just before its batch goes (the live list's ids), so one a colleague deleted meanwhile
// is left out rather than failing the batch it's in. Without it every task is written.
export type StillThere = (id: string) => boolean;

// One write per task in batches of 450. A stop part way throws PartlyChanged, with Undo for what was saved when given.
async function writeEach<T extends { id: string }>(
  tasks: T[],
  write: (batch: WriteBatch, t: T) => void,
  present?: StillThere,
  undoFor?: (written: T[]) => Undo
): Promise<T[]> {
  try {
    return await commitEach(db, tasks, write, present && ((t) => present(t.id)));
  } catch (err) {
    if (!(err instanceof PartlyCommitted)) throw err;
    const { done, left } = err as PartlyCommitted<T>;
    throw new PartlyChanged(done.length, left.length, undoFor ? undoFor(done) : null, err.cause);
  }
}

export async function deleteTasks(ids: string[], present?: StillThere): Promise<void> {
  assertOnline("No connection. The tasks weren't deleted.");
  await writeEach(
    ids.map((id) => ({ id })),
    (batch, t) => batch.delete(doc(db, TASKS, t.id)),
    present
  );
}

// Mark done or not done, with Undo that puts each task back as it was.
export async function setTasksDone(tasks: Task[], done: boolean, present?: StillThere): Promise<Undo> {
  assertOnline(`No connection. The ${tasks.length === 1 ? "task wasn't" : "tasks weren't"} marked ${done ? "done" : "not done"}.`);
  const changed = tasks.filter((t) => !!t.completed !== done);
  const now = Date.now();
  const undoFor = (written: Task[]) => () => putBackDone(written, present);
  const written = await writeEach(
    changed,
    (batch, t) => batch.update(doc(db, TASKS, t.id), toTaskUpdate(withCompletedAt({ completed: done }, t, now))),
    present,
    undoFor
  );
  return undoFor(written);
}

// Undo for marking done or not done: each task back to done or not as it was
// (pass them as they were), with its finished date.
export async function putBackDone(tasks: Task[], present?: StillThere): Promise<void> {
  assertOnline("No connection. The change wasn't undone.");
  await writeEach(
    tasks,
    (batch, t) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ completed: !!t.completed, completedAt: t.completedAt })),
    present
  );
}

// Moving to a task group applies to internal work only (D-008): company tasks
// stay with their companies. `group` null makes the tasks ungrouped.
export async function moveTasksToGroup(
  tasks: Task[],
  group: string | null,
  companies: CompaniesById,
  present?: StillThere
): Promise<{ moved: number; skipped: number; undo: Undo }> {
  assertOnline("No connection. The tasks weren't moved.");
  const internal = tasks.filter((t) => kindOf(t, companies) === "internal");
  const moving = internal.filter((t) => (t.taskGroup ?? null) !== group);
  const undoFor = (written: Task[]) => async () => {
    assertOnline("No connection. The change wasn't undone.");
    await writeEach(written, (batch, t) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: t.taskGroup })), present);
  };
  const written = await writeEach(moving, (batch, t) => batch.update(doc(db, TASKS, t.id), toTaskUpdate({ taskGroup: group ?? undefined })), present, undoFor);
  return { moved: written.length, skipped: tasks.length - internal.length, undo: undoFor(written) };
}
