// Dates and load for the plan: task ranges, what's on a day, crunch days,
// quiet stretches and each person's load (D1 to D6).
import { addDays, daysBetween, isIsoDay, isWeekend, todayIso } from "./dates";
import { isPerson } from "./people";
import type { Task } from "./types";

type Dated = Pick<Task, "startDate" | "endDate">;

export interface DayRange {
  start: string;
  end: string;
}

// A task's days on the plan: start to deadline, or a single day when only one
// of the two is set. Null for a task with no dates (D3).
export function taskRange(task: Dated): DayRange | null {
  const s = isIsoDay(task.startDate) ? task.startDate : null;
  const e = isIsoDay(task.endDate) ? task.endDate : null;
  if (s && e) return s <= e ? { start: s, end: e } : { start: e, end: s };
  if (e) return { start: e, end: e };
  if (s) return { start: s, end: s };
  return null;
}

// The span that shows every dated task, with a margin either side.
export function spanOf(tasks: Dated[], today: string = todayIso(), before = 2, after = 3, minDays = 7): { start: string; days: number } {
  const ranges = tasks.map(taskRange).filter((r): r is DayRange => r !== null);
  if (ranges.length === 0) return { start: addDays(today, -before), days: 30 };
  const first = ranges.reduce((m, r) => (r.start < m ? r.start : m), ranges[0].start);
  const last = ranges.reduce((m, r) => (r.end > m ? r.end : m), ranges[0].end);
  const start = addDays(first, -before);
  return { start, days: Math.max(daysBetween(start, addDays(last, after)), minDays) };
}

// Active on a day: between its start and deadline, or due that day when it has
// no start.
export function isOnDay(task: Dated, day: string): boolean {
  if (task.startDate) return task.startDate <= day && (!task.endDate || day <= task.endDate);
  return task.endDate === day;
}

export function tasksOnDay<T extends Dated>(tasks: T[], day: string): T[] {
  return tasks.filter((t) => isOnDay(t, day));
}

export type DayRole = "single" | "starts" | "ends" | "ongoing";

export function dayRole(task: Dated, day: string): DayRole {
  if (task.startDate === task.endDate) return "single";
  if (task.startDate === day) return "starts";
  if (task.endDate === day) return "ends";
  return "ongoing";
}

// The first day to show (D5): today if anything is on, else the next day
// something starts, else today.
export function firstDayToShow(tasks: Dated[], today: string = todayIso()): string {
  if (tasks.some((t) => isOnDay(t, today))) return today;
  const next = tasks
    .map((t) => t.startDate)
    .filter((s) => s && s >= today)
    .sort()[0];
  return next ?? today;
}

// Each task under every day it covers (at most 400 days per task).
export function tasksByDay<T extends Dated>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    const r = taskRange(t);
    if (!r) continue;
    let day = r.start;
    for (let guard = 0; day <= r.end && guard < 400; guard++, day = addDays(day, 1)) {
      const list = map.get(day) ?? [];
      list.push(t);
      map.set(day, list);
    }
  }
  return map;
}

export function daysFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function deadlinesPerDay(tasks: Dated[], days: string[]): number[] {
  const counts = new Map<string, number>();
  for (const t of tasks) if (t.endDate) counts.set(t.endDate, (counts.get(t.endDate) ?? 0) + 1);
  return days.map((d) => counts.get(d) ?? 0);
}

// Crunch days (guide 5.1, D1): at least 2 deadlines, well above the average
// load, from today on. Events count half. At most the 4 busiest.
export function crunchDays(days: string[], deadlines: number[], events: number[], today: string = todayIso()): Set<string> {
  const score = days.map((_, i) => deadlines[i] + (events[i] ?? 0) * 0.5);
  const avg = score.reduce((a, b) => a + b, 0) / Math.max(1, days.length);
  const threshold = Math.max(3, Math.ceil(avg * 1.8));
  return new Set(
    days
      .map((day, i) => ({ day, i }))
      .filter(({ day, i }) => day >= today && deadlines[i] >= 2 && score[i] >= threshold)
      .sort((a, b) => score[b.i] - score[a.i])
      .slice(0, 4)
      .map(({ day }) => day)
  );
}

// The busiest day from today on, when it has at least 2 deadlines.
export function busiestDay(days: string[], deadlines: number[], events: number[], today: string = todayIso()): string | null {
  let best = -1;
  days.forEach((day, i) => {
    if (day < today) return;
    const s = deadlines[i] + (events[i] ?? 0) * 0.5;
    if (best < 0 || s > deadlines[best] + (events[best] ?? 0) * 0.5) best = i;
  });
  return best >= 0 && deadlines[best] >= 2 ? days[best] : null;
}

// The longest run of weekdays from today with nothing due, starting or on the
// calendar. At least 2 days, or null.
export function quietStretch(days: string[], tasks: Dated[], events: number[], today: string = todayIso()): DayRange | null {
  const deadlines = deadlinesPerDay(tasks, days);
  const starts = new Set(tasks.map((t) => t.startDate).filter(Boolean));
  let best: { start: string; end: string; n: number } | null = null;
  let run: { start: string; end: string; n: number } | null = null;
  days.forEach((day, i) => {
    if (day < today || isWeekend(day)) return;
    if (!deadlines[i] && !(events[i] ?? 0) && !starts.has(day)) {
      run = run ? { ...run, end: day, n: run.n + 1 } : { start: day, end: day, n: 1 };
      if (!best || run.n > best.n) best = run;
    } else {
      run = null;
    }
  });
  const found = best as { start: string; end: string; n: number } | null;
  return found && found.n >= 2 ? { start: found.start, end: found.end } : null;
}

export interface PersonLoad {
  name: string;
  owned: number; // open tasks they're responsible for
  informed: number; // open tasks they're kept informed on
  nextDeadline: string | null;
}

// Everyone's open load, most owned first (D6, Today's "Who's carrying what").
export function loadPerPerson(tasks: Task[], today: string = todayIso()): PersonLoad[] {
  const map = new Map<string, PersonLoad>();
  const get = (name: string) => {
    let p = map.get(name);
    if (!p) map.set(name, (p = { name, owned: 0, informed: 0, nextDeadline: null }));
    return p;
  };
  for (const t of tasks) {
    if (t.completed) continue;
    for (const name of new Set(t.responsible.filter(isPerson))) {
      const p = get(name);
      p.owned++;
      if (t.endDate && t.endDate >= today && (!p.nextDeadline || t.endDate < p.nextDeadline)) p.nextDeadline = t.endDate;
    }
    for (const name of new Set(t.informed.map((i) => i.name).filter(isPerson))) get(name).informed++;
  }
  return [...map.values()].sort((a, b) => b.owned - a.owned || b.informed - a.informed || a.name.localeCompare(b.name));
}

// What one person owns, and what they're only kept informed on, with their part.
export function tasksForPerson<T extends Task>(tasks: T[], name: string): { owned: T[]; informed: { task: T; note?: string }[] } {
  return {
    owned: tasks.filter((t) => t.responsible.includes(name)),
    informed: tasks.flatMap((t) => {
      const p = t.informed.find((i) => i.name === name);
      return p ? [{ task: t, note: p.note }] : [];
    }),
  };
}
