import { describe, expect, it } from "vitest";
import { buildMorningSummary } from "@/lib/morningSummary";
import { parsePlan } from "@/lib/planView";
import type { Task } from "@/lib/types";

const TUESDAY = "2026-11-17", FRIDAY = "2026-11-20";
const task = (id: string, endDate = TUESDAY, fields: Partial<Task> = {}): Task => ({
  id, task: id, endDate, startDate: "", responsible: ["Audrey"], informed: [], keyPoints: "", order: 0, ...fields,
});

describe("pure morning summary", () => {
  it("groups a Tuesday in late/today/tomorrow order and counts main tasks and subtasks separately", () => {
    const summary = buildMorningSummary([
      task("Tomorrow", "2026-11-18", { parentId: "Today" }), task("Today"), task("Late", "2026-11-16"),
    ], "Audrey", TUESDAY)!;
    expect(summary.count).toBe(3);
    expect(summary.title).toBe("1 late, 1 due today, 1 tomorrow");
    expect(summary.body).toBe("Late: Late (1 day late)\nToday: Today\nTomorrow: Tomorrow");
    expect(summary.groups.late.map((t) => t.id)).toEqual(["Late"]);
    expect(summary.groups.today.map((t) => t.id)).toEqual(["Today"]);
    expect(summary.groups.tomorrow.map((t) => t.id)).toEqual(["Tomorrow"]);
    expect(summary.groups.byMonday).toEqual([]);
  });
  it("includes Saturday to Monday only in Friday's upcoming group, including across a year boundary", () => {
    for (const [friday, saturday, sunday, monday, tuesday] of [
      [FRIDAY, "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"],
      ["2027-12-31", "2028-01-01", "2028-01-02", "2028-01-03", "2028-01-04"],
    ]) {
      const summary = buildMorningSummary([task("Tuesday", tuesday), task("Monday", monday), task("Sunday", sunday), task("Saturday", saturday)], "Audrey", friday)!;
      expect(summary.title).toBe("3 due by Monday");
      expect(summary.body).toBe("By Monday: Saturday, Sunday, Monday");
      expect(summary.groups.byMonday).toHaveLength(3); expect(summary.groups.tomorrow).toEqual([]);
    }
  });
  it("omits done, still parked, Informed-only, no-deadline and distant tasks, but includes parking ending today", () => {
    const summary = buildMorningSummary([
      task("Done", TUESDAY, { completed: true }), task("Parked", TUESDAY, { parkedAt: Date.UTC(2026, 10, 1) }),
      task("Back tomorrow", TUESDAY, { parkedAt: Date.UTC(2026, 10, 1), parkedUntil: "2026-11-18" }),
      task("Informed", TUESDAY, { responsible: [], informed: [{ name: "Audrey" }] }),
      task("No deadline", ""), task("Later", "2026-11-19"),
      task("Back today", TUESDAY, { parkedAt: Date.UTC(2026, 10, 1), parkedUntil: TUESDAY }),
    ], "Audrey", TUESDAY)!;
    expect(summary.title).toBe("1 due today"); expect(summary.body).toBe("Today: Back today");
  });
  it("limits names across all groups to three, appends +N more and never exceeds four lines", () => {
    const summary = buildMorningSummary([
      task("Late", "2026-11-15"), task("Today A"), task("Today B"), task("Tomorrow A", "2026-11-18"), task("Tomorrow B", "2026-11-18"),
    ], "Audrey", TUESDAY)!;
    expect(summary.title).toBe("1 late, 2 due today, 2 tomorrow");
    expect(summary.body).toBe("Late: Late (2 days late)\nToday: Today A, Today B\n+2 more");
    const full = buildMorningSummary([task("Late", "2026-11-15"), task("Today"), task("Tomorrow A", "2026-11-18"), task("Tomorrow B", "2026-11-18")], "Audrey", TUESDAY)!;
    expect(full.body.split("\n")).toHaveLength(4); expect(full.body).toMatch(/\n\+1 more$/);
  });
  it("handles missing, blank, malformed and duplicate data without inventing deadlines or people", () => {
    const summary = buildMorningSummary([
      task("Duplicate", TUESDAY, { responsible: ["audrey", " AUDREY ", "Ａｕｄｒｅｙ"] }), task("Duplicate"),
      task("Missing", undefined, { endDate: undefined, responsible: undefined } as unknown as Partial<Task>),
      task("Null", TUESDAY, { responsible: null } as unknown as Partial<Task>),
      task("Text", TUESDAY, { responsible: "Audrey" } as unknown as Partial<Task>),
      task("Blank", TUESDAY, { responsible: ["", "  ", null] } as unknown as Partial<Task>),
      task("Invalid date", "2026-11-31"), task("Empty name", TUESDAY, { task: " \n " }),
    ], " Audrey ", TUESDAY)!;
    expect(summary.count).toBe(2); expect(summary.body).toBe("Today: Duplicate, Untitled task");
    expect(buildMorningSummary([task("All", TUESDAY, { responsible: ["Full Team"] })], "Full Team", TUESDAY)).toBeNull();
  });
  it("shortens a 120-character name without splitting unicode and flattens embedded line breaks", () => {
    const summary = buildMorningSummary([task("Long", TUESDAY, { task: "😀".repeat(120) }), task("Lines", TUESDAY, { task: "First\nSecond\tThird" })], "Audrey", TUESDAY)!;
    expect(summary.body).toBe(`Today: First Second Third, ${"😀".repeat(59)}…`);
    expect(Array.from(summary.body.split(", ")[1])).toHaveLength(60);
  });
  it("has no output on empty mornings, invalid days, weekends or blank names", () => {
    expect(buildMorningSummary([], "Audrey", TUESDAY)).toBeNull();
    for (const today of ["2026-11-21", "2026-11-22", "2026-13-01", "", "bad"]) {
      expect(buildMorningSummary([task("Due")], "Audrey", today)).toBeNull();
    }
    expect(buildMorningSummary([task("Due")], "  ", TUESDAY)).toBeNull();
  });
  it("sorts a copy and produces a link the existing Plan reader opens for the same person", () => {
    const tasks = Object.freeze([Object.freeze(task("B")), Object.freeze(task("A"))]);
    const summary = buildMorningSummary(tasks, "Audrey", TUESDAY)!;
    expect(summary.body).toBe("Today: A, B"); expect(tasks.map((t) => t.id)).toEqual(["B", "A"]);
    const named = buildMorningSummary([task("A", TUESDAY, { responsible: ["Audrey & Team"] })], "Audrey & Team", TUESDAY)!;
    expect(parsePlan(new URL(named.url, "http://localhost").searchParams)).toMatchObject({ view: "people", person: "Audrey & Team" });
  });
});
