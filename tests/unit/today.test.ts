import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import type { CalendarEvent } from "@/lib/calendarEvents";
import { dayLabel, longDayLabel } from "@/lib/dates";
import { companiesById, DEAL_DONE_STATUS } from "@/lib/kinds";
import { attentionOf, carriersOf, countWord, eventsOnDay, eventTimes, heroOf, segmentShares, twoWeeksOf } from "@/lib/today";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20"; // a Tuesday

function day(offset: number): string {
  const d = new Date(2026, 9, 20 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function task(id: string, fields: Partial<Task> & { completedAt?: number } = {}): Task & { completedAt?: number } {
  return { id, task: `Task ${id}`, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const companies = companiesById([
  { id: 1, company: "Pelita Foods", status: "To Follow Up" },
  { id: 2, company: "Arunika Labs", status: DEAL_DONE_STATUS },
] as PipelineEntry[]);

const open = (list: ReturnType<typeof task>[]) => list.filter((t) => !t.completed);

describe("dates for Today", () => {
  it("writes a day short and long", () => {
    expect(dayLabel(TODAY)).toBe("Tue 20");
    expect(longDayLabel(TODAY)).toBe("Tuesday, 20 October");
  });
  it("spells small counts as words", () => {
    expect(countWord(1)).toBe("One");
    expect(countWord(10)).toBe("Ten");
    expect(countWord(11)).toBe("11");
  });
});

describe("the hero (guide 6.1)", () => {
  it("says there is nothing yet when there are no tasks at all", () => {
    const hero = heroOf([], [], companies, TODAY);
    expect(hero.empty).toBe(true);
    expect(hero.headline).toBe("Nothing on the list yet");
    expect(hero.chips).toEqual([]);
  });

  it("sums up overdue work and a company gone quiet, and says where to start", () => {
    const all = [
      task("a", { endDate: day(-3), linkedClientId: 1, lastActionDate: day(-20) }),
      task("b", { endDate: day(-1) }),
      task("c", { endDate: day(2) }),
      task("d"),
    ];
    const hero = heroOf(all, all, companies, TODAY);
    expect(hero.headline).toBe("Two tasks are overdue and one company has gone quiet");
    expect(hero.lede).toBe("Start with Pelita Foods, it's 3 days late. 0 tasks finished in the last seven days.");
    expect(hero.chips.map((c) => [c.key, c.count])).toEqual([
      ["overdue", 2],
      ["soon", 1],
      ["gone-cold", 1],
      ["nodate", 1],
    ]);
    expect(hero.kinds).toEqual({ prospect: 1, client: 0, internal: 3 });
  });

  it("starts with the task's own words when an internal task is the most overdue", () => {
    const all = [task("a", { task: "Renew the lease", endDate: day(-1) })];
    expect(heroOf(all, all, companies, TODAY).lede).toMatch(/^Start with “Renew the lease”, it's 1 day late\./);
  });

  it("names the next deadline when nothing is due soon, and counts what was finished this week", () => {
    const finished = task("f", { completed: true, completedAt: new Date(2026, 9, 18, 10).getTime() });
    const old = task("o", { completed: true, completedAt: new Date(2026, 9, 1, 10).getTime() });
    const later = task("l", { task: "Ship the report", endDate: day(9) });
    const all = [finished, old, later];
    const hero = heroOf(open(all), all, companies, TODAY);
    expect(hero.headline).toBe("Nothing is due in the next three days");
    expect(hero.lede).toBe("The next deadline is Thu 29: Ship the report. 1 task finished in the last seven days.");
    expect(hero.chips).toEqual([]);
  });

  it("lowercases the second clause only after a first", () => {
    const quiet = [task("q", { linkedClientId: 1, lastActionDate: day(-30), endDate: day(10) })];
    expect(heroOf(quiet, quiet, companies, TODAY).headline).toBe("One company has gone quiet");
  });

  it("doesn't count a finished task's quiet company", () => {
    const all = [task("q", { linkedClientId: 1, lastActionDate: day(-30), completed: true })];
    expect(heroOf(open(all), all, companies, TODAY).chips).toEqual([]);
  });
});

describe("the two-week chart (guide 4.12)", () => {
  const event = (fields: Partial<CalendarEvent>): CalendarEvent => ({ id: "e", title: "Event", start: TODAY, end: TODAY, allDay: false, ...fields });

  it("has 14 columns, today first, with weekends marked", () => {
    const { days } = twoWeeksOf([], [], companies, TODAY);
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ iso: TODAY, today: true, label: "Tue 20" });
    expect(days.filter((d) => d.weekend).map((d) => d.label)).toEqual(["Sat 24", "Sun 25", "Sat 31", "Sun 1"]);
  });

  it("stacks deadlines by kind and counts events a multi-day event covers", () => {
    const tasks = [
      task("a", { endDate: day(1), linkedClientId: 1 }),
      task("b", { endDate: day(1), linkedClientId: 2 }),
      task("c", { endDate: day(1) }),
    ];
    const { days } = twoWeeksOf(tasks, [event({ start: day(1), end: day(2), allDay: true })], companies, TODAY);
    expect(days[1]).toMatchObject({ prospect: 1, client: 1, internal: 1, events: 1, summary: "Wed 21: 3 deadlines, 1 event" });
    expect(days[2].events).toBe(1);
    expect(days[0].summary).toBe("Tue 20: 0 deadlines");
  });

  it("lists each day's tasks, with their company, and events in its hover text, folding after eight lines", () => {
    const tasks = [task("a", { endDate: day(1), linkedClientId: 1 }), task("b", { endDate: day(1) })];
    const { days } = twoWeeksOf(tasks, [event({ start: day(1), end: day(1), title: "Pelita demo" })], companies, TODAY);
    expect(days[1].details).toBe("Wed 21: 2 deadlines, 1 event\n• Task a (Pelita Foods)\n• Task b\n• Pelita demo (event)");
    expect(days[0].details).toBe("Tue 20: 0 deadlines");

    const many = Array.from({ length: 10 }, (_, i) => task(`m${i}`, { endDate: day(2) }));
    const lines = twoWeeksOf(many, [], companies, TODAY).days[2].details.split("\n");
    expect(lines).toHaveLength(9);
    expect(lines.at(-1)).toBe("and 3 more");
  });

  it("shows no event bars when the calendar is unavailable", () => {
    const { days } = twoWeeksOf([], null, companies, TODAY);
    expect(days.every((d) => d.events === 0)).toBe(true);
  });

  it("calls out the busiest day from three deadlines, else says it is calm", () => {
    const busy = [task("a", { endDate: day(3) }), task("b", { endDate: day(3) }), task("c", { endDate: day(3) }), task("d", { endDate: day(5) })];
    expect(twoWeeksOf(busy, [], companies, TODAY).callout).toEqual({ text: "Fri 23 is the busiest, with 3 deadlines", calm: false });
    expect(twoWeeksOf([busy[0], busy[1]], [], companies, TODAY).callout).toEqual({ text: "No crunch ahead", calm: true });
    expect(twoWeeksOf([], [], companies, TODAY).callout).toEqual({ text: "No deadlines in the next two weeks", calm: true });
  });

  it("sizes segments against the tallest column, with events at 60% each and at most six", () => {
    const { days, max } = twoWeeksOf([task("a", { endDate: day(0) })], [event({}), ...Array.from({ length: 9 }, (_, i) => event({ id: `x${i}` }))], companies, TODAY);
    expect(max).toBeCloseTo(1 + 6 * 0.6);
    const shares = segmentShares(days[0], max);
    expect(shares.map((s) => s.kind)).toEqual(["internal", "event"]);
    expect(shares[0].share + shares[1].share).toBeCloseTo(1);
  });
});

describe("Needs attention (guide 6.1)", () => {
  const tasks = [
    task("late2", { endDate: day(-1) }),
    task("late1", { endDate: day(-5), linkedClientId: 1 }),
    task("soon", { endDate: day(2), linkedClientId: 2 }),
    task("under", { startDate: day(-2), endDate: day(10) }),
    task("nodate"),
    task("later", { endDate: day(20) }),
    task("done", { endDate: day(-2), completed: true }),
  ];

  it("lists the four sections, soonest first, and leaves out what doesn't need attention", () => {
    const a = attentionOf(open(tasks), "all", companies, TODAY);
    expect(a.sections.map((s) => [s.key, s.shown.map((t) => t.id)])).toEqual([
      ["overdue", ["late1", "late2"]],
      ["soon", ["soon"]],
      ["active", ["under"]],
      ["nodate", ["nodate"]],
    ]);
    expect(a.counts).toEqual({ all: 5, prospect: 1, client: 1, internal: 3 });
    expect(a.calm).toBe(false);
  });

  it("narrows to a kind of work, with counts still for every kind", () => {
    const a = attentionOf(open(tasks), "client", companies, TODAY);
    expect(a.sections.map((s) => s.key)).toEqual(["soon"]);
    expect(a.counts.prospect).toBe(1);
  });

  it("has a calm notice when nothing is overdue or due soon", () => {
    const calm = attentionOf(open(tasks).filter((t) => ["under", "nodate"].includes(t.id)), "all", companies, TODAY);
    expect(calm.calm).toBe(true);
    expect(calm.none).toBe(false);
  });

  it("is empty for a kind with no work", () => {
    const a = attentionOf(open(tasks).filter((t) => !t.linkedClientId), "prospect", companies, TODAY);
    expect(a.none).toBe(true);
    expect(a.sections).toEqual([]);
  });

  it("folds at six and reports what is hidden", () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`, { endDate: day(-1 - i) }));
    const [section] = attentionOf(many, "all", companies, TODAY).sections;
    expect(section.shown).toHaveLength(6);
    expect(section.hidden).toBe(3);
    expect(section.count).toBe(9);
  });

  it("keeps a task just marked done in its place, without counting it", () => {
    const justDone = task("late2", { endDate: day(-1), completed: true });
    const a = attentionOf([justDone, tasks[1]], "all", companies, TODAY);
    expect(a.sections[0].shown.map((t) => t.id)).toEqual(["late1", "late2"]);
    expect(a.sections[0].count).toBe(1);
    expect(a.counts.all).toBe(1);
  });
});

describe("Calendar today (guide 5.9)", () => {
  const e = (id: string, fields: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: TODAY, end: TODAY, allDay: false, ...fields });

  it("puts all-day events first, then by start, and only today's", () => {
    const list = [e("late", { startTime: "15:00", endTime: "16:00" }), e("early", { startTime: "09:30", endTime: "10:00" }), e("all", { allDay: true }), e("tomorrow", { start: day(1), end: day(1) })];
    expect(eventsOnDay(list, TODAY).map((x) => x.id)).toEqual(["all", "early", "late"]);
  });

  it("writes times in 24 hours with the end, or All day", () => {
    expect(eventTimes(e("a", { startTime: "09:30", endTime: "10:00" }))).toBe("09:30 to 10:00");
    expect(eventTimes(e("b", { allDay: true }))).toBe("All day");
  });
});

describe("Who's carrying what (guide 6.1)", () => {
  const tasks = [
    task("a", { responsible: ["Maya Chen"], informed: [{ name: "Kevin Tan" }] }),
    task("b", { responsible: ["Maya Chen", "Kevin Tan"] }),
    task("c", { responsible: ["Maya Chen"] }),
    task("d", { responsible: ["Full Team"] }),
    task("e", { responsible: ["Kevin Tan"], completed: true }),
  ];

  it("ranks by what they own, scales the load to the busiest, and skips placeholders and finished tasks", () => {
    const people = carriersOf(open(tasks), [], TODAY);
    expect(people.map((p) => [p.name, p.owned, p.informed, p.load])).toEqual([
      ["Maya Chen", 3, 0, 5],
      ["Kevin Tan", 1, 1, 2],
    ]);
  });

  it("marks someone out of office from an all-day event", () => {
    const events: CalendarEvent[] = [{ id: "o", title: "Kevin out of office", start: TODAY, end: day(2), allDay: true }];
    expect(carriersOf(open(tasks), events, TODAY).find((p) => p.name === "Kevin Tan")?.away).toBe(true);
    expect(carriersOf(open(tasks), null, TODAY).find((p) => p.name === "Kevin Tan")?.away).toBe(false);
  });
});
