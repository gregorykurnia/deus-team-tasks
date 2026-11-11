// A task's status: To Do, In Progress or Done. Done is `completed`, as everywhere else; In Progress is an unfinished task
// with `startedAt`. Tasks from before there was a status have neither, so they read as To Do. Parking is apart from it:
// a parked task keeps its status, and so does one marked not done again (an In Progress task goes back to In Progress).
import type { NewTask, Task } from "./types";

export type TaskStatus = "todo" | "inProgress" | "done";

export const TASK_STATUSES: TaskStatus[] = ["todo", "inProgress", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To Do", inProgress: "In Progress", done: "Done" };

type Statused = Pick<Task, "completed" | "startedAt">;

export function taskStatus(task: Statused): TaskStatus {
  if (task.completed) return "done";
  return task.startedAt ? "inProgress" : "todo";
}

// What to write to give a task this status. Starting records when; a task already started keeps its date, and finishing
// keeps it too, so marking not done brings back In Progress. Undefined clears the field (lib/taskWrites).
export function statusPatch(to: TaskStatus, current?: Statused, now = Date.now()): Pick<Task, "completed" | "startedAt"> {
  switch (to) {
    case "todo":
      return { completed: false, startedAt: undefined };
    case "inProgress":
      return { completed: false, startedAt: current?.startedAt ?? now };
    case "done":
      return { completed: true, startedAt: current?.startedAt };
  }
}

// Shared by writes and pure previews. Finishing ends parking; reopening clears the finish date.
export function withCompletedAt<P extends Partial<NewTask> & { id?: unknown }>(patch: P, current?: Pick<Task, "completed" | "completedAt">, now = Date.now()): P {
  if (patch.completed === true && !current?.completed) return { ...patch, completedAt: now, parkedAt: undefined, parkedUntil: undefined };
  if (patch.completed === true) return { ...patch, completedAt: current?.completedAt };
  if (patch.completed === false) return { ...patch, completedAt: undefined };
  return patch;
}
