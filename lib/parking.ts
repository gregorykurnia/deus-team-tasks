// Parked tasks (N19): out of the open work, so Today, Plan and the open lists leave them out and they never show as
// late, until someone brings them back or the day they were parked until comes round. Coming back on that day needs no
// write: from then on the task simply counts as open again. A finished task is never parked.
import { addDays, shortDate, todayIso } from "./dates";
import type { Task } from "./types";

export type Parkable = Pick<Task, "completed" | "parkedAt" | "parkedUntil">;

export function isParked(task: Parkable, today: string = todayIso()): boolean {
  return !task.completed && !!task.parkedAt && (!task.parkedUntil || task.parkedUntil > today);
}

// The pill a parked task shows in place of its deadline: "Parked", or "Back 3 Nov".
export function parkedLabel(task: Parkable, today: string = todayIso()): string {
  return task.parkedUntil ? `Back ${shortDate(task.parkedUntil, today)}` : "Parked";
}

// The choices of how long to park for; null waits until someone brings it back.
export function parkChoices(today: string = todayIso()): { label: string; until: string | null }[] {
  return [
    { label: "Until I bring it back", until: null },
    { label: "For a week", until: addDays(today, 7) },
    { label: "For two weeks", until: addDays(today, 14) },
    { label: "For a month", until: addDays(today, 30) },
  ];
}
