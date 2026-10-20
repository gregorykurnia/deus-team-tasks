// What Plan's Month and Day views draw (guide 4.12, 6.4): a month of day cells with deadlines and events, and one day's
// tasks split into deadline, starting and under way, with the day it first lands on. Pure, so every count and every
// wording is tested. Open tasks only: the caller leaves finished ones out.
import type { CalendarEvent } from "./calendarEvents";
import { addDays, daysBetween, isIsoDay, isoOf, isWeekend, longDayLabel, parseIso } from "./dates";
import { datesOf } from "./planTimeline";
import { weekStart, type PlanState } from "./planView";
import { eventOnDay, eventsOnDay } from "./today";
import type { Task } from "./types";

// Month and Day share one run of events: from the Monday on or before the 1st, ten weeks on. That reaches the whole month
// grid (at most six weeks) and the weeks after it, so stepping a day or choosing one nearby doesn't ask again.
export const CALENDAR_WINDOW_DAYS = 70;

export function monthWindow(month: string): { start: string; days: number } {
  return { start: weekStart(`${month}-01`), days: CALENDAR_WINDOW_DAYS };
}

// Whether a run of events reaches a day.
export function windowHas(window: { start: string; days: number }, iso: string): boolean {
  return window.start <= iso && iso < addDays(window.start, window.days);
}

// The days of events Plan asks the calendar for, whichever view is open.
export function eventsWindow(state: PlanState, today: string, timelineFrom: string, timelineDays: number): { start: string; days: number } {
  if (state.view === "month") return monthWindow(state.month ?? today.slice(0, 7));
  if (state.view === "day") return monthWindow((state.date ?? today).slice(0, 7));
  return { start: timelineFrom, days: timelineDays };
}

/* ---------- Which tasks are on a day ---------- */

// On a day: between its start and deadline, from its start when it has no deadline, or on its deadline when it has no start.
export function activeOn(task: Pick<Task, "startDate" | "endDate">, iso: string): boolean {
  const { start, end } = datesOf(task);
  if (start) return start <= iso && (!end || iso <= end);
  return end === iso;
}

export interface DayLists {
  deadline: Task[]; // the deadline is this day
  starting: Task[]; // starts this day and has a later deadline, or none
  underWay: Task[]; // started before and runs past it, soonest deadline first
  events: CalendarEvent[]; // all day first, then by start time
}

export function dayListsOf(tasks: Task[], events: CalendarEvent[] | null, iso: string): DayLists {
  const byName = (a: Task, b: Task) => a.task.localeCompare(b.task);
  const deadline: Task[] = [];
  const starting: Task[] = [];
  const underWay: Task[] = [];
  for (const task of tasks) {
    const { start, end } = datesOf(task);
    if (end === iso) deadline.push(task);
    else if (start === iso) starting.push(task);
    else if (activeOn(task, iso)) underWay.push(task);
  }
  underWay.sort((a, b) => (datesOf(a).end ?? "9").localeCompare(datesOf(b).end ?? "9") || byName(a, b));
  return { deadline: deadline.sort(byName), starting: starting.sort(byName), underWay, events: events ? eventsOnDay(events, iso) : [] };
}

export function taskCount(lists: DayLists): number {
  return lists.deadline.length + lists.starting.length + lists.underWay.length;
}

// "3 due, 1 starting, 2 under way, 4 events", the parts that aren't zero.
export function daySummary(lists: DayLists): string {
  const parts = [
    lists.deadline.length && `${lists.deadline.length.toLocaleString("en-GB")} due`,
    lists.starting.length && `${lists.starting.length.toLocaleString("en-GB")} starting`,
    lists.underWay.length && `${lists.underWay.length.toLocaleString("en-GB")} under way`,
    lists.events.length && `${lists.events.length.toLocaleString("en-GB")} ${lists.events.length === 1 ? "event" : "events"}`,
  ].filter(Boolean);
  return parts.join(", ");
}

/* ---------- The day it lands on, and the days around it ---------- */

export function somethingOn(tasks: Task[], events: CalendarEvent[] | null, iso: string): boolean {
  return tasks.some((t) => activeOn(t, iso)) || !!events?.some((e) => eventOnDay(e, iso));
}

const SEARCH_DAYS = 400;

// The next (or previous) day, from one on and within 400 days, that has a task running or an event. Each task and event
// is a run of days (a task with no deadline runs on), so the nearest day of each run is worked out, not looked for day by day.
export function dayWithSomething(tasks: Task[], events: CalendarEvent[] | null, from: string, dir: -1 | 1): string | null {
  const first = addDays(from, dir);
  const limit = addDays(from, SEARCH_DAYS * dir);
  const runs: { start: string; end: string | null }[] = [];
  for (const task of tasks) {
    const { start, end } = datesOf(task);
    if (start ?? end) runs.push({ start: (start ?? end)!, end });
  }
  for (const e of events ?? []) runs.push({ start: e.start, end: e.end });
  let best: string | null = null;
  for (const { start, end } of runs) {
    let day: string | null;
    if (dir === 1) day = end === null || end >= first ? (start > first ? start : first) : null;
    else day = start <= first ? (end !== null && end < first ? end : first) : null;
    if (!day || (dir === 1 ? day > limit : day < limit)) continue;
    if (!best || (dir === 1 ? day < best : day > best)) best = day;
  }
  return best;
}

