// What All tasks and a task group show (guide 6.2, 5.6, 5.7): the view in the address, the list it makes, the empty states,
// and the details shown.
import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companiesById } from "@/lib/kinds";
import { COLUMNS, DEFAULT_COLUMNS, listGrid, parseColumns, toggleColumn } from "@/lib/taskColumns";
import {
  clearedFilters,
  directionLabels,
  effectiveSort,
  emptyCase,
  listTasks,
  parseTaskView,
  sortedByHead,
  sortSummary,
  switchedView,
  viewParams,
  type TaskViewState,
} from "@/lib/taskView";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20";
const companies = companiesById([
  { id: 1, company: "Pelita Foods", status: "To Follow Up" },
  { id: 2, company: "Halcyon", status: "Client / Partner Done Deal" },
] as PipelineEntry[]);

let n = 0;
const task = (fields: Partial<Task> & { completedAt?: number } = {}): Task => ({
  id: `t${++n}`,
  task: `Task ${n}`,
  responsible: [],
  informed: [],
  keyPoints: "",
  startDate: "",
  endDate: "",
  order: n,
  ...fields,
});
const at = (day: number) => new Date(2026, 9, day, 12).getTime();
const view = (query = "", inGroup = false) => parseTaskView(new URLSearchParams(query), inGroup);
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe("the view in the address", () => {
  it("starts on open tasks of every kind with nothing filtered", () => {
    expect(view()).toEqual({ kind: "all", view: "open", q: "", due: null, type: null, idle: null, range: "week", sort: null, dir: null });
  });

  it("reads what Today links with: ?due=, ?kind=, ?idle=, ?q=", () => {
    expect(view("due=overdue&kind=client").due).toBe("overdue");
    expect(view("due=overdue&kind=client").kind).toBe("client");
    expect(view("idle=14").idle).toBe(14);
    expect(view("q=trial").q).toBe("trial");
  });

  it("ignores what it doesn't know", () => {
    const s = view("due=next-week&kind=everyone&type=Nope&idle=-3&sort=colour&range=year");
    expect(s).toMatchObject({ due: null, kind: "all", type: null, idle: null, sort: null, range: "week" });
  });

  it("has no kind switch in a group, and no 'No action for' where there are no company tasks", () => {
    expect(view("kind=client", true).kind).toBe("all");
    expect(view("idle=14", true).idle).toBeNull();
    expect(view("idle=14&kind=internal").idle).toBeNull();
    expect(view("idle=14&view=done").idle).toBeNull();
  });

  it("keeps Due and Finished to the view they belong to", () => {
    expect(view("view=done&due=overdue").due).toBeNull();
    expect(view("range=all").range).toBe("week");
    expect(view("view=done&range=all").range).toBe("all");
  });

  it("drops a sort that doesn't fit the view: finished date for open tasks, last action for done ones", () => {
    expect(view("sort=doneAt&dir=asc").sort).toBeNull();
    expect(view("view=done&sort=last").sort).toBeNull();
    expect(view("view=done&sort=doneAt&dir=asc")).toMatchObject({ sort: "doneAt", dir: "asc" });
  });

  it("writes only what isn't the default, and keeps the params that aren't its own", () => {
    const state: TaskViewState = { ...view(), kind: "client", q: "trial", due: "soon", sort: "prio", dir: "desc" };
    const params = viewParams(state, false, new URLSearchParams("task=abc&newGroup=1&due=overdue"));
    expect(params.get("kind")).toBe("client");
    expect(params.get("due")).toBe("soon");
    expect(params.get("q")).toBe("trial");
    expect(params.get("sort")).toBe("prio");
    expect(params.get("dir")).toBe("desc");
    expect(params.get("task")).toBe("abc");
    expect(params.get("newGroup")).toBe("1");
    expect(viewParams(view(), false).toString()).toBe("");
  });

  it("round-trips through the address", () => {
    const state: TaskViewState = { ...view(), view: "done", range: "month", type: "Follow Up", q: "a b", sort: "about", dir: "desc" };
    expect(parseTaskView(viewParams(state, false), false)).toEqual(state);
  });

  it("writes no kind inside a group", () => {
    expect(viewParams({ ...view(), kind: "client" }, true).has("kind")).toBe(false);
  });
});

