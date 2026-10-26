// Subtasks (N24): a subtask is a task of its own (its own dates, people and status) that names its parent in parentId.
// One level only: a subtask has no subtasks. A parentId whose task is gone counts as no parent, so a subtask whose
// parent was deleted is an ordinary task.
import type { NewTask, Task } from "./types";

type Lookup = ReadonlyMap<string, Pick<Task, "id" | "task" | "parentId">>;

// The task's parent when it's still there.
export function parentOf<T extends Pick<Task, "parentId">>(task: T, byId: ReadonlyMap<string, T>): T | undefined {
  return task.parentId ? byId.get(task.parentId) : undefined;
}

// Only a task that isn't a subtask itself can hold subtasks.
export function canHoldSubtasks(task: Pick<Task, "parentId">, byId: Lookup): boolean {
  return !task.parentId || !byId.has(task.parentId);
}

// A task's subtasks in the order they were added.
export function subtasksOf<T extends Pick<Task, "id" | "parentId" | "order">>(tasks: readonly T[], parentId: string): T[] {
  return tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

export interface SubtaskCount {
  done: number;
  total: number;
}

// How many subtasks each parent has, and how many are done: "2/5 subtasks" on the parent's row.
export function subtaskCounts(tasks: readonly Pick<Task, "parentId" | "completed">[]): Map<string, SubtaskCount> {
  const counts = new Map<string, SubtaskCount>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const c = counts.get(t.parentId) ?? { done: 0, total: 0 };
    c.total += 1;
    if (t.completed) c.done += 1;
    counts.set(t.parentId, c);
  }
  return counts;
}

// A list in its order, with each subtask moved to just under its parent when the parent is in the list too. The
// subtasks under a parent keep the list's order among themselves; one whose parent isn't listed stays where it was.
export function nestSubtasks<T extends Pick<Task, "id" | "parentId">>(sorted: readonly T[]): T[] {
  const listed = new Set(sorted.map((t) => t.id));
  const under = new Map<string, T[]>();
  for (const t of sorted) {
    if (!t.parentId || t.parentId === t.id || !listed.has(t.parentId)) continue;
    under.set(t.parentId, [...(under.get(t.parentId) ?? []), t]);
  }
  // Every task comes out once, even from data that breaks the one level (a subtask of a subtask, or a loop).
  const out: T[] = [];
  const placed = new Set<string>();
  const place = (t: T) => {
    if (placed.has(t.id)) return;
    placed.add(t.id);
    out.push(t);
    (under.get(t.id) ?? []).forEach(place);
  };
  const nested = (t: T) => !!t.parentId && t.parentId !== t.id && listed.has(t.parentId);
  sorted.filter((t) => !nested(t)).forEach(place);
  sorted.forEach(place);
  return out;
}

// A new subtask: the description typed, with its parent's company and group so it shows where the parent does. Its
// dates, people and the rest start empty: a subtask keeps its own.
export function newSubtask(parent: Pick<Task, "id" | "linkedClientId" | "taskGroup">, task: string, order = Date.now()): NewTask {
  return {
    task: task.trim(),
    parentId: parent.id,
    linkedClientId: parent.linkedClientId,
    taskGroup: parent.taskGroup,
    responsible: [],
    informed: [],
    keyPoints: "",
    startDate: "",
    endDate: "",
    order,
  };
}

// "2/5 subtasks"
export const countLabel = (c: SubtaskCount) => `${c.done}/${c.total} subtask${c.total === 1 ? "" : "s"}`;
