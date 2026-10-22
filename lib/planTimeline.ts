// What the Plan timeline draws (guide 4.12, 6.4): four weeks of days, a row of deadline counts, the team calendar's
// counts per day, and lanes of bars, one lane for each person or kind of work. Pure, so every placement and wording is
// tested. Open tasks only: the caller leaves finished ones out.
import type { CalendarEvent } from "./calendarEvents";
import { daysBetween, isIsoDay, plural, shortDate, weekdayDate } from "./dates";
import { kindOf, KIND_LABELS, KINDS, type CompaniesById, type Kind } from "./kinds";
import { isPerson } from "./people";
import { busiestDay, crunchDays, daysFrom, deadlinesPerDay, quietStretch } from "./planMath";
import { eventOnDay } from "./today";
import type { PlanRows, PlanState } from "./planView";
import { TIMELINE_DAYS } from "./planView";
import type { Task } from "./types";

// A row per kind of work is named as the prototype names it: "Prospect work", not the filter's "Prospects".
const LANE_NAMES: Record<Kind, string> = { prospect: "Prospect work", client: "Client work", internal: KIND_LABELS.internal };

export const LANE_CAP = 4; // rows of bars a lane shows before "Show more"
export const NOBODY = "";

// Who and what the plan narrows to: a person (their tasks and the ones they're kept informed on), a kind of work or a
// task group.
export function planTasks(open: Task[], state: Pick<PlanState, "kind" | "group" | "person">, companies: CompaniesById): Task[] {
  let list = open;
  if (state.kind) list = list.filter((t) => kindOf(t, companies) === state.kind);
  else if (state.group) list = list.filter((t) => t.taskGroup === state.group);
  if (state.person) list = list.filter((t) => t.responsible.includes(state.person!) || t.informed.some((i) => i.name === state.person));
  return list;
}

export interface Bar {
  task: Task;
  kind: Kind;
  first: number; // the first column it covers, from 0
  last: number; // the last column
  clipLeft: boolean; // it started before the first day
  clipRight: boolean; // it ends after the last day
  openEnd: boolean; // no deadline: it fades out to the right
  diamond: boolean; // a deadline only, or a one-day task
  late: boolean; // the deadline has gone by
  informed: boolean; // the person shown is only kept informed
  row: number; // the line it sits on in its lane
  inside: boolean; // its words fit inside the bar
  span: number; // columns it takes with its words, if they sit beside it
  columns: number; // columns the bar itself covers
}

export type Unplaced = Omit<Bar, "row" | "inside" | "span" | "columns">;

export interface Lane {
  key: string;
  name: string;
  person?: string;
  kind?: Kind;
  bars: Bar[];
  rows: number;
  owned: number;
  informed: number;
  peak: { count: number; iso: string } | null; // most tasks running at once from today on
}

export interface Dates {
  start: string | null;
  end: string | null;
}

// A task's dates as the plan reads them: a deadline only, a start only, or both (the earlier first).
export function datesOf(task: Pick<Task, "startDate" | "endDate">): Dates {
  const start = isIsoDay(task.startDate) ? task.startDate : null;
  const end = isIsoDay(task.endDate) ? task.endDate : null;
  if (start && end && start > end) return { start: end, end: start };
  return { start, end };
}

// Bars are placed on the least busy line they fit. A bar whose words don't fit inside takes the room beside it too, so
// the next one starts after the words.
export function pack(bars: Unplaced[], columnWidth: number): { placed: Bar[]; rows: number } {
  const ordered = bars.slice().sort((a, b) => a.first - b.first || b.last - a.last);
  const ends: number[] = [];
  const placed = ordered.map((bar) => {
    const columns = bar.diamond ? 1 : bar.last - bar.first + 1;
    const words = Math.min(200, bar.task.task.length * 6.9 + 18);
    const wordColumns = Math.ceil(words / columnWidth);
    const inside = !bar.diamond && columns * columnWidth >= 92;
    const taken = inside ? columns : columns + wordColumns;
    let row = ends.findIndex((end) => end <= bar.first);
    if (row === -1) {
      row = ends.length;
      ends.push(0);
    }
    ends[row] = bar.first + taken;
    return { ...bar, row, inside, span: Math.min(TIMELINE_DAYS - bar.first, taken), columns };
  });
  return { placed, rows: ends.length };
}

// A summary chip above the timeline: words around a bold part, linking to a day or to All tasks.
export interface Insight {
  key: "busiest" | "quiet" | "before" | "undated";
  tone: "warm" | "calm" | "red" | "plain";
  lead: string;
  bold: string;
  tail: string;
  href?: string; // All tasks, filtered
  day?: string; // opens Plan's day
}

export interface Timeline {
  days: string[];
  todayIndex: number; // -1 when today isn't in these weeks
  deadlines: number[]; // deadlines per day, counting the tasks shown
  eventCounts: number[];
  allDay: boolean[]; // a day with an all-day event
  crunch: Set<string>;
  lanes: Lane[];
  insights: Insight[];
  undated: number;
  before: number; // overdue tasks that ended before the first day
}

