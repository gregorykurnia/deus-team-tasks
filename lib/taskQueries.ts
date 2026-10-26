// Finding, narrowing and ordering tasks (guide 5.6, 5.7), and the sections of Today.
import { daysBetween, isoOf, todayIso } from "./dates";
import { kindOf, linkedCompany, type CompaniesById, type Kind } from "./kinds";
import { isParked } from "./parking";
import { taskStatus, type TaskStatus } from "./taskStatus";
import { dueBucket, idleDays, type DueBucket } from "./urgency";
import type { Task, TaskType } from "./types";

export type TaskView = "open" | "parked" | "done";

export interface TaskFilter {
  view?: TaskView; // open, parked or done; leave out for every task
  kind?: Kind | "all";
  group?: string | null; // a task group's name
  search?: string;
  due?: Exclude<DueBucket, "later"> | null;
  status?: Exclude<TaskStatus, "done"> | null; // To Do or In Progress, open tasks only
  minIdleDays?: number | null; // "No action for", company tasks only
  type?: TaskType | "-" | null; // "-" means no task type
  finishedWithinDays?: number | null; // Done view: 7, 30, or any time
}

export interface QueryContext {
  companies: CompaniesById;
  today?: string;
}

type TaskWithDone = Task & { completedAt?: number };

// Open is neither finished nor parked (lib/parking).
export function isOpen(task: Pick<Task, "completed" | "parkedAt" | "parkedUntil">, today: string = todayIso()): boolean {
  return !task.completed && !isParked(task, today);
}

export function matchesSearch(task: Task, query: string, ctx: QueryContext): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const company = linkedCompany(task, ctx.companies);
  return [
    task.task,
    company?.company,
    task.taskGroup,
    task.taskType,
    task.touchPoint,
    task.keyPoints,
    ...task.responsible,
    ...task.informed.map((p) => `${p.name} ${p.note ?? ""}`),
  ].some((v) => typeof v === "string" && v.toLowerCase().includes(q));
}

export function filterTasks<T extends TaskWithDone>(tasks: T[], filter: TaskFilter, ctx: QueryContext): T[] {
  const today = ctx.today ?? todayIso();
  const view = filter.view;
  return tasks.filter((t) => {
    if (view === "open" && !isOpen(t, today)) return false;
    if (view === "parked" && !isParked(t, today)) return false;
    if (view === "done" && !t.completed) return false;
    if (filter.group != null) {
      if (t.taskGroup !== filter.group) return false;
    } else if (filter.kind && filter.kind !== "all" && kindOf(t, ctx.companies) !== filter.kind) {
      return false;
    }
    if (filter.search && !matchesSearch(t, filter.search, ctx)) return false;
    if (view === "open" || view === undefined) {
      if (filter.due && dueBucket(t, today) !== filter.due) return false;
      if (filter.status && taskStatus(t) !== filter.status) return false;
      if (filter.minIdleDays != null) {
        if (!linkedCompany(t, ctx.companies)) return false;
        const idle = idleDays(t.lastActionDate, today);
        if (idle === null || idle < filter.minIdleDays) return false;
      }
    } else if (view === "done" && filter.finishedWithinDays != null) {
      // Tasks finished before completedAt was recorded have no date (N1).
      if (!t.completedAt) return false;
      if (daysBetween(isoOf(new Date(t.completedAt)), today) >= filter.finishedWithinDays) return false;
    }
    if (filter.type === "-" && t.taskType) return false;
    if (filter.type && filter.type !== "-" && t.taskType !== filter.type) return false;
    return true;
  });
}

export type TaskSortKey = "end" | "start" | "last" | "about" | "group" | "type" | "desc" | "prio" | "doneAt" | "back";
export type SortDir = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function sortValue(t: TaskWithDone, key: TaskSortKey, ctx: QueryContext): string | number | null {
  switch (key) {
    case "end":
      return t.endDate || null;
    case "start":
      return t.startDate || null;
    case "last":
      return t.lastActionDate || null;
    case "doneAt":
      return t.completedAt ?? null;
    case "back":
      return t.parkedUntil || null;
    case "about": {
      const name = linkedCompany(t, ctx.companies)?.company;
      return name ? name.toLowerCase() : null;
    }
    case "group":
      return t.taskGroup ? t.taskGroup.toLowerCase() : null;
    case "type":
      return t.taskType ? t.taskType.toLowerCase() : null;
    case "desc":
      return t.task.toLowerCase();
    case "prio":
      return t.priority ? PRIORITY_RANK[t.priority] : null;
  }
}

// Empty values always go last, whichever way round (guide 5.6). Ties keep the
// tasks' own order.
export function sortTasks<T extends TaskWithDone>(tasks: T[], key: TaskSortKey, dir: SortDir, ctx: QueryContext): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return tasks
    .map((t, i) => ({ t, i, v: sortValue(t, key, ctx) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      if (a.v < b.v) return -sign;
      if (a.v > b.v) return sign;
      return a.i - b.i;
    })
    .map((x) => x.t);
}

// Defaults: deadline, earliest first. Prospect work by latest deadline first
// (W14). Finished tasks most recent first, parked ones by the first back.
export function defaultSort(view: TaskView, kind: Kind | "all", inGroup: boolean): { key: TaskSortKey; dir: SortDir } {
  if (view === "done") return { key: "doneAt", dir: "desc" };
  if (view === "parked") return { key: "back", dir: "asc" };
  if (kind === "prospect" && !inGroup) return { key: "end", dir: "desc" };
  return { key: "end", dir: "asc" };
}

export interface TodaySections<T> {
  overdue: T[];
  soon: T[]; // due in the next 3 days
  active: T[]; // under way today
  nodate: T[]; // needs a date
}

// Today's "Needs attention": open tasks that are overdue, due in the next
// three days, under way today, or missing a date.
export function todaySections<T extends TaskWithDone>(tasks: T[], ctx: QueryContext): TodaySections<T> {
  const today = ctx.today ?? todayIso();
  const open = tasks.filter((t) => isOpen(t, today));
  const by = (bucket: DueBucket) => sortTasks(open.filter((t) => dueBucket(t, today) === bucket), "end", "asc", ctx);
  return { overdue: by("overdue"), soon: by("soon"), active: by("active"), nodate: by("nodate") };
}

// Long lists fold (guide 5.7): Today shows 6 per section, lists 100 rows.
export function fold<T>(items: T[], limit: number): { shown: T[]; hidden: number } {
  return { shown: items.slice(0, limit), hidden: Math.max(0, items.length - limit) };
}

export function countByKind(tasks: Task[], companies: CompaniesById): Record<Kind, number> {
  const counts: Record<Kind, number> = { prospect: 0, client: 0, internal: 0 };
  for (const t of tasks) counts[kindOf(t, companies)]++;
  return counts;
}

