import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendarEvents";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companiesById } from "@/lib/kinds";
import { datesOf, pack, planTasks, timelineOf, type Unplaced } from "@/lib/planTimeline";
import { atToday, isAtToday, parsePlan, planParams, planSubtitle, stepLabel, stepped, timelineFrom, weekStart, type PlanState } from "@/lib/planView";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20"; // a Tuesday
const FROM = "2026-10-19"; // its Monday

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: id, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const NONE = companiesById([]);
const base = { events: null, from: FROM, today: TODAY, rows: "person" as const, person: null, companies: NONE, columnWidth: 30 };

describe("a task's dates", () => {
  it("reads a deadline only, a start only, both, and swaps a start after its deadline", () => {
    expect(datesOf(task("a", { endDate: "2026-10-22" }))).toEqual({ start: null, end: "2026-10-22" });
    expect(datesOf(task("b", { startDate: "2026-10-22" }))).toEqual({ start: "2026-10-22", end: null });
    expect(datesOf(task("c", { startDate: "2026-10-22", endDate: "2026-10-25" }))).toEqual({ start: "2026-10-22", end: "2026-10-25" });
    expect(datesOf(task("d", { startDate: "2026-10-25", endDate: "2026-10-22" }))).toEqual({ start: "2026-10-22", end: "2026-10-25" });
    expect(datesOf(task("e", { endDate: "soon" }))).toEqual({ start: null, end: null });
  });
});

describe("narrowing the plan", () => {
  const company = { id: 7, company: "Halcyon", opportunityStatus: "Active" } as unknown as PipelineEntry;
  const byId = companiesById([company]);
  const tasks = [
    task("co", { linkedClientId: 7, responsible: ["Maya Chen"] }),
    task("grp", { taskGroup: "Hiring", responsible: ["Kevin Tan"] }),
    task("free", { informed: [{ name: "Maya Chen", note: "backup" }] }),
  ];
  it("keeps a kind of work, a task group or one person's tasks, owned and informed", () => {
    expect(planTasks(tasks, { kind: "internal", group: null, person: null }, byId).map((t) => t.id)).toEqual(["grp", "free"]);
    expect(planTasks(tasks, { kind: null, group: "Hiring", person: null }, byId).map((t) => t.id)).toEqual(["grp"]);
    expect(planTasks(tasks, { kind: null, group: null, person: "Maya Chen" }, byId).map((t) => t.id)).toEqual(["co", "free"]);
    expect(planTasks(tasks, { kind: null, group: null, person: null }, byId)).toHaveLength(3);
  });
});

describe("placing bars", () => {
  const bar = (id: string, first: number, last: number, extra: Partial<Unplaced> = {}): Unplaced => ({
    task: task(id),
    kind: "internal",
    first,
    last,
    clipLeft: false,
    clipRight: false,
    openEnd: false,
    diamond: false,
    late: false,
    informed: false,
    ...extra,
  });
  it("puts overlapping bars on different lines and reuses a line once a bar is over", () => {
    const { placed, rows } = pack([bar("a", 0, 9), bar("b", 5, 12), bar("c", 10, 14)], 30);
    const row = (id: string) => placed.find((b) => b.task.id === id)!.row;
    expect([row("a"), row("b"), row("c")]).toEqual([0, 1, 0]);
    expect(rows).toBe(2);
  });
  it("keeps the words inside a long bar, and beside a short one so the next bar starts after them", () => {
    const { placed } = pack([bar("a", 0, 0), bar("b", 1, 1)], 30);
    expect(placed[0].inside).toBe(false);
    expect(placed[1].row).toBe(1); // "a" and its words take the columns after it
    expect(pack([bar("long", 0, 5)], 30).placed[0].inside).toBe(true);
  });
  it("takes a diamond as one column and never puts its words inside", () => {
    const [d] = pack([bar("d", 3, 3, { diamond: true })], 30).placed;
    expect(d.columns).toBe(1);
    expect(d.inside).toBe(false);
  });
});

