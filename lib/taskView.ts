// What All tasks and a task group show (guide 6.2, 5.6, 5.7): the view held in the address, the list it makes, and which
// empty state to say when the list is empty. The address holds only the view's own params, so ?task= and ?newGroup= pass.
import { KINDS, type CompaniesById, type Kind } from "./kinds";
import { countByKind, defaultSort, filterTasks, sortTasks, type SortDir, type TaskSortKey, type TaskView } from "./taskQueries";
import type { Task, TaskType } from "./types";
import { TASK_TYPES } from "./types";
import type { DueBucket } from "./urgency";

export type DueChoice = Exclude<DueBucket, "later">;
export type FinishedRange = "week" | "month" | "all";

export interface TaskViewState {
  kind: Kind | "all"; // never set inside a task group
  view: TaskView;
  q: string;
  due: DueChoice | null; // open tasks only
  type: TaskType | "-" | null; // "-" is no task type
  idle: number | null; // open company tasks: days without action
  range: FinishedRange; // done tasks: finished within
  sort: TaskSortKey | null; // null is the default for the view
  dir: SortDir | null;
}

export const PAGE_SIZE = 100;

export const VIEW_PARAMS = ["kind", "view", "q", "due", "type", "idle", "range", "sort", "dir", "focus"] as const;

const DUE_CHOICES: DueChoice[] = ["overdue", "soon", "active", "nodate"];
const RANGES: FinishedRange[] = ["week", "month", "all"];
const SORT_KEYS: TaskSortKey[] = ["end", "start", "last", "about", "type", "desc", "prio", "doneAt"];

// Sorting by when it was finished only makes sense for finished tasks, and by last action only for open ones.
export function sortKeyFits(key: TaskSortKey, view: TaskView): boolean {
  return view === "done" ? key !== "last" : key !== "doneAt";
}

// The sort menu's choices (guide 6.2); column heads can sort by a few more.
export function sortMenuKeys(view: TaskView): TaskSortKey[] {
  return view === "done" ? ["doneAt", "end", "about", "type", "desc"] : ["end", "last", "about", "type", "desc", "prio", "start"];
}

export const SORT_LABELS: Record<TaskSortKey, string> = {
  end: "Deadline",
  last: "Last action",
  about: "Company",
  type: "Task type",
  desc: "Description",
  prio: "Priority",
  start: "Start",
  doneAt: "Finished",
};

// Direction labels are in words (guide 5.6): [ascending, descending].
export function directionLabels(key: TaskSortKey): [string, string] {
  switch (key) {
    case "end":
    case "start":
      return ["Earliest first", "Latest first"];
    case "doneAt":
      return ["Oldest first", "Most recent first"];
    case "last":
      return ["Longest without action first", "Most recent first"];
    case "prio":
      return ["High first", "Low first"];
    default:
      return ["A to Z", "Z to A"];
  }
}

// What a key does when picked without a direction.
function naturalDir(key: TaskSortKey): SortDir {
  return key === "last" || key === "doneAt" ? "desc" : "asc";
}

export function parseTaskView(params: URLSearchParams, inGroup: boolean): TaskViewState {
  const view: TaskView = params.get("view") === "done" ? "done" : "open";
  const kindParam = params.get("kind");
  const kind = !inGroup && KINDS.includes(kindParam as Kind) ? (kindParam as Kind) : "all";
  const dueParam = params.get("due") as DueChoice;
  const typeParam = params.get("type");
  const idleParam = Number(params.get("idle"));
  const sortParam = params.get("sort") as TaskSortKey;
  const rangeParam = params.get("range") as FinishedRange;
  const sort = SORT_KEYS.includes(sortParam) && sortKeyFits(sortParam, view) ? sortParam : null;
  const dirParam = params.get("dir");
  // The last action is a company's: it has no meaning inside a group or among internal work.
  const idleApplies = view === "open" && !inGroup && kind !== "internal";
  return {
    kind,
    view,
    q: params.get("q") ?? "",
    due: view === "open" && DUE_CHOICES.includes(dueParam) ? dueParam : null,
    type: typeParam === "-" || TASK_TYPES.includes(typeParam as TaskType) ? (typeParam as TaskType | "-") : null,
    idle: idleApplies && Number.isInteger(idleParam) && idleParam >= 1 && idleParam <= 999 ? idleParam : null,
    range: view === "done" && RANGES.includes(rangeParam) ? rangeParam : "week",
    sort,
    dir: sort && (dirParam === "asc" || dirParam === "desc") ? dirParam : null,
  };
}

