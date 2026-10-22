// What a task row shows (guide 4.6, 5.1, 5.2). One function, so the card, list, day and record rows all say the same
// thing: the kind of work, the badge, where the task belongs, the last action and the deadline in words.
import { isoOf, parseIso } from "./dates";
import { kindOf, linkedCompany, type CompaniesById, type Kind } from "./kinds";
import { isParked } from "./parking";
import { initials } from "./people";
import type { Task } from "./types";
import { deadlineSignal, lastActionSignal, type DeadlineSignal, type Signal } from "./urgency";

export type RowBadge = { kind: "team" } | { kind: "company"; initials: string };

export interface RowModel {
  kind: Kind;
  badge: RowBadge; // the company's initials, or the team icon for internal work
  place: string | null; // the company's name, or the task group's for internal work
  touchPoint: string | null;
  highPriority: boolean; // "High priority", shown for internal work only
  lastAction: Signal | null; // company tasks only; never on a finished task
  deadline: DeadlineSignal;
  deadlineTitle: string; // the full date, for hover
  done: boolean;
  parked: boolean; // out of the open work until it comes back (lib/parking)
}

// "Tue 20 Oct"
function longDate(iso: string): string {
  const d = parseIso(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
}

export function taskRowModel(task: Task, companies: CompaniesById, today?: string): RowModel {
  const kind = kindOf(task, companies);
  const company = linkedCompany(task, companies);
  const done = !!task.completed;
  const parked = isParked(task, today);

  let deadlineTitle = "No deadline set";
  if (done) deadlineTitle = task.completedAt ? `Finished ${longDate(isoOf(new Date(task.completedAt)))}` : "Done";
  else if (parked) deadlineTitle = task.parkedUntil ? `Parked until ${longDate(task.parkedUntil)}` : "Parked until someone brings it back";
  else if (task.endDate) deadlineTitle = `Deadline ${longDate(task.endDate)}`;

  return {
    kind,
    badge: company ? { kind: "company", initials: initials(company.company) } : { kind: "team" },
    place: company?.company ?? task.taskGroup ?? null,
    touchPoint: task.touchPoint || null,
    highPriority: kind === "internal" && task.priority === "High",
    lastAction: company && !done && !parked ? lastActionSignal(task.lastActionDate, today) : null,
    deadline: deadlineSignal(task, today),
    deadlineTitle,
    done,
    parked,
  };
}
