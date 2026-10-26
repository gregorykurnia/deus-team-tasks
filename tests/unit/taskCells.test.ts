// Changing a task in place on All tasks (lib/taskCells): which details open an editor, what it offers, and what a
// change writes.
import { describe, expect, it } from "vitest";
import { quickPicks } from "@/lib/companyEdit";
import { cellEditable, cellOptions, cellPatch, cellValue, statusFromLabel } from "@/lib/taskCells";
import type { Task } from "@/lib/types";

const open = { done: false, parked: false };

function task(fields: Partial<Task> = {}): Task {
  return { id: "t1", task: "Call Pelita Foods", responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

describe("cellEditable", () => {
  it("opens an editor for the status, type, touch point, priority, dates and key points", () => {
    for (const id of ["status", "type", "touch", "prio", "start", "end", "last", "key"] as const) expect(cellEditable(id, open)).toBe(true);
  });

  it("leaves the company, group and people to task details", () => {
    for (const id of ["company", "group", "resp", "inf"] as const) expect(cellEditable(id, open)).toBe(false);
  });

  it("doesn't change the deadline where the cell shows when a task finished or comes back", () => {
    expect(cellEditable("end", { done: true, parked: false })).toBe(false);
    expect(cellEditable("end", { done: false, parked: true })).toBe(false);
    expect(cellEditable("start", { done: true, parked: false })).toBe(true);
  });
});

describe("cellOptions and cellValue", () => {
  it("offers the statuses by their labels, and reads the task's", () => {
    expect(cellOptions("status", task()).map((o) => o.name)).toEqual(["To Do", "In Progress", "Done"]);
    expect(cellValue("status", task({ startedAt: 5 }))).toBe("In Progress");
    expect(statusFromLabel("Done")).toBe("done");
    expect(statusFromLabel(undefined)).toBeUndefined();
  });

  it("offers a touch point written before there were chips, alongside the usual ones", () => {
    expect(cellOptions("touch", task()).map((o) => o.name)).toEqual(["Call", "Email", "Meeting", "Message", "Visit"]);
    expect(cellOptions("touch", task({ touchPoint: "WhatsApp" })).map((o) => o.name).at(-1)).toBe("WhatsApp");
  });

  it("reads an empty date or key points as nothing", () => {
    expect(cellValue("end", task())).toBeUndefined();
    expect(cellValue("end", task({ endDate: "2026-10-30" }))).toBe("2026-10-30");
    expect(cellValue("key", task({ keyPoints: "Bring the samples" }))).toBe("Bring the samples");
  });
});

describe("cellPatch", () => {
  it("writes the field a cell holds", () => {
    expect(cellPatch("prio", "High")).toEqual({ priority: "High" });
    expect(cellPatch("type", "Follow Up")).toEqual({ taskType: "Follow Up" });
    expect(cellPatch("last", "2026-10-20")).toEqual({ lastActionDate: "2026-10-20" });
    expect(cellPatch("key", "  Bring the samples ")).toEqual({ keyPoints: "Bring the samples" });
  });

  it("stores cleared dates and key points empty, and clears the rest", () => {
    expect(cellPatch("start", undefined)).toEqual({ startDate: "" });
    expect(cellPatch("end", undefined)).toEqual({ endDate: "" });
    expect(cellPatch("key", undefined)).toEqual({ keyPoints: "" });
    expect(cellPatch("prio", undefined)).toEqual({ priority: undefined });
    expect(cellPatch("last", undefined)).toEqual({ lastActionDate: undefined });
  });

  it("offers Today and Yesterday for a task's last action, as for a company's", () => {
    expect(quickPicks("lastActionDate", "2026-10-20").map((p) => p.label)).toEqual(["Today", "Yesterday"]);
    expect(quickPicks("endDate", "2026-10-20").map((p) => p.label)).toEqual(["Today", "Tomorrow", "In a week"]);
  });
});
