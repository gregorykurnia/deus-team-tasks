// What Plan's People view shows (guide 4.12, 6.4): everyone ranked by what they own, with the owned and informed bar, a
// two-week sparkline of their deadlines and the next one; and one person's figures and two lists. Pure, so every count
// and wording is tested. The tasks passed in are open ones, already narrowed by Work.
import { daysBetween, plural } from "./dates";
import type { Kind } from "./kinds";
import { isPerson } from "./people";
import type { Task } from "./types";

export const SPARK_DAYS = 14;
export const SEARCH_FROM = 9; // the search field appears once there are more than eight people
const SOON_DAYS = 13; // "Due in 2 weeks" counts today and the thirteen days after

export interface PersonRow {
  name: string;
  owned: Task[]; // open tasks they're responsible for
  informed: Task[]; // open tasks they're only kept informed on
  overdue: number; // owned, with a deadline gone by
  soon: number; // owned, due in the next two weeks
  next: string | null; // their next deadline from today on
  perDay: number[]; // owned deadlines on each of the next 14 days, today first
}

// Everyone named on any task (finished ones too, so a person with only finished work still has a page), most owned first.
export function personRows(names: string[], open: Task[], today: string): PersonRow[] {
  const rows = new Map<string, PersonRow>();
  const get = (name: string) => {
    let row = rows.get(name);
    if (!row) rows.set(name, (row = { name, owned: [], informed: [], overdue: 0, soon: 0, next: null, perDay: Array(SPARK_DAYS).fill(0) }));
    return row;
  };
  names.filter(isPerson).forEach(get);
  for (const t of open) {
    for (const name of new Set(t.responsible.filter(isPerson))) get(name).owned.push(t);
    for (const name of new Set(t.informed.map((i) => i.name).filter(isPerson))) get(name).informed.push(t);
  }
  for (const row of rows.values()) {
    for (const t of row.owned) {
      if (!t.endDate) continue;
      const away = daysBetween(today, t.endDate);
      if (away < 0) row.overdue++;
      else {
        if (away <= SOON_DAYS) row.soon++;
        if (away < SPARK_DAYS) row.perDay[away]++;
        if (!row.next || t.endDate < row.next) row.next = t.endDate;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.owned.length - a.owned.length || b.informed.length - a.informed.length || a.name.localeCompare(b.name));
}

// The search matches part of a name, ignoring case.
export function searchPeople(rows: PersonRow[], query: string): PersonRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
}

// The widest owned-plus-informed total, which the bars are drawn against.
export function widestLoad(rows: PersonRow[]): number {
  return Math.max(1, ...rows.map((r) => r.owned.length + r.informed.length));
}

// A sparkline bar's height in pixels: a stub for a quiet day, up to 24px for the busiest (never below two a day).
export function sparkHeight(count: number, most: number): number {
  return count ? 4 + (count / Math.max(2, most)) * 20 : 2;
}

// The sentence under a person's name. `work` is the Work filter in words ("client work", or a group's name).
export function personLine(row: PersonRow, work: string | null): string {
  if (!row.owned.length && !row.informed.length) return work ? `Nothing open in ${work}.` : "No open work at the moment.";
  const tail = work ? `, in ${work}` : "";
  return `Responsible for ${plural(row.owned.length, "open task")} and kept informed on ${row.informed.length.toLocaleString("en-US")}${tail}.`;
}

// The small line under a name in the ranking.
export function rankLine(row: PersonRow): string {
  if (!row.owned.length && !row.informed.length) return "Nothing open";
  return `Owns ${row.owned.length.toLocaleString("en-US")}, kept informed on ${row.informed.length.toLocaleString("en-US")}`;
}

// Nearest deadline first, tasks with none last.
export function byDeadline(tasks: Task[]): Task[] {
  return tasks.slice().sort((a, b) => (a.endDate || "9").localeCompare(b.endDate || "9"));
}

// The Work filter in words for a sentence: "client work", or the task group's name.
export function workWords(state: { kind: Kind | null; group: string | null }): string | null {
  if (state.kind) return `${state.kind} work`;
  return state.group;
}