describe("sorting", () => {
  it("defaults to the deadline, earliest first; prospect work latest first; finished most recent first", () => {
    expect(effectiveSort(view(), false)).toEqual({ key: "end", dir: "asc" });
    expect(effectiveSort(view("kind=prospect"), false)).toEqual({ key: "end", dir: "desc" });
    expect(effectiveSort(view("kind=prospect"), true)).toEqual({ key: "end", dir: "asc" });
    expect(effectiveSort(view("view=done"), false)).toEqual({ key: "doneAt", dir: "desc" });
  });

  it("says the direction in words", () => {
    expect(sortSummary("end", "asc")).toBe("Deadline, earliest first");
    expect(sortSummary("last", "asc")).toBe("Last action, longest without action first");
    expect(directionLabels("about")).toEqual(["A to Z", "Z to A"]);
    expect(sortSummary("doneAt", "desc")).toBe("Finished, most recent first");
    expect(sortSummary("desc", "asc")).toBe("Description, A to Z");
    expect(sortSummary("about", "desc")).toBe("Company, Z to A");
  });

  it("flips on a second tap of the same head, and starts at the column's own direction on another", () => {
    const flipped = sortedByHead(view(), false, "end");
    expect(effectiveSort(flipped, false)).toEqual({ key: "end", dir: "desc" });
    expect(effectiveSort(sortedByHead(flipped, false, "end"), false)).toEqual({ key: "end", dir: "asc" });
    expect(effectiveSort(sortedByHead(view(), false, "last"), false)).toEqual({ key: "last", dir: "desc" });
    expect(effectiveSort(sortedByHead(view(), false, "about"), false)).toEqual({ key: "about", dir: "asc" });
  });

  it("leaves a sort behind when the view changes and it no longer fits", () => {
    expect(switchedView(view("sort=last&dir=asc"), "done").sort).toBeNull();
    expect(switchedView(view("sort=about&dir=desc"), "done")).toMatchObject({ sort: "about", dir: "desc" });
    expect(switchedView(view("due=overdue"), "done").due).toBeNull();
  });
});

describe("the list", () => {
  const late = task({ task: "Chase invoice", endDate: "2026-10-18", linkedClientId: 1, lastActionDate: "2026-10-01", taskType: "Follow Up" });
  const soon = task({ task: "Send quote", endDate: "2026-10-22", linkedClientId: 2, lastActionDate: "2026-10-19" });
  const hiring = task({ task: "Book interviews", endDate: "2026-10-30", taskGroup: "Hiring" });
  const loose = task({ task: "Plan offsite" });
  const finished = task({ task: "Old thing", completed: true, completedAt: at(18), taskGroup: "Hiring" });
  const finishedLong = task({ task: "Ancient thing", completed: true, completedAt: at(1) });
  const finishedNoDate = task({ task: "Undated finish", completed: true });
  const all = [loose, hiring, soon, late, finished, finishedLong, finishedNoDate];
  const list = (query = "", group: string | null = null) => listTasks(all, view(query, group !== null), group, companies, TODAY);

  it("lists open tasks by deadline, earliest first, tasks without a deadline last", () => {
    expect(list().sorted.map((t) => t.task)).toEqual(["Chase invoice", "Send quote", "Book interviews", "Plan offsite"]);
  });

  it("counts each kind in the view, and what the kind switch leaves", () => {
    const l = list("kind=client");
    expect(l.counts).toEqual({ all: 4, prospect: 1, client: 1, internal: 2 });
    expect(l.total).toBe(1);
    expect(ids(l.sorted)).toEqual([soon.id]);
  });

  it("narrows by due, by task type, and by company tasks with no action for n days", () => {
    expect(ids(list("due=overdue").sorted)).toEqual([late.id]);
    expect(ids(list("due=nodate").sorted)).toEqual([loose.id]);
    expect(ids(list("type=Follow Up").sorted)).toEqual([late.id]);
    expect(ids(list("type=-").sorted)).toEqual([soon.id, hiring.id, loose.id]);
    expect(ids(list("idle=14").sorted)).toEqual([late.id]);
    expect(ids(list("idle=1").sorted)).toEqual([late.id, soon.id]);
  });

  it("searches what the row shows, ignoring case", () => {
    expect(ids(list("q=PELITA").sorted)).toEqual([late.id]);
    expect(ids(list("q=hiring").sorted)).toEqual([hiring.id]);
  });

  it("shows a group's own tasks only, in the open or the done view", () => {
    expect(ids(list("", "Hiring").sorted)).toEqual([hiring.id]);
    expect(ids(list("view=done&range=all", "Hiring").sorted)).toEqual([finished.id]);
  });

  it("shows finished tasks most recent first, within the days chosen", () => {
    expect(ids(list("view=done&range=all").sorted)).toEqual([finished.id, finishedLong.id, finishedNoDate.id]);
    expect(ids(list("view=done").sorted)).toEqual([finished.id]); // 7 days
    expect(ids(list("view=done&range=month").sorted)).toEqual([finished.id, finishedLong.id]);
  });

  it("keeps a task finished before dates were kept out of 'last 7 days' but in 'any time' (N1)", () => {
    expect(list("view=done").sorted.map((t) => t.task)).not.toContain("Undated finish");
    expect(list("view=done&range=all").sorted.map((t) => t.task)).toContain("Undated finish");
  });

  it("orders by the company, with tasks that have no company or group last", () => {
    expect(list("sort=about&dir=asc").sorted.map((t) => t.task)).toEqual(["Send quote", "Book interviews", "Chase invoice", "Plan offsite"]);
    expect(list("sort=about&dir=desc").sorted.map((t) => t.task)).toEqual(["Chase invoice", "Book interviews", "Send quote", "Plan offsite"]);
  });

  it("scopes to the view before it counts, so the kind switch counts what's on screen", () => {
    expect(list("view=done&range=all").counts).toEqual({ all: 3, prospect: 0, client: 0, internal: 3 });
  });

  it("clears the filters but not the kind or the view", () => {
    const cleared = clearedFilters(view("kind=client&q=x&due=soon&type=Follow Up&view=open"));
    expect(cleared).toMatchObject({ kind: "client", q: "", due: null, type: null, idle: null });
  });
});

