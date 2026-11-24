// "Details shown" on All tasks (guide 5.6, W15): which columns the list has, in a fixed order, remembered on this device.
// The fields a company group's list shows are different: those are shared (D-024).
import type { TaskSortKey, TaskView } from "./taskQueries";

export type ColumnId = "company" | "group" | "status" | "type" | "touch" | "prio" | "start" | "end" | "last" | "resp" | "inf" | "key";

export interface Column {
  id: ColumnId;
  label: string;
  min: number; // minimum track width on a wide panel, in px
  compactMin?: number; // minimum on a narrower panel, and for a resized column
  fraction?: number; // share of free space, if this track stretches
  sort?: TaskSortKey; // tapping its head sorts by it
}

export const COLUMNS: Column[] = [
  { id: "company", label: "Company", min: 130, fraction: 1, sort: "about" },
  { id: "group", label: "Group", min: 120, compactMin: 80, fraction: 0.9, sort: "group" },
  { id: "status", label: "Status", min: 112, sort: "status" },
  { id: "type", label: "Task type", min: 104, compactMin: 82, sort: "type" },
  { id: "touch", label: "Touch point", min: 96 },
  { id: "prio", label: "Priority", min: 86, sort: "prio" },
  { id: "start", label: "Start", min: 76, sort: "start" },
  { id: "end", label: "Deadline", min: 118, compactMin: 116, sort: "end" },
  { id: "last", label: "Last action", min: 150, sort: "last" },
  { id: "resp", label: "Responsible", min: 110, compactMin: 100, fraction: 0.8 },
  { id: "inf", label: "Informed", min: 110, fraction: 0.8 },
  { id: "key", label: "Key points", min: 150, fraction: 1.2 },
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

// Column widths the user dragged (N26), remembered on this device, in px by column; "title" is the Description column.
// A column without one keeps its track from COLUMNS.
export type WidthKey = ColumnId | "title";
export type ColumnWidths = Partial<Record<WidthKey, number>>;

export const WIDTHS_STORAGE_KEY = "desk.tasks.widths";
const titleTrack = { min: 200, compactMin: 156, fraction: 2.2 };
export const WIDTH_MAX = 640;
export const COMPACT_LIST_GAP = 8;

const BY_ID = new Map(COLUMNS.map((c) => [c.id, c]));

const columnTrack = (key: WidthKey) => key === "title" ? titleTrack : BY_ID.get(key)!;

export function widthMin(key: WidthKey, compact = true): number {
  const track = columnTrack(key);
  return (compact ? track.compactMin : undefined) ?? track.min;
}

export function clampWidth(key: WidthKey, px: number): number {
  return Math.round(Math.min(WIDTH_MAX, Math.max(widthMin(key), px)));
}

// What was saved. Anything unreadable is dropped.
export function parseWidths(raw: string | null): ColumnWidths {
  if (!raw) return {};
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const widths: ColumnWidths = {};
    for (const [key, px] of Object.entries(saved)) {
      if ((key === "title" || IDS.has(key)) && typeof px === "number" && Number.isFinite(px)) widths[key as WidthKey] = clampWidth(key as WidthKey, px);
    }
    return widths;
  } catch {
    return {};
  }
}

// A column dragged to `px`. It and every stretching track before it keep the widths they have now (`measured`, in the
// order of `order`), so the column's edge follows the pointer and only the tracks after it give or take the space.
export function resizeColumn(widths: ColumnWidths, order: WidthKey[], measured: number[], key: WidthKey, px: number): ColumnWidths {
  const next = { ...widths };
  for (const [i, k] of order.entries()) {
    if (k === key) break;
    if (next[k] === undefined && columnTrack(k).fraction && measured[i]) next[k] = clampWidth(k, measured[i]);
  }
  next[key] = clampWidth(key, px);
  return next;
}

export function resetWidth(widths: ColumnWidths, key: WidthKey): ColumnWidths {
  const next = { ...widths };
  delete next[key];
  return next;
}

// The list's grid, shared by the head and every row: the circle, the title, then the chosen columns.
export function listGrid(shown: ColumnId[], widths: ColumnWidths = {}, compact = false): string {
  const track = (key: WidthKey) => {
    const fraction = columnTrack(key).fraction;
    const width = `${widths[key] ?? widthMin(key, compact)}px`;
    return !widths[key] && fraction ? `minmax(${width}, ${fraction}fr)` : width;
  };
  const tracks = COLUMNS.filter((c) => shown.includes(c.id)).map((c) => track(c.id));
  return ["26px", track("title"), ...tracks].join(" ");
}

// The narrowest the list can be before its text would spill out: the circle, the title and each column at their least
// (or the width they were given), the gaps between them, the row's 14px sides and the list's 6px margins. Narrower
// than that, it scrolls sideways.
export function listMinWidth(shown: ColumnId[], widths: ColumnWidths = {}, compact = false): number {
  const columns = COLUMNS.filter((c) => shown.includes(c.id));
  const title = widths.title ?? widthMin("title", compact);
  const gap = compact ? COMPACT_LIST_GAP : 14;
  return 26 + title + columns.reduce((n, c) => n + (widths[c.id] ?? widthMin(c.id, compact)), 0) + gap * (columns.length + 1) + 28 + 12;
}
