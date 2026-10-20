// Urgency rules (guide 5.1): one rule set everywhere. Urgency always has words;
// colour is the second signal. Done tasks never show urgency.
import { ago, daysBetween, isoOf, plural, shortDate, todayIso } from "./dates";
import type { Task } from "./types";

export type Tone = "plain" | "amber" | "red";

export interface Signal {
  tone: Tone;
  label: string;
}

// Where a task stands against its deadline: the sections of Today and the
// Due filter of All tasks.
export type DueBucket = "overdue" | "soon" | "active" | "nodate" | "later";

type Dated = Pick<Task, "startDate" | "endDate" | "completed"> & { completedAt?: number };

export function dueBucket(task: Dated, today: string = todayIso()): DueBucket {
  if (!task.endDate) return "nodate";
  const left = daysBetween(today, task.endDate);
  if (left < 0) return "overdue";
  if (left <= 3) return "soon";
  if (task.startDate && daysBetween(today, task.startDate) <= 0) return "active";
  return "later";
}

export interface DeadlineSignal {
  tone: Tone | "done" | "none";
  label: string;
}

// The deadline pill: "2 days late" (red), "Today", "Tomorrow", "In 3 days"
// (amber), "In 12 days" (plain), then the date after 30 days.
export function deadlineSignal(task: Dated, today: string = todayIso()): DeadlineSignal {
  if (task.completed) {
    return { tone: "done", label: task.completedAt ? `Done ${ago(isoOf(new Date(task.completedAt)), today)}` : "Done" };
  }
  if (!task.endDate) return { tone: "none", label: task.startDate ? "No deadline" : "No dates" };
  const left = daysBetween(today, task.endDate);
  if (left < 0) return { tone: "red", label: `${plural(-left, "day")} late` };
  if (left === 0) return { tone: "amber", label: "Today" };
  if (left === 1) return { tone: "amber", label: "Tomorrow" };
  if (left <= 3) return { tone: "amber", label: `In ${left} days` };
  if (left <= 30) return { tone: "plain", label: `In ${left} days` };
  return { tone: "plain", label: shortDate(task.endDate, today) };
}

// Days since the last action, for company tasks and for Active and Deal done
// companies: plain under 7, amber 7 to 13, red from 14 ("gone cold").
export function idleDays(lastActionDate: string | undefined, today: string = todayIso()): number | null {
  return lastActionDate ? daysBetween(lastActionDate, today) : null;
}

export const GONE_COLD_DAYS = 14;

export function lastActionSignal(lastActionDate: string | undefined, today: string = todayIso()): Signal | null {
  const n = idleDays(lastActionDate, today);
  if (n === null || !lastActionDate) return null;
  if (n >= GONE_COLD_DAYS) return { tone: "red", label: `No action for ${plural(n, "day")}` };
  if (n >= 7) return { tone: "amber", label: `Last action ${plural(n, "day")} ago` };
  return { tone: "plain", label: `Last action ${ago(lastActionDate, today)}` };
}

export function isGoneCold(lastActionDate: string | undefined, today: string = todayIso()): boolean {
  const n = idleDays(lastActionDate, today);
  return n !== null && n >= GONE_COLD_DAYS;
}

// A company's target date: amber within 3 days, red once missed.
export function targetDateSignal(target: string | undefined, today: string = todayIso()): Signal | null {
  if (!target) return null;
  const left = daysBetween(today, target);
  if (left < 0) return { tone: "red", label: `Target date missed ${plural(-left, "day")} ago` };
  if (left === 0) return { tone: "amber", label: "Target date today" };
  if (left <= 3) return { tone: "amber", label: `Target date in ${plural(left, "day")}` };
  return { tone: "plain", label: `Target date ${shortDate(target, today)}` };
}

export function isTargetClose(target: string | undefined, today: string = todayIso()): boolean {
  return !!target && daysBetween(today, target) <= 3;
}

// Planned outreach for To approach: amber once missed.
export function outreachSignal(reach: string | undefined, today: string = todayIso()): Signal | null {
  if (!reach) return null;
  const left = daysBetween(today, reach);
  if (left < 0) return { tone: "amber", label: `Planned outreach missed ${plural(-left, "day")} ago` };
  if (left === 0) return { tone: "plain", label: "Planned outreach today" };
  return { tone: "plain", label: `Planned outreach ${shortDate(reach, today)}` };
}

