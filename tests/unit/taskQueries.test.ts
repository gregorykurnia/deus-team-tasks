import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companiesById, DEAL_DONE_STATUS, kindOf } from "@/lib/kinds";
import { countByKind, defaultSort, filterTasks, fold, sortTasks, todaySections } from "@/lib/taskQueries";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20";

function task(id: string, fields: Partial<Task> & { completedAt?: number } = {}): Task & { completedAt?: number } {
  return { id, task: `Task ${id}`, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const companies = companiesById([
  { id: 1, company: "Pelita Foods", status: "To Follow Up" },
  { id: 2, company: "Arunika Labs", status: DEAL_DONE_STATUS },
] as PipelineEntry[]);
const ctx = { companies, today: TODAY };

describe("kinds of work (guide 5.2)", () => {
  it("tells internal, prospect and client work apart", () => {
    expect(kindOf(task("a"), companies)).toBe("internal");
    expect(kindOf(task("b", { linkedClientId: 1 }), companies)).toBe("prospect");
    expect(kindOf(task("c", { linkedClientId: 2 }), companies)).toBe("client");
  });
  it("counts a task whose company is gone as internal", () => {
    expect(kindOf(task("d", { linkedClientId: 99 }), companies)).toBe("internal");
  });
  it("counts by kind", () => {
    expect(countByKind([task("a"), task("b", { linkedClientId: 1 }), task("c", { linkedClientId: 1 })], companies)).toEqual({
      prospect: 2,
      client: 0,
      internal: 1,
    });
  });
});

describe("filters", () => {
  const tasks = [
    task("open-int", { taskGroup: "Hiring", taskType: "Our Action" }),
    task("done-int", { completed: true, completedAt: new Date(2026, 9, 18).getTime() }),
    task("old-done", { completed: true, completedAt: new Date(2026, 8, 1).getTime() }),
    task("pro", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-19", responsible: ["Ana"] }),
    task("cli", { linkedClientId: 2, lastActionDate: "2026-10-18", endDate: "2026-10-22" }),
  ];
  const ids = (list: Task[]) => list.map((t) => t.id);

  it("keeps open and done apart", () => {
    expect(ids(filterTasks(tasks, { view: "open" }, ctx))).toEqual(["open-int", "pro", "cli"]);
    expect(ids(filterTasks(tasks, { view: "done" }, ctx))).toEqual(["done-int", "old-done"]);
    expect(filterTasks(tasks, {}, ctx)).toHaveLength(5);
  });
  it("narrows by kind and by task group", () => {
    expect(ids(filterTasks(tasks, { view: "open", kind: "client" }, ctx))).toEqual(["cli"]);
    expect(ids(filterTasks(tasks, { view: "open", group: "Hiring" }, ctx))).toEqual(["open-int"]);
  });
  it("keeps company tasks in their task group", () => {
    const yearEnd = [task("cli-ye", { linkedClientId: 2, taskGroup: "Year end" }), task("int-ye", { taskGroup: "Year end" }), task("cli")];
    expect(ids(filterTasks(yearEnd, { view: "open", group: "Year end" }, ctx))).toEqual(["cli-ye", "int-ye"]);
    expect(ids(filterTasks(yearEnd, { view: "open", kind: "client" }, ctx))).toEqual(["cli-ye"]);
  });
  it("searches the description, company, people and more", () => {
    expect(ids(filterTasks(tasks, { search: "pelita" }, ctx))).toEqual(["pro"]);
    expect(ids(filterTasks(tasks, { search: "ANA" }, ctx))).toEqual(["pro"]);
    expect(ids(filterTasks(tasks, { search: "hiring" }, ctx))).toEqual(["open-int"]);
  });
  it("narrows by due, days without action and task type", () => {
    expect(ids(filterTasks(tasks, { view: "open", due: "overdue" }, ctx))).toEqual(["pro"]);
    expect(ids(filterTasks(tasks, { view: "open", due: "soon" }, ctx))).toEqual(["cli"]);
    expect(ids(filterTasks(tasks, { view: "open", minIdleDays: 14 }, ctx))).toEqual(["pro"]);
    expect(ids(filterTasks(tasks, { view: "open", type: "Our Action" }, ctx))).toEqual(["open-int"]);
    expect(ids(filterTasks(tasks, { view: "open", type: "-" }, ctx))).toEqual(["pro", "cli"]);
  });
  it("counts days without action for company tasks only, even when an internal task has a last action date", () => {
    const withDate = [...tasks, { ...tasks.find((t) => t.id === "open-int")!, id: "int-dated", lastActionDate: "2020-01-01" }];
    expect(ids(filterTasks(withDate, { view: "open", minIdleDays: 14 }, ctx))).toEqual(["pro"]);
  });
  it("narrows finished tasks by when they were finished", () => {
    expect(ids(filterTasks(tasks, { view: "done", finishedWithinDays: 7 }, ctx))).toEqual(["done-int"]);
  });
});

describe("sorting (guide 5.6)", () => {
  const tasks = [
    task("undated"),
    task("late", { endDate: "2026-11-02" }),
    task("early", { endDate: "2026-10-21" }),
  ];
  const ids = (list: Task[]) => list.map((t) => t.id);

  it("puts empty values last both ways round", () => {
    expect(ids(sortTasks(tasks, "end", "asc", ctx))).toEqual(["early", "late", "undated"]);
    expect(ids(sortTasks(tasks, "end", "desc", ctx))).toEqual(["late", "early", "undated"]);
  });
  it("sorts by company or group name, priority and description", () => {
    const list = [
      task("g", { taskGroup: "zeta" }),
      task("c", { linkedClientId: 2 }),
      task("none", { priority: "Low" }),
      task("hi", { priority: "High", task: "a" }),
    ];
    expect(ids(sortTasks(list, "about", "asc", ctx))).toEqual(["c", "g", "none", "hi"]);
    expect(ids(sortTasks(list, "prio", "asc", ctx))).toEqual(["hi", "none", "g", "c"]);
    expect(ids(sortTasks(list, "desc", "asc", ctx))[0]).toBe("hi");
  });
  it("defaults to deadline first, prospect work latest first, finished most recent first", () => {
    expect(defaultSort("open", "all", false)).toEqual({ key: "end", dir: "asc" });
    expect(defaultSort("open", "prospect", false)).toEqual({ key: "end", dir: "desc" });
    expect(defaultSort("open", "prospect", true)).toEqual({ key: "end", dir: "asc" });
    expect(defaultSort("done", "all", false)).toEqual({ key: "doneAt", dir: "desc" });
  });
});

describe("Today", () => {
  it("groups open tasks into overdue, soon, under way and needs a date", () => {
    const sections = todaySections(
      [
        task("o", { endDate: "2026-10-10" }),
        task("s2", { endDate: "2026-10-22" }),
        task("s1", { endDate: "2026-10-21" }),
        task("a", { startDate: "2026-10-19", endDate: "2026-11-30" }),
        task("n"),
        task("later", { startDate: "2026-10-25", endDate: "2026-11-30" }),
        task("done", { endDate: "2026-10-10", completed: true }),
      ],
      ctx
    );
    expect(Object.fromEntries(Object.entries(sections).map(([k, v]: [string, Task[]]) => [k, v.map((t) => t.id)]))).toEqual({
      overdue: ["o"],
      soon: ["s1", "s2"],
      active: ["a"],
      nodate: ["n"],
    });
  });
  it("folds long sections", () => {
    expect(fold([1, 2, 3, 4, 5, 6, 7, 8], 6)).toEqual({ shown: [1, 2, 3, 4, 5, 6], hidden: 2 });
    expect(fold([1], 6)).toEqual({ shown: [1], hidden: 0 });
  });
});
