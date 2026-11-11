import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calendarEventId, calendarKey, taskEventBody, validateCalendarTimes } from "@/lib/taskCalendar";
import type { Task } from "@/lib/types";

const origin = "https://tasks.example";
const parent = { id: "main", task: "Arrange the launch" };
const company = { company: "Example Company" };
function task(patch: Partial<Task> = {}): Task {
  return {
    id: "meeting", task: "Agree the schedule", responsible: [], informed: [], keyPoints: "Bring the draft.\nConfirm the room.",
    startDate: "2026-11-11", endDate: "2026-11-11", order: 1, calendar: {}, ...patch,
  };
}

describe("task calendar event mapping", () => {
  it.each([
    ["one day", "2026-11-11", "2026-11-11", "2026-11-12"],
    ["multiple days", "2026-11-11", "2026-11-14", "2026-11-15"],
    ["year boundary", "2026-12-31", "2026-12-31", "2027-01-01"],
    ["leap day", "2028-02-28", "2028-02-28", "2028-02-29"],
    ["after leap day", "2028-02-29", "2028-02-29", "2028-03-01"],
  ])("maps all-day events with an exclusive end: %s", (_label, startDate, endDate, exclusiveEnd) => {
    const body = taskEventBody(task({ startDate, endDate }), undefined, undefined, origin);
    expect(body.start).toEqual({ date: startDate });
    expect(body.end).toEqual({ date: exclusiveEnd });
    expect(body.status).toBe("confirmed");
  });

  it.each([
    ["same day", "2026-11-11", "09:00", "2026-11-11", "10:30"],
    ["multiple days", "2026-11-11", "23:30", "2026-11-12", "00:15"],
    ["midnight end", "2026-12-31", "23:30", "2027-01-01", "00:00"],
  ])("maps timed events in Jakarta with their own dates: %s", (_label, startDate, startTime, endDate, endTime) => {
    const body = taskEventBody(task({ startDate, endDate, calendar: { startTime, endTime } }), undefined, undefined, origin);
    expect(body.start).toEqual({ dateTime: `${startDate}T${startTime}:00`, timeZone: "Asia/Jakarta" });
    expect(body.end).toEqual({ dateTime: `${endDate}T${endTime}:00`, timeZone: "Asia/Jakarta" });
    expect(body.status).toBe("confirmed");
  });

  it("includes the parent, company, Key points and encoded task link, with default reminders and no invites", () => {
    const t = task({ id: "meeting ?& 中", parentId: parent.id, linkedClientId: 1, completed: true, parkedAt: 123 });
    const before = structuredClone(t);
    const body = taskEventBody(t, parent, company, `${origin}/`);
    expect(body).toEqual({
      summary: t.task,
      description: `Main task: Arrange the launch\n\nCompany: Example Company\n\nKey points:\nBring the draft.\nConfirm the room.\n\n${origin}/tasks?task=meeting%20%3F%26%20%E4%B8%AD`,
      status: "confirmed",
      start: { date: "2026-11-11" },
      end: { date: "2026-11-12" },
      reminders: { useDefault: true },
      extendedProperties: { private: { deusTaskId: t.id } },
    });
    expect(t).toEqual(before);
  });

  it("omits empty or missing context, including a deleted, freed or unrelated parent", () => {
    const t = task({ keyPoints: "" });
    expect(taskEventBody(t, parent, null, origin).description).toBe(`${origin}/tasks?task=meeting`);
    expect(taskEventBody({ ...t, parentId: "gone" }, undefined, null, origin).description).toBe(`${origin}/tasks?task=meeting`);
    expect(taskEventBody({ ...t, parentId: "gone" }, parent, null, origin).description).toBe(`${origin}/tasks?task=meeting`);
    expect(taskEventBody({ ...t, parentId: t.id }, { id: t.id, task: t.task }, null, origin).description).toBe(`${origin}/tasks?task=meeting`);
  });

  it("uses a subtask's dates rather than its parent's dates", () => {
    const main = task({ ...parent, startDate: "2026-12-01", endDate: "2026-12-31" });
    const body = taskEventBody(task({ parentId: parent.id }), main, undefined, origin);
    expect(body.start).toEqual({ date: "2026-11-11" });
    expect(body.end).toEqual({ date: "2026-11-12" });
  });

  it("refuses to map an unmarked or invalid task", () => {
    expect(() => taskEventBody(task({ calendar: undefined }), null, null, origin)).toThrow("not marked");
    expect(() => taskEventBody(task({ calendar: { startTime: "09:00" } }), null, null, origin)).toThrow("endTime:");
    expect(() => taskEventBody(task({ endDate: "" }), null, null, origin)).toThrow("endDate:");
  });
});