// A day typed in the date picker: a real day, and a whole year (typing "2027" passes through "0002" and "0020").
export function isPickedDay(value: string): boolean {
  return isIsoDay(value) && Number(value.slice(0, 4)) >= 1900;
}

// The first look at Day (D5): today if anything is happening, or else the next day that has something, with a note.
export function landing(tasks: Task[], events: CalendarEvent[] | null, today: string): { date: string; landed: boolean } {
  if (somethingOn(tasks, events, today)) return { date: today, landed: false };
  const next = dayWithSomething(tasks, events, today, 1);
  return next ? { date: next, landed: true } : { date: today, landed: false };
}

// "Tuesday, 20 October", with the year when it isn't this year's.
export function dayHeading(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? longDayLabel(iso) : `${longDayLabel(iso)} ${iso.slice(0, 4)}`;
}

// "Today", "Tomorrow", "Yesterday", "In 3 days", "3 days ago".
export function relativeDay(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n.toLocaleString("en-GB")} days` : `${(-n).toLocaleString("en-GB")} days ago`;
}

export interface StripDay {
  iso: string;
  deadlines: number;
  events: number;
}

// The week the day is in, Monday to Sunday: each day's deadlines and events, for the week strip.
export function weekStrip(tasks: Task[], events: CalendarEvent[] | null, iso: string): StripDay[] {
  const first = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(first, i);
    return {
      iso: day,
      deadlines: tasks.filter((t) => datesOf(t).end === day).length,
      events: events ? events.filter((e) => eventOnDay(e, day)).length : 0,
    };
  });
}

/* ---------- The month ---------- */

export interface MonthItem {
  kind: "event" | "task";
  event?: CalendarEvent;
  task?: Task;
}

export interface MonthCell {
  iso: string;
  day: number;
  outside: boolean; // a day of the week before or after the month
  today: boolean;
  weekend: boolean;
  busy: boolean; // three deadlines, or five things in all
  deadlines: Task[];
  events: CalendarEvent[];
  items: MonthItem[]; // events first, then tasks
}

export interface MonthModel {
  month: string;
  cells: MonthCell[];
  total: number; // deadlines and events inside the month
}

export const CELL_ROOM = 4; // lines a cell shows: with more, three and a count

export function isBusy(deadlines: number, events: number): boolean {
  return deadlines >= 3 || deadlines + events >= 5;
}

export function monthModelOf(tasks: Task[], events: CalendarEvent[] | null, month: string, today: string): MonthModel {
  const [y, m] = month.split("-").map(Number);
  const first = isoOf(new Date(y, m - 1, 1));
  const last = isoOf(new Date(y, m, 0));
  const start = weekStart(first);
  const weeks = Math.ceil((daysBetween(start, last) + 1) / 7);
  const byName = (a: Task, b: Task) => a.task.localeCompare(b.task);
  let total = 0;
  const cells: MonthCell[] = Array.from({ length: weeks * 7 }, (_, i) => {
    const iso = addDays(start, i);
    const outside = iso.slice(0, 7) !== month;
    const deadlines = tasks.filter((t) => datesOf(t).end === iso).sort(byName);
    const list = events ? eventsOnDay(events, iso) : [];
    if (!outside) total += deadlines.length + list.length;
    return {
      iso,
      day: parseIso(iso).getDate(),
      outside,
      today: iso === today,
      weekend: isWeekend(iso),
      busy: isBusy(deadlines.length, list.length),
      deadlines,
      events: list,
      items: [...list.map((event) => ({ kind: "event" as const, event })), ...deadlines.map((task) => ({ kind: "task" as const, task }))],
    };
  });
  return { month, cells, total };
}

// What a cell shows of its items: all of them, or three and "N more".
export function cellShown(items: MonthItem[]): { shown: MonthItem[]; more: number } {
  if (items.length <= CELL_ROOM) return { shown: items, more: 0 };
  const shown = items.slice(0, CELL_ROOM - 1);
  return { shown, more: items.length - shown.length };
}

// The next month, within two years, that has a deadline or an event; for the empty month's "Go to".
export function nextMonthWithSomething(tasks: Task[], events: CalendarEvent[] | null, month: string): string | null {
  const [y, m] = month.split("-").map(Number);
  for (let k = 1; k <= 24; k++) {
    const ym = isoOf(new Date(y, m - 1 + k, 1)).slice(0, 7);
    if (tasks.some((t) => datesOf(t).end?.slice(0, 7) === ym) || events?.some((e) => e.start.slice(0, 7) === ym)) return ym;
  }
  return null;
}