// The view as address params, on top of the ones that aren't its own. Defaults stay out of the address.
export function viewParams(state: TaskViewState, inGroup: boolean, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(current);
  VIEW_PARAMS.forEach((key) => key !== "focus" && params.delete(key));
  const put = (key: string, value: string | null | undefined) => value && params.set(key, value);
  if (!inGroup && state.kind !== "all") put("kind", state.kind);
  if (state.view === "done") put("view", "done");
  put("q", state.q);
  put("due", state.view === "open" ? state.due : null);
  put("type", state.type);
  put("idle", state.view === "open" && !inGroup && state.kind !== "internal" && state.idle ? String(state.idle) : null);
  if (state.view === "done" && state.range !== "week") put("range", state.range);
  if (state.sort) {
    put("sort", state.sort);
    put("dir", state.dir ?? naturalDir(state.sort));
  }
  return params;
}

export function effectiveSort(state: TaskViewState, inGroup: boolean): { key: TaskSortKey; dir: SortDir } {
  if (state.sort) return { key: state.sort, dir: state.dir ?? naturalDir(state.sort) };
  return defaultSort(state.view, state.kind, inGroup);
}

// "Deadline, earliest first". "A to Z" keeps its capitals.
export function sortSummary(key: TaskSortKey, dir: SortDir): string {
  const words = directionLabels(key)[dir === "asc" ? 0 : 1];
  return `${SORT_LABELS[key]}, ${/^[A-Z][a-z]/.test(words) ? words.charAt(0).toLowerCase() + words.slice(1) : words}`;
}

// Tapping the head of the column that sorts flips it; another column starts at its own natural direction.
export function sortedByHead(state: TaskViewState, inGroup: boolean, key: TaskSortKey): TaskViewState {
  const now = effectiveSort(state, inGroup);
  if (now.key === key) return { ...state, sort: key, dir: now.dir === "asc" ? "desc" : "asc" };
  return { ...state, sort: key, dir: null };
}

// A view change that keeps the sort only when it still fits.
export function switchedView(state: TaskViewState, view: TaskView): TaskViewState {
  const sort = state.sort && sortKeyFits(state.sort, view) ? state.sort : null;
  return { ...state, view, sort, dir: sort ? state.dir : null, due: null, idle: null, range: "week" };
}

export function filtersOn(state: TaskViewState): boolean {
  return !!(state.q.trim() || state.type || (state.view === "open" && (state.due || state.idle)));
}

export function clearedFilters(state: TaskViewState): TaskViewState {
  return { ...state, q: "", due: null, type: null, idle: null };
}

export interface TaskListing<T extends Task> {
  scoped: T[]; // this view of this group or of every task, before the kind and the filters
  counts: Record<Kind | "all", number>;
  total: number; // what the kind switch leaves, before search and filters
  sorted: T[];
}

// The list: scoped to open or done (and to the group), narrowed by kind, search and filters, then ordered.
export function listTasks<T extends Task & { completedAt?: number }>(
  tasks: T[],
  state: TaskViewState,
  group: string | null,
  companies: CompaniesById,
  today: string
): TaskListing<T> {
  const ctx = { companies, today };
  const scoped = filterTasks(tasks, { view: state.view, group }, ctx);
  const byKind = countByKind(scoped, companies);
  const counts = { all: scoped.length, ...byKind };
  const total = group !== null || state.kind === "all" ? scoped.length : counts[state.kind];
  const narrowed = filterTasks(
    scoped,
    {
      view: state.view,
      kind: group !== null ? undefined : state.kind,
      group,
      search: state.q,
      due: state.due,
      minIdleDays: state.idle,
      type: state.type,
      finishedWithinDays: state.range === "week" ? 7 : state.range === "month" ? 30 : null,
    },
    ctx
  );
  const { key, dir } = effectiveSort(state, group !== null);
  return { scoped, counts, total, sorted: sortTasks(narrowed, key, dir, ctx) };
}

export type EmptyCase =
  | { case: "idle"; days: number } // no company task has gone this long without action
  | { case: "no-match" }
  | { case: "none-in-range"; range: Exclude<FinishedRange, "all"> } // nothing finished in the range, but earlier ones exist
  | { case: "no-finished"; kind: Kind | "all" }
  | { case: "empty-group" }
  | { case: "nothing-yet" }
  | { case: "no-kind"; kind: Kind }
  | { case: "all-done" }; // there are tasks, and every one is finished

// Which empty state to say when the list has nothing (guide 4.15, 6.2).
export function emptyCase(
  state: TaskViewState,
  inGroup: boolean,
  scopedCount: number,
  anyFinishedHere: boolean,
  anyTasks: boolean
): EmptyCase {
  if (filtersOn(state) && scopedCount > 0) {
    const onlyIdle = state.idle && !state.q.trim() && !state.type && !state.due;
    return onlyIdle ? { case: "idle", days: state.idle! } : { case: "no-match" };
  }
  if (state.view === "done") {
    if (state.range !== "all" && anyFinishedHere) return { case: "none-in-range", range: state.range };
    return { case: "no-finished", kind: inGroup ? "all" : state.kind };
  }
  if (inGroup) return { case: "empty-group" };
  if (!anyTasks) return { case: "nothing-yet" };
  return state.kind === "all" ? { case: "all-done" } : { case: "no-kind", kind: state.kind };
}
