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
      calendar: undefined,
      order: 7,
    });
  });

  it("stores a company task with its company and its group", () => {
    const d = { ...emptyDraft("Year end"), task: "Send the deck", about: "company" as const, companyId: 1 };
    expect(newTaskFromDraft(d)).toMatchObject({ linkedClientId: 1, taskGroup: "Year end" });
    expect(newTaskFromDraft({ ...d, group: "" })).toMatchObject({ linkedClientId: 1, taskGroup: undefined });
  });

  it("needs a description", () => {
    expect(hasDescription({ ...emptyDraft(), task: "   " })).toBe(false);
    expect(hasDescription({ ...emptyDraft(), task: "Call" })).toBe(true);
  });

  it("stores the calendar mark with either both times or no times, without nested undefined fields", () => {
    const d = { ...emptyDraft(), task: "Meeting", calendar: { startTime: "09:00", endTime: "10:00" } };
    expect(newTaskFromDraft(d).calendar).toEqual({ startTime: "09:00", endTime: "10:00" });
    expect(newTaskFromDraft({ ...d, calendar: {} }).calendar).toEqual({});
    expect(newTaskFromDraft({ ...d, calendar: { startTime: "", endTime: undefined } }).calendar).toEqual({});
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

  it("reads a calendar mark without sharing its mutable object or including server sync state", () => {
    const t = task({ calendar: { startTime: "09:00", endTime: "10:00" }, calendarSync: { synced: "before", link: "https://calendar.example/event" } });
    const d = draftFromTask(t, companies);
    expect(d.calendar).toEqual(t.calendar);
    expect(d.calendar).not.toBe(t.calendar);
    expect(d).not.toHaveProperty("calendarSync");
    expect(newTaskFromDraft(d)).not.toHaveProperty("calendarSync");
  });

  it("patches only changed calendar times and clears the mark when switched off", () => {
    const opened = draftFromTask(task({ calendar: { startTime: "09:00", endTime: "10:00" } }), companies);
    expect(patchFromDraft(opened, { ...opened, calendar: { startTime: "10:00", endTime: "11:00" } })).toEqual({
      calendar: { startTime: "10:00", endTime: "11:00" },
    });
    expect(patchFromDraft(opened, { ...opened, calendar: {} })).toEqual({ calendar: {} });
    expect(patchFromDraft(opened, { ...opened, calendar: undefined })).toEqual({ calendar: undefined });
  });

  it("adds an all-day mark to an unmarked task", () => {
    const opened = draftFromTask(task(), companies);
    expect(patchFromDraft(opened, { ...opened, calendar: {} })).toEqual({ calendar: {} });
  });

  it("leaves a server sync update and another editor's mark alone when saving an unrelated edit", () => {
    const t = task({ calendar: {}, calendarSync: { synced: "before" } });
    const opened = draftFromTask(t, companies);
    const current = { ...t, calendar: { startTime: "09:00", endTime: "10:00" }, calendarSync: { synced: "after" } };
    expect(patchFromDraft(opened, { ...opened, keyPoints: "Bring pricing" }, current)).toEqual({ keyPoints: "Bring pricing" });
    expect(patchFromDraft(opened, { ...opened, calendar: { endTime: "", startTime: "" } }, current)).toEqual({});
  });
});