describe("the timeline", () => {
  const tasks = [
    task("bar", { responsible: ["Maya Chen"], startDate: "2026-10-20", endDate: "2026-10-24" }),
    task("diamond", { responsible: ["Maya Chen"], endDate: "2026-10-22" }),
    task("open", { responsible: ["Kevin Tan"], startDate: "2026-10-21" }),
    task("late", { responsible: ["Kevin Tan"], endDate: "2026-10-19" }),
    task("old", { responsible: ["Kevin Tan"], endDate: "2026-10-05" }),
    task("far", { responsible: ["Kevin Tan"], startDate: "2026-12-01", endDate: "2026-12-05" }),
    task("nodates", { responsible: ["Kevin Tan"] }),
    task("shared", { responsible: ["Maya Chen", "Kevin Tan"], endDate: "2026-10-23" }),
  ];
  const model = timelineOf({ ...base, tasks });

  it("covers four weeks from the first day, and finds today", () => {
    expect(model.days).toHaveLength(28);
    expect(model.days[0]).toBe(FROM);
    expect(model.todayIndex).toBe(1);
    expect(timelineOf({ ...base, tasks, from: "2026-11-23" }).todayIndex).toBe(-1);
  });

  it("draws bars, diamonds and fading bars, and marks a missed deadline", () => {
    const maya = model.lanes.find((l) => l.person === "Maya Chen")!;
    const kevin = model.lanes.find((l) => l.person === "Kevin Tan")!;
    const get = (lane: typeof maya, id: string) => lane.bars.find((b) => b.task.id === id)!;
    expect(get(maya, "bar")).toMatchObject({ first: 1, last: 5, diamond: false, openEnd: false, late: false });
    expect(get(maya, "diamond")).toMatchObject({ first: 3, last: 3, diamond: true });
    expect(get(kevin, "open")).toMatchObject({ first: 2, last: 27, openEnd: true });
    expect(get(kevin, "late")).toMatchObject({ diamond: true, late: true });
  });

  it("counts what isn't on it: ended before, beyond the weeks, and no dates", () => {
    expect(model.before).toBe(1);
    expect(model.undated).toBe(1);
    const all = model.lanes.flatMap((l) => l.bars.map((b) => b.task.id));
    expect(all).not.toContain("old");
    expect(all).not.toContain("far");
    expect(all).not.toContain("nodates");
  });

  it("gives a task with two people responsible a bar in each lane, and the busiest lane first", () => {
    expect(model.lanes.map((l) => [l.name, l.bars.length])).toEqual([["Kevin Tan", 3], ["Maya Chen", 3]]); // tied: A to Z
    expect(model.lanes.filter((l) => l.bars.some((b) => b.task.id === "shared"))).toHaveLength(2);
  });

  it("puts tasks with nobody responsible in a last lane", () => {
    const m = timelineOf({ ...base, tasks: [task("x", { endDate: "2026-10-22" }), task("y", { responsible: ["Maya Chen"], endDate: "2026-10-22" })] });
    expect(m.lanes.map((l) => l.name)).toEqual(["Maya Chen", "Nobody responsible"]);
  });

  it("makes one lane for each kind of work when asked", () => {
    const m = timelineOf({ ...base, tasks, rows: "kind" });
    expect(m.lanes.map((l) => l.name)).toEqual(["Internal"]);
  });

  it("shows one lane for a person, with the tasks they're only kept informed on outlined", () => {
    const mine = [task("own", { responsible: ["Maya Chen"], endDate: "2026-10-22" }), task("inf", { informed: [{ name: "Maya Chen" }], endDate: "2026-10-23" })];
    const m = timelineOf({ ...base, tasks: mine, person: "Maya Chen" });
    expect(m.lanes).toHaveLength(1);
    expect(m.lanes[0]).toMatchObject({ owned: 1, informed: 1 });
    expect(m.lanes[0].bars.find((b) => b.task.id === "inf")!.informed).toBe(true);
  });

  it("marks crunch days, and says the busiest day, the quiet stretch and what is left out", () => {
    const busy = [
      task("a", { endDate: "2026-10-23" }),
      task("b", { endDate: "2026-10-23" }),
      task("c", { endDate: "2026-10-23" }),
      task("d", { endDate: "2026-10-05" }),
      task("e"),
    ];
    const m = timelineOf({ ...base, tasks: busy });
    expect([...m.crunch]).toEqual(["2026-10-23"]);
    const [busiest, quiet, before, undated] = m.insights;
    expect(busiest).toMatchObject({ key: "busiest", bold: "Fri 23 Oct", tail: ", 3 deadlines", day: "2026-10-23" });
    expect(quiet.key).toBe("quiet");
    expect(before).toMatchObject({ key: "before", bold: "1 overdue task", href: "/tasks?due=overdue" });
    expect(before.tail).toBe(" ended before 19 Oct");
    expect(undated).toMatchObject({ key: "undated", bold: "1 task", tail: " has no dates, so it isn't shown", href: "/tasks?due=nodate" });
    const narrowed = timelineOf({ ...base, tasks: busy, listHref: "/tasks?kind=client" }).insights;
    expect(narrowed.find((i) => i.key === "before")?.href).toBe("/tasks?kind=client&due=overdue");
    const group = timelineOf({ ...base, tasks: busy, listHref: "/tasks/groups/g1" }).insights;
    expect(group.find((i) => i.key === "undated")?.href).toBe("/tasks/groups/g1?due=nodate");
  });

  it("counts the team calendar per day, with a ring for an all-day event", () => {
    const events: CalendarEvent[] = [
      { id: "1", title: "Standup", start: "2026-10-21", end: "2026-10-21", allDay: false, startTime: "09:30", endTime: "10:00" },
      { id: "2", title: "Offsite", start: "2026-10-21", end: "2026-10-22", allDay: true },
    ];
    const m = timelineOf({ ...base, tasks: [], events });
    expect(m.eventCounts.slice(0, 5)).toEqual([0, 0, 2, 1, 0]);
    expect(m.allDay.slice(0, 5)).toEqual([false, false, true, true, false]);
  });

  it("notes the most tasks running at once from today on", () => {
    const five = Array.from({ length: 5 }, (_, i) => task(`t${i}`, { responsible: ["Maya Chen"], startDate: "2026-10-21", endDate: "2026-10-23" }));
    const lane = timelineOf({ ...base, tasks: five }).lanes[0];
    expect(lane.peak).toEqual({ count: 5, iso: "2026-10-21" });
  });
});

