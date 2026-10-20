// What Today says (guide 6.1, 4.12, 5.1): the hero's sentence and chips, the two-week chart, the sections of Needs
// attention, and who carries what. Pure, so every wording and count is tested. Tasks passed in are the ones to count:
// finished ones are left out by the caller, except where a name says it keeps them.
import type { CalendarEvent } from "./calendarEvents";
import { addDays, dayLabel, daysBetween, isoOf, isWeekend, plural } from "./dates";
import { kindOf, linkedCompany, type CompaniesById, type Kind } from "./kinds";
import { isPerson } from "./people";
import { loadPerPerson, type PersonLoad } from "./planMath";
import { fold, sortTasks } from "./taskQueries";
import type { Task } from "./types";
import { dueBucket, deadlineSignal, isGoneCold, type DueBucket } from "./urgency";

type DoneTask = Task & { completedAt?: number };

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// "Two" up to ten, then the number: a sentence starts with it.
export function countWord(n: number): string {
  return n <= 10 ? WORDS[n] : n.toLocaleString("en-GB");
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export type ChipTone = "red" | "amber" | "int" | "quiet";

export interface HeroChip {
  key: "overdue" | "soon" | "gone-cold" | "nodate";
  count: number;
  label: string;
  tone: ChipTone;
  href: string; // into All tasks, filtered
}

export interface Hero {
  empty: boolean; // no tasks at all: "Nothing on the list yet"
  headline: string;
  lede: string;
  chips: HeroChip[];
  kinds: Record<Kind, number>; // open tasks by kind of work
}

// Open tasks only. `all` is every task, to count what was finished in the last seven days.
export function heroOf(open: DoneTask[], all: DoneTask[], companies: CompaniesById, today: string): Hero {
  const kinds: Record<Kind, number> = { prospect: 0, client: 0, internal: 0 };
  for (const t of open) kinds[kindOf(t, companies)]++;
  if (all.length === 0) {
    return {
      empty: true,
      headline: "Nothing on the list yet",
      lede: "Add the first thing that needs doing. A sentence is enough, and dates and people can come later.",
      chips: [],
      kinds,
    };
  }

  const bucket = (b: DueBucket) => open.filter((t) => dueBucket(t, today) === b);
  const overdue = bucket("overdue");
  const soon = bucket("soon");
  const nodate = bucket("nodate");
  const cold = open.filter((t) => linkedCompany(t, companies) && isGoneCold(t.lastActionDate, today));
  const coldCompanies = new Set(cold.map((t) => t.linkedClientId));

  const parts: string[] = [];
  if (overdue.length) parts.push(`${countWord(overdue.length)} ${overdue.length === 1 ? "task is" : "tasks are"} overdue`);
  else if (soon.length) parts.push(`${countWord(soon.length)} ${soon.length === 1 ? "task is" : "tasks are"} due in the next three days`);
  if (coldCompanies.size) {
    const word = countWord(coldCompanies.size);
    parts.push(`${parts.length ? lowerFirst(word) : word} ${coldCompanies.size === 1 ? "company has" : "companies have"} gone quiet`);
  }
  const headline = parts.length ? parts.join(" and ") : "Nothing is due in the next three days";

  const first = [...overdue].sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const next = open.filter((t) => t.endDate && daysBetween(today, t.endDate) > 3).sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const finished = all.filter((t) => t.completed && t.completedAt && daysBetween(isoOf(new Date(t.completedAt)), today) < 7).length;
  let lede = "";
  if (first) {
    const company = linkedCompany(first, companies);
    lede = `Start with ${company ? company.company : `“${first.task}”`}, it's ${deadlineSignal(first, today).label}. `;
  } else if (next) {
    lede = `The next deadline is ${dayLabel(next.endDate)}: ${next.task}. `;
  }
  lede += `${plural(finished, "task")} finished in the last seven days.`;

  const chips: HeroChip[] = [];
  if (overdue.length) chips.push({ key: "overdue", count: overdue.length, label: "Overdue", tone: "red", href: "/tasks?due=overdue" });
  if (soon.length) chips.push({ key: "soon", count: soon.length, label: "Due in 3 days", tone: "amber", href: "/tasks?due=soon" });
  if (cold.length) chips.push({ key: "gone-cold", count: cold.length, label: "No action for 14+ days", tone: "int", href: "/tasks?idle=14" });
  if (nodate.length) chips.push({ key: "nodate", count: nodate.length, label: "Need a date", tone: "quiet", href: "/tasks?due=nodate" });
  return { empty: false, headline, lede, chips, kinds };
}

/* ---------- Two weeks ---------- */

export interface ChartDay {
  iso: string;
  label: string; // "Thu 23"
  prospect: number;
  client: number;
  internal: number;
  events: number;
  weekend: boolean;
  today: boolean;
  summary: string; // "Thu 23: 3 deadlines, 1 event"
}

export interface TwoWeeks {
  days: ChartDay[];
  max: number; // the tallest column, in deadlines (events count 0.6 each, at most 6)
  callout: { text: string; calm: boolean };
}

export const CHART_DAYS = 14;
const EVENT_WEIGHT = 0.6;
const EVENT_CAP = 6;

// Whether a calendar event covers a day (its end is inclusive).
export function eventOnDay(e: Pick<CalendarEvent, "start" | "end">, iso: string): boolean {
  return e.start <= iso && iso <= e.end;
}

// `events` is null when the calendar is unavailable: no event bars then.
export function twoWeeksOf(open: Task[], events: CalendarEvent[] | null, companies: CompaniesById, today: string): TwoWeeks {
  const days: ChartDay[] = [];
  for (let i = 0; i < CHART_DAYS; i++) {
    const iso = addDays(today, i);
    const due = open.filter((t) => t.endDate === iso);
    const count = (k: Kind) => due.filter((t) => kindOf(t, companies) === k).length;
    const n = events ? events.filter((e) => eventOnDay(e, iso)).length : 0;
    const label = dayLabel(iso);
    const deadlines = due.length;
    days.push({
      iso,
      label,
      prospect: count("prospect"),
      client: count("client"),
      internal: count("internal"),
      events: n,
      weekend: isWeekend(iso),
      today: i === 0,
      summary: `${label}: ${plural(deadlines, "deadline")}${n ? `, ${plural(n, "event")}` : ""}`,
    });
  }
  const height = (d: ChartDay) => d.prospect + d.client + d.internal + Math.min(d.events, EVENT_CAP) * EVENT_WEIGHT;
  const max = Math.max(4, ...days.map(height));
  const busiest = days.reduce((best, d) => (d.prospect + d.client + d.internal > best.prospect + best.client + best.internal ? d : best), days[0]);
  const most = busiest.prospect + busiest.client + busiest.internal;
  const callout =
    most >= 3
      ? { text: `${busiest.label} is the busiest, with ${plural(most, "deadline")}`, calm: false }
      : { text: most ? "No crunch ahead" : "No deadlines in the next two weeks", calm: true };
  return { days, max, callout };
}

// A column's segments as shares of the tallest column, in stacking order from the bottom.
export function segmentShares(d: ChartDay, max: number): { kind: "prospect" | "client" | "internal" | "event"; share: number }[] {
  const parts = [
    { kind: "prospect" as const, n: d.prospect },
    { kind: "client" as const, n: d.client },
    { kind: "internal" as const, n: d.internal },
    { kind: "event" as const, n: Math.min(d.events, EVENT_CAP) * EVENT_WEIGHT },
  ];
  return parts.filter((p) => p.n > 0).map((p) => ({ kind: p.kind, share: p.n / max }));
}

/* ---------- Needs attention ---------- */

export const SECTION_LIMIT = 6;

export type SectionKey = "overdue" | "soon" | "active" | "nodate";

export interface AttentionSection {
  key: SectionKey;
  label: string;
  count: number; // the section's open tasks, before it folds
  shown: DoneTask[]; // at most six, soonest deadline first
  hidden: number;
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  overdue: "Overdue",
  soon: "Due in the next 3 days",
  active: "Under way today",
  nodate: "Needs a date",
};

const SECTION_ORDER: SectionKey[] = ["overdue", "soon", "active", "nodate"];

export interface Attention {
  counts: Record<Kind | "all", number>; // open tasks needing attention, by kind
  sections: AttentionSection[]; // those with tasks, for the chosen kind
  none: boolean; // nothing needs attention for the chosen kind
  calm: boolean; // sections exist, but none overdue or due soon (a green notice)
}

// `tasks` are the ones to list: open, and any just marked done that are still on their way out. Those stay in their
// section but no longer count.
export function attentionOf(tasks: DoneTask[], kind: Kind | "all", companies: CompaniesById, today: string): Attention {
  const needing = tasks.filter((t) => ["overdue", "soon", "active", "nodate"].includes(dueBucket(t, today)));
  const counts: Attention["counts"] = { all: 0, prospect: 0, client: 0, internal: 0 };
  for (const t of needing) {
    if (t.completed) continue;
    counts.all++;
    counts[kindOf(t, companies)]++;
  }
  const list = kind === "all" ? needing : needing.filter((t) => kindOf(t, companies) === kind);
  const ctx = { companies, today };
  const sections = SECTION_ORDER.map((key) => {
    const inSection = sortTasks(list.filter((t) => dueBucket(t, today) === key), "end", "asc", ctx);
    const { shown, hidden } = fold(inSection, SECTION_LIMIT);
    return { key, label: SECTION_LABELS[key], count: inSection.filter((t) => !t.completed).length, shown, hidden };
  }).filter((s) => s.shown.length > 0);
  const has = (key: SectionKey) => sections.some((s) => s.key === key);
  return { counts, sections, none: list.length === 0, calm: sections.length > 0 && !has("overdue") && !has("soon") };
}

/* ---------- Calendar today ---------- */

export const EVENT_LIMIT = 8;

// All-day events first, then by start time.
export function eventsOnDay(events: CalendarEvent[], iso: string): CalendarEvent[] {
  return events
    .filter((e) => eventOnDay(e, iso))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

// "All day", or "09:30 to 10:00" (guide 5.9).
export function eventTimes(e: CalendarEvent): string {
  if (e.allDay) return "All day";
  if (e.startTime && e.endTime) return `${e.startTime} to ${e.endTime}`;
  return e.startTime ?? "All day";
}

/* ---------- Who's carrying what ---------- */

export const PEOPLE_LIMIT = 6;
export const LOAD_STEPS = 5;

export interface Carrier extends PersonLoad {
  load: number; // 0 to 5, lit bars of the load meter, relative to whoever owns most
  away: boolean; // an all-day "… out of office" event today
}

export function carriersOf(open: Task[], events: CalendarEvent[] | null, today: string): Carrier[] {
  const people = loadPerPerson(open, today).filter((p) => isPerson(p.name));
  const most = Math.max(1, ...people.map((p) => p.owned));
  const away = (events ?? [])
    .filter((e) => e.allDay && eventOnDay(e, today) && / out of office$/.test(e.title))
    .map((e) => e.title.replace(/ out of office$/, ""));
  return people.map((p) => ({
    ...p,
    load: Math.ceil((p.owned / most) * LOAD_STEPS),
    away: away.some((name) => p.name.startsWith(name)),
  }));
}
