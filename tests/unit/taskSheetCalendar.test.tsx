// Task details on the team calendar (C04): the status a saved task shows, the sheet's words for the calendar's checks,
// the time field, and the in-flight requests behind "Adding to the team calendar…".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calendarSyncPending, requestCalendarSync, subscribeCalendarPending } from "@/lib/calendarRequests";
import { calendarKey, calendarStatus } from "@/lib/taskCalendar";
import type { Task } from "@/lib/types";
import { calendarErrors, calendarWritesShown, CalendarStatusLine } from "@/features/task-sheet/TaskCalendar";
import { emptyDraft } from "@/features/task-sheet/draft";
import { TimeInput } from "@/ui/Inputs";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const none = () => undefined;
function task(patch: Partial<Task> = {}): Task {
  return { id: "t1", task: "Board meeting", responsible: [], informed: [], keyPoints: "", startDate: "2026-11-12", endDate: "2026-11-12", order: 1, calendar: { startTime: "09:00", endTime: "10:00" }, ...patch };
}
const synced = (t: Task, patch: Partial<NonNullable<Task["calendarSync"]>> = {}) =>
  ({ ...t, calendarSync: { synced: calendarKey(t, null, null), link: "https://calendar.example/e", ...patch } });

describe("calendarStatus", () => {
  it("has none for a task that isn't on the calendar", () => {
    expect(calendarStatus(task({ calendar: undefined }), null, null, false)).toBeUndefined();
    expect(calendarStatus(task({ calendar: undefined }), null, null, true)).toBeUndefined();
  });
  it("isn't up to date when a switched-off task's event may still be there (R1)", () => {
    const off = { ...synced(task()), calendar: undefined };
    expect(calendarStatus(off, null, null, false)).toBe("stale");
    expect(calendarStatus({ ...off, calendarSync: { error: "Failed" } }, null, null, false)).toBe("stale");
    expect(calendarStatus(off, null, null, true)).toBeUndefined();
  });
  it("is on when the calendar holds this version of the task", () => {
    expect(calendarStatus(synced(task()), null, null, false)).toBe("on");
  });
  it("is adding while a sync is in flight, whatever was synced before", () => {
    expect(calendarStatus(task(), null, null, true)).toBe("adding");
    expect(calendarStatus(synced(task(), { error: "Failed" }), null, null, true)).toBe("adding");
  });
  it.each([
    ["never synced", task()],
    ["synced an older name", { ...synced(task()), task: "Board meeting, moved" }],
    ["synced other times", { ...synced(task()), calendar: { startTime: "11:00", endTime: "12:00" } }],
    ["the last sync failed", synced(task(), { error: "The team calendar didn't respond." })],
    ["times that can't make an event", { ...task({ calendar: { startTime: "10:00" } }), calendarSync: { synced: "x" } }],
  ])("isn't up to date when %s", (_label, t) => {
    expect(calendarStatus(t as Task, null, null, false)).toBe("stale");
  });
  it("judges a subtask and a company task with their context, as the server does", () => {
    const sub = task({ parentId: "main" });
    const parent = { id: "main", task: "Launch" };
    const company = { company: "Example Co" } as never;
    const saved = { ...sub, calendarSync: { synced: calendarKey(sub, parent, company) } };
    expect(calendarStatus(saved, parent, company, false)).toBe("on");
    expect(calendarStatus(saved, { id: "main", task: "Renamed" }, company, false)).toBe("stale");
    expect(calendarStatus(saved, parent, null, false)).toBe("stale");
  });
  it("waits for the companies to load before judging a company task", () => {
    expect(calendarWritesShown(task({ linkedClientId: 4 }), true)).toBe(false);
    expect(calendarWritesShown(task({ linkedClientId: 4 }), false)).toBe(true);
    expect(calendarWritesShown(task(), true)).toBe(true);
  });
});

describe("CalendarStatusLine", () => {
  it("says it's on the team calendar, with a link that opens it in a new tab", () => {
    const markup = html(<CalendarStatusLine status="on" link="https://calendar.example/e" onRetry={none} />);
    expect(markup).toContain("On the team calendar");
    expect(markup).toContain('aria-label="Open in the team calendar"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('href="https://calendar.example/e"');
  });
  it("leaves the link out when there isn't one", () => {
    expect(html(<CalendarStatusLine status="on" onRetry={none} />)).not.toContain("<a ");
  });
  it("says it's being added, with a spinner", () => {
    const markup = html(<CalendarStatusLine status="adding" onRetry={none} />);
    expect(markup).toContain("Adding to the team calendar…");
    expect(markup).not.toContain("Try again");
  });
  it("says it isn't up to date, with Try again", () => {
    const markup = html(<CalendarStatusLine status="stale" link="https://calendar.example/e" onRetry={none} />);
    expect(markup).toContain("The team calendar isn’t up to date.");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("Google");
  });
});

describe("calendarErrors", () => {
  const draft = (patch = {}) => ({ ...emptyDraft(), calendar: {}, ...patch });
  it("asks for both dates in the sheet's words", () => {
    expect(calendarErrors(draft())).toEqual({
      startDate: "Add a start date to put this on the team calendar.",
      endDate: "Add a deadline to put this on the team calendar.",
    });
  });
  it("says the deadline can't come before the start", () => {
    expect(calendarErrors(draft({ startDate: "2026-11-12", endDate: "2026-11-11" }))).toEqual({ endDate: "The deadline must be on or after the start date." });
  });
  it("keeps the calendar's own words for the times", () => {
    const errors = calendarErrors(draft({ startDate: "2026-11-12", endDate: "2026-11-12", calendar: { startTime: "10:00", endTime: "" } }));
    expect(errors).toEqual({ endTime: "Add an end time to go with the start time." });
    expect(calendarErrors(draft({ startDate: "2026-11-12", endDate: "2026-11-12", calendar: { startTime: "10:00", endTime: "09:00" } })))
      .toEqual({ endTime: "The end time must be after the start time." });
  });
  it("passes an all-day day and a timed one", () => {
    expect(calendarErrors(draft({ startDate: "2026-11-12", endDate: "2026-11-12" }))).toEqual({});
    expect(calendarErrors(draft({ startDate: "2026-11-12", endDate: "2026-11-12", calendar: { startTime: "09:00", endTime: "10:00" } }))).toEqual({});
  });
});

describe("TimeInput", () => {
  it("is a time field that clears like a date", () => {
    expect(html(<TimeInput value="" onChange={none} />)).toContain('type="time"');
    expect(html(<TimeInput value="" onChange={none} />)).not.toContain("Clear time");
    expect(html(<TimeInput value="09:30" onChange={none} />)).toContain('aria-label="Clear time"');
  });
});

describe("sync requests in flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("count as pending until a moment after the server answers, and tell listeners", async () => {
    let answer!: (v: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => (answer = r))));
    const heard = vi.fn();
    const stop = subscribeCalendarPending(heard);
    requestCalendarSync(["a"]);
    expect(calendarSyncPending("a")).toBe(true);
    expect(calendarSyncPending("b")).toBe(false);
    answer({ ok: true });
    await vi.advanceTimersByTimeAsync(1999);
    expect(calendarSyncPending("a")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(calendarSyncPending("a")).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });
  it("settle after a failed or thrown request too, and overlapping requests keep it pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => { throw new Error("no fetch"); }));
    requestCalendarSync(["c"]);
    requestCalendarSync(["c"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calendarSyncPending("c")).toBe(false);
  });
});