interface TimelineInput {
  tasks: Task[]; // the open tasks to show (none when only events are shown)
  events: CalendarEvent[] | null; // null when the calendar isn't available or isn't shown
  from: string;
  today: string;
  rows: PlanRows;
  person: string | null;
  companies: CompaniesById;
  columnWidth: number;
  listHref?: string; // where the chips link: All tasks, or narrowed to the Work filter's kind or task group
}

// A chip's link: the list it narrows, with the due filter on top.
function dueHref(listHref: string, due: "overdue" | "nodate"): string {
  return `${listHref}${listHref.includes("?") ? "&" : "?"}due=${due}`;
}

export function timelineOf({ tasks, events, from, today, rows, person, companies, columnWidth, listHref = "/tasks" }: TimelineInput): Timeline {
  const days = daysFrom(from, TIMELINE_DAYS);
  const last = TIMELINE_DAYS - 1;
  const index = (iso: string) => daysBetween(from, iso);
  const deadlines = deadlinesPerDay(tasks, days);
  const eventCounts = days.map((d) => (events ? events.filter((e) => eventOnDay(e, d)).length : 0));
  const allDay = days.map((d) => !!events && events.some((e) => e.allDay && eventOnDay(e, d)));
  const crunch = crunchDays(days, deadlines, eventCounts, today);

  let undated = 0;
  let before = 0;
  const bars: Unplaced[] = [];
  for (const task of tasks) {
    const { start, end } = datesOf(task);
    const first = start ?? end;
    if (!first) {
      undated++;
      continue;
    }
    const s = index(first);
    const e = end ? index(end) : last;
    if (e < 0) {
      if (end && end < today) before++;
      continue;
    }
    if (s > last) continue;
    bars.push({
      task,
      kind: kindOf(task, companies),
      first: Math.max(0, s),
      last: Math.min(last, e),
      clipLeft: s < 0,
      clipRight: !!end && e > last,
      openEnd: !end,
      diamond: !!end && (!start || start === end) && s >= 0,
      late: !!end && end < today,
      informed: !!person && !task.responsible.includes(person),
    });
  }

  const lanesOf = (name: string, key: string, items: typeof bars, extra: Partial<Lane>): Lane => {
    const { placed, rows: lines } = pack(items, columnWidth);
    let peak: Lane["peak"] = null;
    for (let i = Math.max(0, index(today)); i <= last; i++) {
      const count = placed.filter((b) => b.first <= i && i <= b.last).length;
      if (count > (peak?.count ?? 0)) peak = { count, iso: days[i] };
    }
    const owned = placed.filter((b) => !b.informed).length;
    return { key, name, bars: placed, rows: lines, owned, informed: placed.length - owned, peak, ...extra };
  };

  let lanes: Lane[];
  if (person) {
    lanes = [lanesOf(person, person, bars, { person })];
  } else if (rows === "kind") {
    lanes = KINDS.map((kind) => lanesOf(LANE_NAMES[kind], kind, bars.filter((b) => b.kind === kind), { kind })).filter((l) => l.bars.length);
  } else {
    const byPerson = new Map<string, typeof bars>();
    for (const bar of bars) {
      const names = [...new Set(bar.task.responsible.filter(isPerson))];
      for (const name of names.length ? names : [NOBODY]) byPerson.set(name, [...(byPerson.get(name) ?? []), bar]);
    }
    lanes = [...byPerson]
      .map(([name, items]) => lanesOf(name || "Nobody responsible", name || "-", items, name ? { person: name } : {}))
      .sort((a, b) => Number(!a.person) - Number(!b.person) || b.bars.length - a.bars.length || a.name.localeCompare(b.name));
  }

  const insights: Insight[] = [];
  if (tasks.length) {
    const busiest = busiestDay(days, deadlines, eventCounts, today);
    if (busiest) {
      const i = index(busiest);
      const events = eventCounts[i] ? ` and ${plural(eventCounts[i], "event")}` : "";
      insights.push({ key: "busiest", tone: "warm", lead: "Busiest: ", bold: weekdayDate(busiest, today), tail: `, ${plural(deadlines[i], "deadline")}${events}`, day: busiest });
    }
    const quiet = quietStretch(days, tasks, eventCounts, today);
    if (quiet) {
      insights.push({ key: "quiet", tone: "calm", lead: "Quiet stretch: ", bold: `${shortDate(quiet.start, today)} to ${shortDate(quiet.end, today)}`, tail: ", nothing due" });
    }
    if (before) {
      insights.push({ key: "before", tone: "red", lead: "", bold: plural(before, "overdue task"), tail: ` ended before ${shortDate(from, today)}`, href: dueHref(listHref, "overdue") });
    }
    if (undated) {
      const many = undated !== 1;
      insights.push({ key: "undated", tone: "plain", lead: "", bold: plural(undated, "task"), tail: ` ${many ? "have" : "has"} no dates, so ${many ? "they aren't" : "it isn't"} shown`, href: dueHref(listHref, "nodate") });
    }
  }

  return { days, todayIndex: index(today) >= 0 && index(today) <= last ? index(today) : -1, deadlines, eventCounts, allDay, crunch, lanes, insights, undated, before };
}

