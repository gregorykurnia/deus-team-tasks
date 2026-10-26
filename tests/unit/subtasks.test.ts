// Subtasks (lib/subtasks, N24): a subtask names its parent, sits under it on the list, and is counted on the parent's row.
import { describe, expect, it } from "vitest";
import { companiesById } from "@/lib/kinds";
import { canHoldSubtasks, countLabel, nestSubtasks, newSubtask, parentOf, subtaskCounts, subtasksOf } from "@/lib/subtasks";
import { listTasks, parseTaskView } from "@/lib/taskView";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20";

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: `Task ${id}`, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id);

describe("nestSubtasks", () => {
  it("moves each subtask to just under its parent, keeping the list's order among them", () => {
    const list = [task("s2", { parentId: "p" }), task("a"), task("p"), task("s1", { parentId: "p" })];
    expect(ids(nestSubtasks(list))).toEqual(["a", "p", "s2", "s1"]);
  });

  it("leaves a subtask where it is when its parent isn't listed", () => {
    expect(ids(nestSubtasks([task("a"), task("s", { parentId: "gone" }), task("b")]))).toEqual(["a", "s", "b"]);
  });

  it("lists every task once, even from data that breaks the one level or loops", () => {
    const deep = [task("c", { parentId: "b" }), task("b", { parentId: "a" }), task("a")];
    expect(ids(nestSubtasks(deep))).toEqual(["a", "b", "c"]);
    const loop = [task("x", { parentId: "y" }), task("y", { parentId: "x" }), task("self", { parentId: "self" })];
    expect(ids(nestSubtasks(loop)).sort()).toEqual(["self", "x", "y"]);
  });
});

describe("All tasks with subtasks", () => {
  it("shows a subtask under its parent whatever the sort, and on its own when only it matches", () => {
    const all = [task("p", { task: "Plan the offsite", endDate: "2026-10-30" }), task("s", { task: "Book the venue", parentId: "p", endDate: "2026-10-21" }), task("o", { endDate: "2026-10-25" })];
    const view = (q = "") => parseTaskView(new URLSearchParams(q), false);
    expect(ids(listTasks(all, view(), null, companiesById([]), TODAY).sorted)).toEqual(["o", "p", "s"]);
    expect(ids(listTasks(all, view("q=venue"), null, companiesById([]), TODAY).sorted)).toEqual(["s"]);
  });
});

describe("subtask helpers", () => {
  const parent = task("p", { linkedClientId: 7, taskGroup: "Hiring", endDate: "2026-11-01", responsible: ["Greg"] });
  const byId = new Map([parent, task("s", { parentId: "p" }), task("orphan", { parentId: "gone" })].map((t) => [t.id, t]));

  it("finds a subtask's parent only while it's there", () => {
    expect(parentOf(byId.get("s")!, byId)?.id).toBe("p");
    expect(parentOf(byId.get("orphan")!, byId)).toBeUndefined();
  });

  it("lets only a task that isn't a subtask hold subtasks", () => {
    expect(canHoldSubtasks(parent, byId)).toBe(true);
    expect(canHoldSubtasks(byId.get("s")!, byId)).toBe(false);
    expect(canHoldSubtasks(byId.get("orphan")!, byId)).toBe(true);
  });

  it("lists a task's subtasks in the order they were added", () => {
    const tasks = [task("b", { parentId: "p", order: 2 }), task("x"), task("a", { parentId: "p", order: 1 })];
    expect(ids(subtasksOf(tasks, "p"))).toEqual(["a", "b"]);
  });

  it("counts each parent's subtasks and how many are done", () => {
    const counts = subtaskCounts([task("a", { parentId: "p", completed: true }), task("b", { parentId: "p" }), task("c", { parentId: "q" }), task("d")]);
    expect(counts.get("p")).toEqual({ done: 1, total: 2 });
    expect(countLabel(counts.get("q")!)).toBe("0/1 subtask");
    expect(countLabel(counts.get("p")!)).toBe("1/2 subtasks");
    expect(counts.has("d")).toBe(false);
  });

  it("starts a new subtask with its parent's company and group, and its own empty dates and people", () => {
    expect(newSubtask(parent, "  Call the agency ", 5)).toEqual({
      task: "Call the agency",
      parentId: "p",
      linkedClientId: 7,
      taskGroup: "Hiring",
      responsible: [],
      informed: [],
      keyPoints: "",
      startDate: "",
      endDate: "",
      order: 5,
    });
  });
});
