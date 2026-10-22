// "Details shown" on All tasks (guide 5.6, W15): which columns the list has, in a fixed order, remembered on this device.
// The fields a company group's list shows are different: those are shared (D-024).
import type { TaskSortKey, TaskView } from "./taskQueries";

export type ColumnId = "company" | "group" | "type" | "touch" | "prio" | "start" | "end" | "last" | "resp" | "inf" | "key";

export interface Column {
  id: ColumnId;
  label: string;
  width: string; // its track in the list's grid
  min: number; // the track's narrowest, in px, so the list knows when to scroll sideways
  sort?: TaskSortKey; // tapping its head sorts by it
}

export const COLUMNS: Column[] = [
  { id: "company", label: "Company", width: "minmax(130px, 1fr)", min: 130, sort: "about" },
  { id: "group", label: "Group", width: "minmax(120px, 0.9fr)", min: 120, sort: "group" },
  { id: "type", label: "Task type", width: "104px", min: 104, sort: "type" },
  { id: "touch", label: "Touch point", width: "96px", min: 96 },
  { id: "prio", label: "Priority", width: "86px", min: 86, sort: "prio" },
  { id: "start", label: "Start", width: "76px", min: 76, sort: "start" },
  { id: "end", label: "Deadline", width: "118px", min: 118, sort: "end" },
  { id: "last", label: "Last action", width: "150px", min: 150, sort: "last" },
  { id: "resp", label: "Responsible", width: "minmax(110px, 0.8fr)", min: 110 },
  { id: "inf", label: "Informed", width: "minmax(110px, 0.8fr)", min: 110 },
  { id: "key", label: "Key points", width: "minmax(150px, 1.2fr)", min: 150 },
];

export const DEFAULT_COLUMNS: ColumnId[] = ["company", "group", "type", "end", "last", "resp"];

export const COLUMNS_STORAGE_KEY = "desk.tasks.details";

const IDS = new Set<string>(COLUMNS.map((c) => c.id));

// What was saved, as the columns to show in the catalogue's order. Anything unreadable gives the default. The one
// "Company or group" column saved before ("about") is now the two.
export function parseColumns(raw: string | null): ColumnId[] {
  if (!raw) return DEFAULT_COLUMNS;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return DEFAULT_COLUMNS;
    const ids = saved.flatMap((id) => (id === "about" ? ["company", "group"] : [id]));
    const chosen = new Set(ids.filter((id): id is string => typeof id === "string" && IDS.has(id)));
    return COLUMNS.filter((c) => chosen.has(c.id)).map((c) => c.id);
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function toggleColumn(shown: ColumnId[], id: ColumnId): ColumnId[] {
  const next = shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id];
  return COLUMNS.filter((c) => next.includes(c.id)).map((c) => c.id);
}

// The label a column's head and cells carry: in place of the deadline a finished task shows when it was finished, and a
// parked one when it comes back.
export function columnLabel(column: Column, view: TaskView): string {
  if (column.id !== "end" || view === "open") return column.label;
  return view === "done" ? "Finished" : "Comes back";
}

// What the head of a column sorts by in this view.
export function columnSort(column: Column, view: TaskView): TaskSortKey | undefined {
  if (column.id !== "end" || view === "open") return column.sort;
  return view === "done" ? "doneAt" : "back";
}

// The list's grid, shared by the head and every row: the circle, the title, then the chosen columns.
export function listGrid(shown: ColumnId[]): string {
  const widths = COLUMNS.filter((c) => shown.includes(c.id)).map((c) => c.width);
  return ["26px", "minmax(200px, 2.2fr)", ...widths].join(" ");
}

// The narrowest the list can be before its text would spill out: the circle, the title and each column at their least,
// the 14px gaps between them, the row's 14px sides and the list's 6px margins. Narrower than that, it scrolls sideways.
export function listMinWidth(shown: ColumnId[]): number {
  const columns = COLUMNS.filter((c) => shown.includes(c.id));
  return 26 + 200 + columns.reduce((n, c) => n + c.min, 0) + 14 * (columns.length + 1) + 28 + 12;
}
