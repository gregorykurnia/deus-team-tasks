import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendarEvents";
import {
  activeOn,
  cellShown,
  dayHeading,
  dayListsOf,
  daySummary,
  dayWithSomething,
  eventsWindow,
  isBusy,
  landing,
  monthModelOf,
  monthWindow,
  nextMonthWithSomething,
  relativeDay,
  taskCount,
  weekStrip,
} from "@/lib/planCalendar";
import { parsePlan } from "@/lib/planView";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20"; // a Tuesday

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: id, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}
function event(id: string, day: string, fields: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, title: id, start: day, end: day, allDay: false, startTime: "10:00", endTime: "11:00", ...fields };
}

describe("when a task is on a day", () => {
  it("runs from its start to its deadline, from its start with no deadline, and on its deadline with no start", () => {
    const both = task("a", { startDate: "2026-10-20", endDate: "2026-10-22" });
    expect(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((d) => activeOn(both, d))).toEqual([false, true, true, true, false]);
    const open = task("b", { startDate: "2026-10-20" });
    expect(activeOn(open, "2026-10-19")).toBe(false);
    expect(activeOn(open, "2027-01-01")).toBe(true);
    const end = task("c", { endDate: "2026-10-20" });
    expect(activeOn(end, "2026-10-20")).toBe(true);
    expect(activeOn(end, "2026-10-21")).toBe(false);
    expect(activeOn(task("d"), TODAY)).toBe(false);
  });
});

describe("one day's lists", () => {
  const tasks = [
    task("due-b", { endDate: TODAY }),
    task("due-a", { endDate: TODAY, startDate: "2026-10-15" }),
    task("start", { startDate: TODAY, endDate: "2026-10-25" }),
    task("open-start", { startDate: TODAY }),
    task("late-end", { startDate: "2026-10-10", endDate: "2026-10-30" }),
    task("soon-end", { startDate: "2026-10-10", endDate: "2026-10-22" }),
    task("open", { startDate: "2026-10-01" }),
    task("elsewhere", { endDate: "2026-10-21" }),
  ];
  const events = [event("late", TODAY, { startTime: "15:00" }), event("early", TODAY, { startTime: "09:00" }), event("all", TODAY, { allDay: true })];

  it("splits into deadline, starting and under way, soonest deadline first, and orders events", () => {
    const lists = dayListsOf(tasks, events, TODAY);
    expect(lists.deadline.map((t) => t.id)).toEqual(["due-a", "due-b"]);
    expect(lists.starting.map((t) => t.id)).toEqual(["open-start", "start"]);
    expect(lists.underWay.map((t) => t.id)).toEqual(["soon-end", "late-end", "open"]);
    expect(lists.events.map((e) => e.id)).toEqual(["all", "early", "late"]);
    expect(taskCount(lists)).toBe(7);
  });

  it("says the parts that aren't zero", () => {
    expect(daySummary(dayListsOf(tasks, events, TODAY))).toBe("2 due, 2 starting, 3 under way, 3 events");
    expect(daySummary(dayListsOf([task("a", { endDate: TODAY })], [event("e", TODAY)], TODAY))).toBe("1 due, 1 event");
    expect(daySummary(dayListsOf([], null, TODAY))).toBe("");
  });
});

describe("the day Day lands on (D5)", () => {
  it("stays on today when anything is happening, a task or an event", () => {
    expect(landing([task("a", { endDate: TODAY })], null, TODAY)).toEqual({ date: TODAY, landed: false });
    expect(landing([], [event("e", TODAY)], TODAY)).toEqual({ date: TODAY, landed: false });
    expect(landing([task("run", { startDate: "2026-10-01" })], null, TODAY)).toEqual({ date: TODAY, landed: false });
  });
  it("moves to the next day with something, and says so", () => {
    const tasks = [task("a", { endDate: "2026-10-27" }), task("b", { endDate: "2026-10-25" })];
    expect(landing(tasks, [event("e", "2026-10-23")], TODAY)).toEqual({ date: "2026-10-23", landed: true });
    expect(landing(tasks, null, TODAY)).toEqual({ date: "2026-10-25", landed: true });
  });
  it("stays on today when nothing is ahead, and finds days before or after one", () => {
    expect(landing([task("past", { endDate: "2026-10-01" })], null, TODAY)).toEqual({ date: TODAY, landed: false });
    const tasks = [task("a", { endDate: "2026-10-10" }), task("b", { endDate: "2026-10-30" })];
    expect(dayWithSomething(tasks, null, TODAY, -1)).toBe("2026-10-10");
    expect(dayWithSomething(tasks, null, TODAY, 1)).toBe("2026-10-30");
    expect(dayWithSomething(tasks, null, "2026-10-30", 1)).toBeNull();
  });
});

