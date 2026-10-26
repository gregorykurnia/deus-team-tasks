// A task's status (lib/taskStatus): To Do, In Progress or Done, how it's written, the Status filter on open tasks, the
// "In Progress" chip, and the task sheet's switch.
import { describe, expect, it } from "vitest";
import { draftFromTask, emptyDraft, newTaskFromDraft, patchFromDraft } from "@/features/task-sheet/draft";
import { companiesById } from "@/lib/kinds";
import { filterTasks } from "@/lib/taskQueries";
import { taskRowModel } from "@/lib/taskRow";
import { statusPatch, STATUS_LABELS, taskStatus } from "@/lib/taskStatus";
import { clearedFilters, filtersOn, listTasks, parseTaskView, switchedView, viewParams } from "@/lib/taskView";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20";
const companies = companiesById([]);
const ctx = { companies, today: TODAY };
const view = (query = "") => parseTaskView(new URLSearchParams(query), false);

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: `Task ${id}`, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

describe("taskStatus", () => {
  it("reads To Do, In Progress and Done, with older tasks To Do", () => {
    expect(taskStatus(task("a"))).toBe("todo");
    expect(taskStatus(task("b", { startedAt: 5 }))).toBe("inProgress");
    expect(taskStatus(task("c", { completed: true }))).toBe("done");
    expect(taskStatus(task("d", { completed: true, startedAt: 5 }))).toBe("done");
  });

  it("is labelled To Do, In Progress and Done", () => {
    expect(Object.values(STATUS_LABELS)).toEqual(["To Do", "In Progress", "Done"]);
  });

  it("comes back to In Progress when a started task is marked not done", () => {
    expect(taskStatus(task("a", { completed: false, startedAt: 5 }))).toBe("inProgress");
  });
});

describe("statusPatch", () => {
  it("records when a task is started, and keeps that date once it has one", () => {
    expect(statusPatch("inProgress", task("a"), 100)).toEqual({ completed: false, startedAt: 100 });
    expect(statusPatch("inProgress", task("a", { startedAt: 5, completed: true }), 100)).toEqual({ completed: false, startedAt: 5 });
  });

  it("clears the start for To Do, and keeps it when finishing", () => {
    expect(statusPatch("todo", task("a", { startedAt: 5 }))).toEqual({ completed: false, startedAt: undefined });
    expect(statusPatch("done", task("a", { startedAt: 5 }))).toEqual({ completed: true, startedAt: 5 });
  });
});

describe("the Status filter", () => {
  const tasks = [task("todo"), task("going", { startedAt: 5 }), task("done", { completed: true, startedAt: 5 })];

  it("narrows open tasks to To Do or In Progress, and never shows finished ones", () => {
    expect(filterTasks(tasks, { view: "open", status: "todo" }, ctx).map((t) => t.id)).toEqual(["todo"]);
    expect(filterTasks(tasks, { view: "open", status: "inProgress" }, ctx).map((t) => t.id)).toEqual(["going"]);
    expect(listTasks(tasks, view("status=in-progress"), null, companies, TODAY).sorted.map((t) => t.id)).toEqual(["going"]);
  });

  it("lives in the address on open tasks only", () => {
    expect(view("status=in-progress").status).toBe("inProgress");
    expect(view("status=to-do").status).toBe("todo");
    expect(view("status=done").status).toBeNull();
    expect(view("view=done&status=to-do").status).toBeNull();
    expect(viewParams({ ...view(), status: "inProgress" }, false).get("status")).toBe("in-progress");
    expect(viewParams({ ...view("view=parked"), status: "inProgress" }, false).has("status")).toBe(false);
  });

  it("counts as a filter, and clears with the others and on switching view", () => {
    const on = view("status=to-do");
    expect(filtersOn(on)).toBe(true);
    expect(clearedFilters(on).status).toBeNull();
    expect(switchedView(on, "done").status).toBeNull();
  });
});

describe("the In Progress chip", () => {
  it("shows on an unfinished started task only", () => {
    expect(taskRowModel(task("a", { startedAt: 5 }), companies, TODAY).inProgress).toBe(true);
    expect(taskRowModel(task("b"), companies, TODAY).inProgress).toBe(false);
    expect(taskRowModel(task("c", { startedAt: 5, completed: true }), companies, TODAY).inProgress).toBe(false);
  });
});

describe("the task sheet's status", () => {
  it("opens on the task's status, and writes only the status when that's all that changed", () => {
    const t = task("a");
    const opened = draftFromTask(t, companies);
    expect(opened.status).toBe("todo");
    const patch = patchFromDraft(opened, { ...opened, status: "inProgress" }, t);
    expect(Object.keys(patch).sort()).toEqual(["completed", "startedAt"]);
    expect(patch.completed).toBe(false);
    expect(typeof patch.startedAt).toBe("number");
  });

  it("finishes the task when Done is chosen, keeping its start", () => {
    const t = task("a", { startedAt: 5 });
    const opened = draftFromTask(t, companies);
    expect(patchFromDraft(opened, { ...opened, status: "done" }, t)).toEqual({ completed: true, startedAt: 5 });
  });

  it("adds a new task as In Progress when chosen, and To Do with nothing extra stored", () => {
    const d = { ...emptyDraft(), task: "Draft the brief" };
    expect(newTaskFromDraft({ ...d, status: "inProgress" }, 7)).toMatchObject({ completed: false, startedAt: 7 });
    expect(newTaskFromDraft(d, 7)).not.toHaveProperty("startedAt");
    expect(newTaskFromDraft(d, 7)).not.toHaveProperty("completed");
  });
});
