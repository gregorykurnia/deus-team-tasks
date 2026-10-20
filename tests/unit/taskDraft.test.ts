// What task details writes (guide 6.3): a new task in full, and for a change only the fields that changed, so a
// colleague's change to another field is never written over.
import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companiesById } from "@/lib/kinds";
import type { Task } from "@/lib/types";
import { draftFromTask, emptyDraft, hasDescription, newTaskFromDraft, patchFromDraft } from "@/features/task-sheet/draft";

const companies = companiesById([{ id: 1, company: "Pelita Foods", status: "To Follow Up" }] as PipelineEntry[]);

function task(fields: Partial<Task> = {}): Task {
  return { id: "t1", task: "Call Pelita Foods", responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 3, ...fields };
}

describe("a new task", () => {
  it("stores internal work in its group, with nothing empty left over", () => {
    const d = { ...emptyDraft("Hiring"), task: "  Book the interview room  ", informed: [{ name: "Maya", note: "  " }] };
    expect(newTaskFromDraft(d, 7)).toEqual({
      task: "Book the interview room",
      linkedClientId: undefined,
      taskGroup: "Hiring",
      taskType: undefined,
      priority: undefined,
      touchPoint: undefined,
      startDate: "",
      endDate: "",
      lastActionDate: undefined,
      responsible: [],
      informed: [{ name: "Maya" }],
      keyPoints: "",
      order: 7,
    });
  });

  it("stores a company task with its company and no group", () => {
    const d = { ...emptyDraft("Hiring"), task: "Send the deck", about: "company" as const, companyId: 1 };
    expect(newTaskFromDraft(d)).toMatchObject({ linkedClientId: 1, taskGroup: undefined });
  });

  it("needs a description", () => {
    expect(hasDescription({ ...emptyDraft(), task: "   " })).toBe(false);
    expect(hasDescription({ ...emptyDraft(), task: "Call" })).toBe(true);
  });
});

describe("changing a task", () => {
  it("writes nothing when nothing changed", () => {
    const opened = draftFromTask(task({ linkedClientId: 1, endDate: "2026-10-24", priority: "High" }), companies);
    expect(patchFromDraft(opened, { ...opened })).toEqual({});
  });

  it("writes only the fields that changed, clearing what was emptied", () => {
    const opened = draftFromTask(task({ priority: "High", touchPoint: "Call", lastActionDate: "2026-10-01" }), companies);
    const now = { ...opened, keyPoints: "Bring the pricing", priority: null, lastActionDate: "" };
    expect(patchFromDraft(opened, now)).toEqual({ keyPoints: "Bring the pricing", priority: undefined, lastActionDate: undefined });
  });

  it("moves a company task to internal work in a group", () => {
    const opened = draftFromTask(task({ linkedClientId: 1 }), companies);
    expect(opened.about).toBe("company");
    expect(patchFromDraft(opened, { ...opened, about: "internal", group: "Office move" })).toEqual({
      linkedClientId: undefined,
      taskGroup: "Office move",
    });
  });

  it("reads a task whose company was deleted as internal work, and leaves its link alone", () => {
    const opened = draftFromTask(task({ linkedClientId: 99 }), companies);
    expect(opened.about).toBe("internal");
    expect(patchFromDraft(opened, { ...opened, task: "Call them again" })).toEqual({ task: "Call them again" });
  });

  it("keeps an informed person's note, trimmed, and notices a removed person", () => {
    const opened = draftFromTask(task({ informed: [{ name: "Maya", note: "backup" }, { name: "Kevin" }] }), companies);
    expect(patchFromDraft(opened, { ...opened, informed: [{ name: "Maya", note: " backup " }, { name: "Kevin" }] })).toEqual({});
    expect(patchFromDraft(opened, { ...opened, informed: [{ name: "Maya", note: "backup" }] })).toEqual({ informed: [{ name: "Maya", note: "backup" }] });
  });
});