describe("words and the week strip", () => {
  it("says how far a day is", () => {
    expect(relativeDay(TODAY, TODAY)).toBe("Today");
    expect(relativeDay("2026-10-21", TODAY)).toBe("Tomorrow");
    expect(relativeDay("2026-10-19", TODAY)).toBe("Yesterday");
    expect(relativeDay("2026-10-27", TODAY)).toBe("In 7 days");
    expect(relativeDay("2026-10-10", TODAY)).toBe("10 days ago");
  });
  it("counts each day's deadlines and events, Monday to Sunday", () => {
    const strip = weekStrip([task("a", { endDate: "2026-10-21" }), task("b", { endDate: "2026-10-21" })], [event("e", "2026-10-25")], "2026-10-23");
    expect(strip.map((d) => d.iso)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(strip.map((d) => d.deadlines)).toEqual([0, 0, 2, 0, 0, 0, 0]);
    expect(strip.map((d) => d.events)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
});

describe("the month grid", () => {
  it("runs Monday to Sunday over whole weeks, with the days around the month marked outside", () => {
    const model = monthModelOf([], null, "2026-10", TODAY);
    expect(model.cells).toHaveLength(35);
    expect(model.cells[0]).toMatchObject({ iso: "2026-09-28", outside: true, day: 28 });
    expect(model.cells[3]).toMatchObject({ iso: "2026-10-01", outside: false });
    expect(model.cells[34]).toMatchObject({ iso: "2026-11-01", outside: true });
    expect(model.cells.filter((c) => c.today).map((c) => c.iso)).toEqual([TODAY]);
    expect(model.cells.filter((c) => c.weekend).map((c) => c.iso).slice(0, 2)).toEqual(["2026-10-03", "2026-10-04"]);
  });
  it("takes a sixth week when the month needs it", () => {
    expect(monthModelOf([], null, "2026-08", TODAY).cells).toHaveLength(42);
    expect(monthModelOf([], null, "2027-02", TODAY).cells).toHaveLength(28);
  });
  it("puts deadlines and events in their cells, events first, and counts only the month's own days", () => {
    const tasks = [task("b", { endDate: "2026-10-30" }), task("a", { endDate: "2026-10-30" }), task("no-end", { startDate: "2026-10-30" })];
    const model = monthModelOf(tasks, [event("e", "2026-10-30"), event("out", "2026-11-01")], "2026-10", TODAY);
    const cell = model.cells.find((c) => c.iso === "2026-10-30")!;
    expect(cell.items.map((i) => i.event?.id ?? i.task?.id)).toEqual(["e", "a", "b"]);
    expect(model.total).toBe(3);
  });
  it("marks busy days: three deadlines, or five things in all", () => {
    expect(isBusy(3, 0)).toBe(true);
    expect(isBusy(2, 2)).toBe(false);
    expect(isBusy(2, 3)).toBe(true);
    expect(isBusy(0, 4)).toBe(false);
  });
  it("shows four lines, or three and a count", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "task" as const, task: task(`t${i}`) }));
    expect(cellShown(items(4))).toMatchObject({ more: 0 });
    expect(cellShown(items(4)).shown).toHaveLength(4);
    expect(cellShown(items(7))).toMatchObject({ more: 4 });
    expect(cellShown(items(7)).shown).toHaveLength(3);
  });
  it("finds the next month with a deadline or an event", () => {
    expect(nextMonthWithSomething([task("a", { endDate: "2027-01-05" })], null, "2026-10")).toBe("2027-01");
    expect(nextMonthWithSomething([], [event("e", "2026-12-24")], "2026-10")).toBe("2026-12");
    expect(nextMonthWithSomething([task("past", { endDate: "2026-01-05" })], null, "2026-10")).toBeNull();
  });
});

describe("the events Plan asks for", () => {
  it("covers the month grid and the weeks after it, for Month and for Day", () => {
    expect(monthWindow("2026-10")).toEqual({ start: "2026-09-28", days: 70 });
    const day = parsePlan(new URLSearchParams("view=day&date=2026-11-03"));
    expect(eventsWindow(day, TODAY, "2026-10-19", 28)).toEqual({ start: "2026-10-26", days: 70 });
    const landing = parsePlan(new URLSearchParams("view=day"));
    expect(eventsWindow(landing, TODAY, "2026-10-19", 28)).toEqual({ start: "2026-09-28", days: 70 });
    const month = parsePlan(new URLSearchParams("view=month&month=2026-12"));
    expect(eventsWindow(month, TODAY, "2026-10-19", 28)).toEqual({ start: "2026-11-30", days: 70 });
  });
  it("stays on the timeline's four weeks for the Timeline and People", () => {
    expect(eventsWindow(parsePlan(new URLSearchParams()), TODAY, "2026-10-19", 28)).toEqual({ start: "2026-10-19", days: 28 });
    expect(eventsWindow(parsePlan(new URLSearchParams("view=people")), TODAY, "2026-10-19", 28)).toEqual({ start: "2026-10-19", days: 28 });
  });
});

describe("the day's heading", () => {
  it("names the year only when it isn't this year's", () => {
    expect(dayHeading("2026-10-23", TODAY)).toBe("Friday, 23 October");
    expect(dayHeading("2027-01-04", TODAY)).toBe("Monday, 4 January 2027");
  });
});
