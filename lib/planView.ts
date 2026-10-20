// What Plan shows (guide 6.4): the view held in the address, so a link from Today lands on the right day and a reload
// keeps it. The address holds only Plan's own params, so ?task= passes. Defaults stay out of the address.
import { addDays, isIsoDay, isoOf, longDayLabel, monthTitle, parseIso, shortDate, weekdayDate } from "./dates";
import { KINDS, type Kind } from "./kinds";

export type PlanViewName = "timeline" | "month" | "day" | "people";
export type PlanShow = "all" | "tasks" | "events";
export type PlanRows = "person" | "kind";

export interface PlanState {
  view: PlanViewName;
  show: PlanShow;
  kind: Kind | null; // Work: a kind of work, or a task group (never both)
  group: string | null; // a task group's name
  person: string | null;
  rows: PlanRows; // the timeline's rows: one for each person, or for each kind of work
  from: string | null; // the timeline's first day; null is this week's Monday
  date: string | null; // the Day view's day; null lands on its own (D5)
  month: string | null; // the Month view's "yyyy-mm"; null is this month
}

export const PLAN_PARAMS = ["view", "show", "kind", "group", "person", "rows", "from", "date", "month"] as const;
export const VIEWS: PlanViewName[] = ["timeline", "month", "day", "people"];
export const TIMELINE_DAYS = 28; // four weeks, stepping two at a time
export const TIMELINE_STEP = 14;

type Params = { get(name: string): string | null };

export function parsePlan(params: Params): PlanState {
  const view = params.get("view") as PlanViewName;
  const date = params.get("date");
  const show = params.get("show");
  const kind = params.get("kind") as Kind;
  const from = params.get("from");
  const month = params.get("month");
  const group = params.get("group")?.trim();
  const person = params.get("person")?.trim();
  const rows = params.get("rows");
  return {
    // A link that names a date and no view (the prototype's, and Today's chart) means the Day view.
    view: VIEWS.includes(view) ? view : isIsoDay(date) ? "day" : "timeline",
    show: show === "tasks" || show === "events" ? show : "all",
    kind: KINDS.includes(kind) ? kind : null,
    group: !KINDS.includes(kind) && group ? group : null,
    person: person || null,
    rows: rows === "kind" ? "kind" : "person",
    from: isIsoDay(from) ? from : null,
    date: isIsoDay(date) ? date : null,
    month: month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null,
  };
}

// The state as address params, on top of the ones that aren't Plan's own.
export function planParams(state: PlanState, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(current);
  PLAN_PARAMS.forEach((key) => params.delete(key));
  const put = (key: string, value: string | null | undefined) => value && params.set(key, value);
  if (state.view !== "timeline") put("view", state.view);
  if (state.show !== "all" && state.view !== "people") put("show", state.show);
  put("kind", state.kind);
  put("group", state.kind ? null : state.group);
  put("person", state.person);
  if (state.view === "timeline" && state.rows === "kind" && !state.person) put("rows", "kind");
  if (state.view === "timeline") put("from", state.from);
  if (state.view === "day") put("date", state.date);
  if (state.view === "month") put("month", state.month);
  return params;
}

// The Monday of the week a day is in (weeks start on Monday, guide 7).
export function weekStart(iso: string): string {
  return addDays(iso, -((parseIso(iso).getDay() + 6) % 7));
}

export function timelineFrom(state: PlanState, today: string): string {
  return state.from ?? weekStart(today);
}

export function monthOf(state: PlanState, today: string): string {
  return state.month ?? today.slice(0, 7);
}

// Stepping: two weeks on the timeline, a month in Month, a day in Day. The people page doesn't step.
export function stepped(state: PlanState, dir: -1 | 1, today: string): PlanState {
  if (state.view === "timeline") return { ...state, from: addDays(timelineFrom(state, today), dir * TIMELINE_STEP) };
  if (state.view === "month") {
    const [y, m] = monthOf(state, today).split("-").map(Number);
    return { ...state, month: isoOf(new Date(y, m - 1 + dir, 1)).slice(0, 7) };
  }
  if (state.view === "day") return { ...state, date: addDays(state.date ?? today, dir) };
  return state;
}

// "Today": back to this week, this month or this day.
export function atToday(state: PlanState, today: string): PlanState {
  if (state.view === "timeline") return { ...state, from: null };
  if (state.view === "month") return { ...state, month: null };
  if (state.view === "day") return { ...state, date: today };
  return state;
}

export function isAtToday(state: PlanState, today: string): boolean {
  if (state.view === "timeline") return timelineFrom(state, today) === weekStart(today);
  if (state.view === "month") return monthOf(state, today) === today.slice(0, 7);
  if (state.view === "day") return state.date === today;
  return true;
}

export function planFiltersOn(state: PlanState): boolean {
  return !!(state.kind || state.group || state.person);
}

export function clearedPlanFilters(state: PlanState): PlanState {
  return { ...state, kind: null, group: null, person: state.view === "people" ? state.person : null };
}

export function workLabel(state: PlanState): string | null {
  if (state.kind) return { prospect: "Prospects", client: "Clients", internal: "Internal" }[state.kind];
  return state.group;
}

// What the stepper says between its arrows, and what the header says under the title.
export function stepLabel(state: PlanState, today: string): string {
  if (state.view === "month") return monthTitle(monthOf(state, today));
  if (state.view === "day") return weekdayDate(state.date ?? today, today);
  const from = timelineFrom(state, today);
  return `${shortDate(from, today)} to ${shortDate(addDays(from, TIMELINE_DAYS - 1), today)}`;
}

export function planSubtitle(state: PlanState, today: string): string {
  if (state.view === "day") return longDayLabel(state.date ?? today);
  if (state.view === "people") return state.person ?? "Who carries what";
  return stepLabel(state, today);
}

// What a step moves by, for the arrows' labels.
export const STEP_UNIT: Record<PlanViewName, string> = { timeline: "two weeks", month: "month", day: "day", people: "" };
