// What a task row shows (guide 4.6, 5.1, 5.2): its kind, badge, place, last action and deadline, all from lib/urgency and
// lib/kinds, so every row says the same thing everywhere.
import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companiesById, DEAL_DONE_STATUS } from "@/lib/kinds";
import { taskRowModel } from "@/lib/taskRow";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20";
const companies = companiesById([
  { id: 1, company: "Pelita Foods", status: "To Follow Up" },
  { id: 2, company: "Arunika Labs", status: DEAL_DONE_STATUS },
] as PipelineEntry[]);

function task(fields: Partial<Task> = {}): Task {
  return { id: "t1", task: "Call Pelita Foods about the trial", responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

describe("taskRowModel: kind, badge and place", () => {
  it("shows internal work with the team badge, and its group as the place", () => {
    const row = taskRowModel(task({ taskGroup: "Hiring" }), companies, TODAY);
    expect(row.kind).toBe("internal");
    expect(row.badge).toEqual({ kind: "team" });
    expect(row.place).toBe("Hiring");
  });

  it("shows a company task with its company's initials and name", () => {
    const row = taskRowModel(task({ linkedClientId: 1 }), companies, TODAY);
    expect(row.kind).toBe("prospect");
    expect(row.badge).toEqual({ kind: "company", initials: "PF" });
    expect(row.place).toBe("Pelita Foods");
  });

  it("makes it client work once the company's deal is done", () => {
    expect(taskRowModel(task({ linkedClientId: 2 }), companies, TODAY).kind).toBe("client");
  });

  it("has no place for a task with no company and no group", () => {
    expect(taskRowModel(task(), companies, TODAY).place).toBeNull();
  });

  it("carries the touch point", () => {
    expect(taskRowModel(task({ touchPoint: "Call" }), companies, TODAY).touchPoint).toBe("Call");
    expect(taskRowModel(task(), companies, TODAY).touchPoint).toBeNull();
  });

  it("says 'High priority' for internal work only", () => {
    expect(taskRowModel(task({ priority: "High" }), companies, TODAY).highPriority).toBe(true);
    expect(taskRowModel(task({ priority: "High", linkedClientId: 1 }), companies, TODAY).highPriority).toBe(false);
    expect(taskRowModel(task({ priority: "Low" }), companies, TODAY).highPriority).toBe(false);
  });
});

describe("taskRowModel: last action (company tasks only)", () => {
  it("is plain under 7 days, amber from 7, red from 14", () => {
    const at = (lastActionDate: string) => taskRowModel(task({ linkedClientId: 1, lastActionDate }), companies, TODAY).lastAction;
    expect(at("2026-10-18")?.tone).toBe("plain");
    expect(at("2026-10-11")).toEqual({ tone: "amber", label: "Last action 9 days ago" });
    expect(at("2026-10-05")).toEqual({ tone: "red", label: "No action for 15 days" });
  });

  it("is left out for internal work", () => {
    expect(taskRowModel(task({ lastActionDate: "2026-10-01" }), companies, TODAY).lastAction).toBeNull();
  });

  it("is left out once the task is done: done tasks never show urgency", () => {
    expect(taskRowModel(task({ linkedClientId: 1, lastActionDate: "2026-10-01", completed: true }), companies, TODAY).lastAction).toBeNull();
  });
});

describe("taskRowModel: deadline", () => {
  it("says a missed deadline in words, with the date for hover", () => {
    const row = taskRowModel(task({ endDate: "2026-10-18" }), companies, TODAY);
    expect(row.deadline).toEqual({ tone: "red", label: "2 days late" });
    expect(row.deadlineTitle).toMatch(/^Deadline \w{3} 18 Oct$/);
  });

  it("is amber within three days and plain after", () => {
    expect(taskRowModel(task({ endDate: "2026-10-22" }), companies, TODAY).deadline).toEqual({ tone: "amber", label: "In 2 days" });
    expect(taskRowModel(task({ endDate: "2026-11-01" }), companies, TODAY).deadline).toEqual({ tone: "plain", label: "In 12 days" });
  });

  it("says 'No dates' when a task has none, and what that means on hover", () => {
    const row = taskRowModel(task(), companies, TODAY);
    expect(row.deadline).toEqual({ tone: "none", label: "No dates" });
    expect(row.deadlineTitle).toBe("No deadline set");
  });

  it("says when a finished task was done, with the date for hover", () => {
    const row = taskRowModel(task({ completed: true, completedAt: new Date(2026, 9, 17, 12).getTime(), endDate: "2026-10-18" }), companies, TODAY);
    expect(row.deadline).toEqual({ tone: "done", label: "Done 3 days ago" });
    expect(row.deadlineTitle).toMatch(/^Finished \w{3} 17 Oct$/);
    expect(row.done).toBe(true);
  });
});