describe("calendar date and time validation", () => {
  it.each([undefined, {}, { startTime: "", endTime: "" }])("accepts all-day or unmarked tasks: %j", (calendar) => {
    expect(validateCalendarTimes(task({ calendar }))).toEqual({});
  });

  it("allows undated tasks when they are not marked", () => {
    expect(validateCalendarTimes(task({ calendar: undefined, startDate: "", endDate: "" }))).toEqual({});
  });

  it.each([
    ["startTime", { endTime: "10:00" }],
    ["endTime", { startTime: "09:00" }],
    ["startTime", { startTime: "", endTime: "10:00" }],
    ["endTime", { startTime: "09:00", endTime: "" }],
  ])("names the missing %s", (field, calendar) => {
    expect(validateCalendarTimes(task({ calendar }))).toEqual({ [field]: expect.any(String) });
  });

  it.each(["24:00", "9:5", "09:5", "9:05", "12:60", "-1:00", "09:00:00", " 09:00", "09:00\n", "noon"])("rejects malformed time %j in either field", (value) => {
    expect(validateCalendarTimes(task({ calendar: { startTime: value, endTime: "23:59" } }))).toEqual({ startTime: expect.any(String) });
    expect(validateCalendarTimes(task({ calendar: { startTime: "00:00", endTime: value } }))).toEqual({ endTime: expect.any(String) });
  });

  it.each(["08:59", "09:00"])("rejects a same-day end at %s when the start is 09:00", (endTime) => {
    expect(validateCalendarTimes(task({ calendar: { startTime: "09:00", endTime } }))).toEqual({ endTime: expect.stringContaining("after") });
  });

  it.each([
    ["00:00", "23:59", "2026-11-11"],
    ["23:59", "00:00", "2026-11-12"],
    ["09:00", "09:00", "2026-11-12"],
  ])("accepts a strictly later instant: %s to %s on %s", (startTime, endTime, endDate) => {
    expect(validateCalendarTimes(task({ endDate, calendar: { startTime, endTime } }))).toEqual({});
  });

  it.each([
    ["startDate", { startDate: "" }],
    ["endDate", { endDate: "2026-02-29" }],
    ["endDate", { endDate: "2026-11-10" }],
  ])("rejects an invalid event date and names %s", (field, patch) => {
    expect(validateCalendarTimes(task(patch))).toEqual({ [field]: expect.any(String) });
  });
});

describe("deterministic Google event IDs", () => {
  it.each(["meeting", "other-meeting", "a".repeat(1500), "中".repeat(500), "rapat-é-📅"])("uses dt + SHA-256 for task ID case %#", async (id) => {
    const eventId = await calendarEventId(id);
    expect(eventId).toBe(`dt${createHash("sha256").update(id, "utf8").digest("hex")}`);
    expect(eventId).toMatch(/^[a-v0-9]{66}$/);
    expect(await calendarEventId(id)).toBe(eventId);
    expect(await calendarEventId(`${id}x`)).not.toBe(eventId);
  });
});

describe("calendar sync keys", () => {
  const t = task({ parentId: parent.id, linkedClientId: 1 });
  const key = calendarKey(t, parent, company);

  it.each([
    { calendarSync: { synced: "old", link: "https://calendar.example/event", error: "Retry" } },
    { completed: true, completedAt: 123 },
    { parkedAt: 123, parkedUntil: "2026-12-01" },
    { responsible: ["Maya"], informed: [{ name: "Kevin" }] },
    { order: 999, priority: "High" as const, taskGroup: "Other group", taskType: "Follow Up", touchPoint: "Call" },
    { startedAt: 123, lastActionDate: "2026-11-12" },
  ])("ignores fields that do not change the event: %j", (patch) => {
    expect(calendarKey({ ...t, ...patch }, parent, company)).toBe(key);
    expect(taskEventBody({ ...t, ...patch }, parent, company, origin)).toEqual(taskEventBody(t, parent, company, origin));
  });

  it.each([
    { task: "New name" }, { startDate: "2026-11-10" }, { endDate: "2026-11-12" },
    { calendar: { startTime: "09:00", endTime: "10:00" } }, { keyPoints: "New Key points" },
    { id: "new-id" }, { parentId: undefined },
  ])("changes for task content that goes into the event: %j", (patch) => {
    expect(calendarKey({ ...t, ...patch }, parent, company)).not.toBe(key);
  });

  it("changes for each timed endpoint", () => {
    const timed = { ...t, calendar: { startTime: "09:00", endTime: "10:00" } };
    const timedKey = calendarKey(timed, parent, company);
    expect(calendarKey({ ...timed, calendar: { ...timed.calendar, startTime: "08:00" } }, parent, company)).not.toBe(timedKey);
    expect(calendarKey({ ...timed, calendar: { ...timed.calendar, endTime: "11:00" } }, parent, company)).not.toBe(timedKey);
  });

  it("changes when a parent or company is renamed or removed", () => {
    expect(calendarKey(t, { ...parent, task: "Renamed main task" }, company)).not.toBe(key);
    expect(calendarKey(t, parent, { company: "Renamed Company" })).not.toBe(key);
    expect(calendarKey(t, undefined, company)).not.toBe(key);
    expect(calendarKey(t, parent, undefined)).not.toBe(key);
  });

  it("returns no key without a mark and normalizes blank all-day time inputs", () => {
    expect(calendarKey({ ...t, calendar: undefined }, parent, company)).toBeUndefined();
    expect(calendarKey({ ...t, calendar: { endTime: "", startTime: "" } }, parent, company)).toBe(key);
  });

  it("does not depend on calendar field order", () => {
    const a = task({ calendar: { startTime: "09:00", endTime: "10:00" } });
    const b = task({ calendar: { endTime: "10:00", startTime: "09:00" } });
    expect(calendarKey(a, undefined, undefined)).toBe(calendarKey(b, undefined, undefined));
  });
});