describe("the address", () => {
  const read = (query: string) => parsePlan(new URLSearchParams(query));
  it("defaults to the timeline, and a date alone means the Day view", () => {
    expect(read("")).toMatchObject({ view: "timeline", show: "all", rows: "person", kind: null, group: null, person: null, from: null });
    expect(read("date=2026-10-23").view).toBe("day");
    expect(read("view=day&date=2026-10-23")).toMatchObject({ view: "day", date: "2026-10-23" });
    expect(read("view=nonsense").view).toBe("timeline");
  });
  it("reads each filter, and a kind beats a group", () => {
    expect(read("kind=client&person=Maya%20Chen&show=events&rows=kind")).toMatchObject({ kind: "client", person: "Maya Chen", show: "events", rows: "kind" });
    expect(read("group=Hiring")).toMatchObject({ kind: null, group: "Hiring" });
    expect(read("kind=client&group=Hiring")).toMatchObject({ kind: "client", group: null });
    expect(read("from=2026-13-40").from).toBeNull();
  });
  it("writes only what isn't the default, and keeps params that aren't its own", () => {
    const state: PlanState = { ...read(""), person: "Maya Chen", from: "2026-11-02" };
    expect(planParams(state, new URLSearchParams("task=abc")).toString()).toBe("task=abc&person=Maya+Chen&from=2026-11-02");
    expect(planParams(read(""), new URLSearchParams("view=day&date=2026-10-23&task=abc")).toString()).toBe("task=abc");
    expect(planParams({ ...read("rows=kind"), person: "Maya Chen" }).toString()).toBe("person=Maya+Chen"); // rows doesn't apply to one person
  });
});

describe("stepping", () => {
  const read = (query: string) => parsePlan(new URLSearchParams(query));
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-20")).toBe("2026-10-19");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // a Sunday
    expect(timelineFrom(read(""), TODAY)).toBe("2026-10-19");
  });
  it("steps the timeline two weeks, a month, or a day, and goes back to today", () => {
    expect(stepped(read(""), 1, TODAY).from).toBe("2026-11-02");
    expect(stepped(read(""), -1, TODAY).from).toBe("2026-10-05");
    expect(stepped(read("view=month"), 1, TODAY).month).toBe("2026-11");
    expect(stepped(read("view=month&month=2026-01"), -1, TODAY).month).toBe("2025-12");
    expect(stepped(read("view=day&date=2026-10-23"), 1, TODAY).date).toBe("2026-10-24");
    const away = stepped(read(""), 1, TODAY);
    expect(isAtToday(away, TODAY)).toBe(false);
    expect(isAtToday(atToday(away, TODAY), TODAY)).toBe(true);
  });
});

describe("what the bar says", () => {
  const read = (query: string) => parsePlan(new URLSearchParams(query));
  it("names the range, the month or the day, with the year only when it isn't this one", () => {
    expect(stepLabel(read(""), TODAY)).toBe("19 Oct to 15 Nov");
    expect(stepLabel(read("from=2026-12-21"), TODAY)).toBe("21 Dec to 17 Jan 2027");
    expect(stepLabel(read("view=month"), TODAY)).toBe("October 2026");
    expect(stepLabel(read("view=day&date=2026-10-23"), TODAY)).toBe("Fri 23 Oct");
    expect(planSubtitle(read("view=day&date=2026-10-23"), TODAY)).toBe("Friday, 23 October");
    expect(planSubtitle(read(""), TODAY)).toBe("19 Oct to 15 Nov 2026");
    expect(planSubtitle(read("from=2026-12-21"), TODAY)).toBe("21 Dec to 17 Jan 2027");
    expect(planSubtitle(read("view=day&date=2031-03-04"), TODAY)).toBe("Tuesday, 4 March 2031");
    expect(planSubtitle(read("view=people"), TODAY)).toBe("Who carries what");
    expect(planSubtitle(read("view=people&person=Maya%20Chen"), TODAY)).toBe("Maya Chen");
  });
});