describe("empty states", () => {
  const empty = (query: string, scoped: number, anyFinishedHere: boolean, anyTasks: boolean, inGroup = false) =>
    emptyCase(view(query, inGroup), inGroup, scoped, anyFinishedHere, anyTasks);

  it("says when nothing has gone n days without action, and when a search or filters match nothing", () => {
    expect(empty("idle=14", 5, false, true)).toEqual({ case: "idle", days: 14 });
    expect(empty("idle=14&q=x", 5, false, true)).toEqual({ case: "no-match" });
    expect(empty("q=budget", 5, false, true)).toEqual({ case: "no-match" });
    expect(empty("due=overdue", 5, false, true)).toEqual({ case: "no-match" });
  });

  it("tells finished tasks apart: none in the range, or none at all", () => {
    expect(empty("view=done", 4, true, true)).toEqual({ case: "none-in-range", range: "week" });
    expect(empty("view=done&range=month", 4, true, true)).toEqual({ case: "none-in-range", range: "month" });
    expect(empty("view=done&range=all", 0, false, true)).toEqual({ case: "no-finished", kind: "all" });
    expect(empty("view=done&range=all&kind=client", 3, true, true)).toEqual({ case: "no-finished", kind: "client" });
  });

  it("tells an empty group, an empty list, no work of one kind, and everything done apart", () => {
    expect(empty("", 0, false, true, true)).toEqual({ case: "empty-group" });
    expect(empty("", 0, false, false)).toEqual({ case: "nothing-yet" });
    expect(empty("kind=client", 0, false, true)).toEqual({ case: "no-kind", kind: "client" });
    expect(empty("", 0, false, true)).toEqual({ case: "all-done" });
  });
});

describe("details shown", () => {
  it("is the default until something was saved, and when what was saved can't be read", () => {
    expect(parseColumns(null)).toEqual(DEFAULT_COLUMNS);
    expect(parseColumns("not json")).toEqual(DEFAULT_COLUMNS);
    expect(parseColumns('{"a":1}')).toEqual(DEFAULT_COLUMNS);
  });

  it("keeps the catalogue's order and drops what it doesn't know", () => {
    expect(parseColumns('["resp","bogus","about","key"]')).toEqual(["about", "resp", "key"]);
  });

  it("can show none at all", () => {
    expect(parseColumns("[]")).toEqual([]);
  });

  it("adds and removes a detail in the catalogue's order", () => {
    expect(toggleColumn(DEFAULT_COLUMNS, "touch")).toEqual(["about", "type", "touch", "end", "last", "resp"]);
    expect(toggleColumn(DEFAULT_COLUMNS, "type")).toEqual(["about", "end", "last", "resp"]);
  });

  it("makes one grid for the head and every row: the circle, the title, then each chosen detail", () => {
    expect(listGrid([]).split(" minmax(").length).toBe(2); // the circle and the title
    expect(listGrid(["type", "end"])).toBe("26px minmax(200px, 2.2fr) 104px 118px");
    expect(COLUMNS.map((c) => c.id)).toEqual(["about", "type", "touch", "prio", "start", "end", "last", "resp", "inf", "key"]);
  });
});
