import { describe, expect, it } from "vitest";
import {
  busiestDay,
  crunchDays,
  dayRole,
  daysFrom,
  deadlinesPerDay,
  firstDayToShow,
  loadPerPerson,
  quietStretch,
  spanOf,
  taskRange,
  tasksByDay,
  tasksForPerson,
  tasksOnDay,
} from "@/lib/planMath";
import { initials, hue, namesInUse } from "@/lib/people";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20"; // a Tuesday

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: id, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

describe("task ranges", () => {
  it("uses start to deadline, or the one date set", () => {
    expect(taskRange(task("a", { startDate: "2026-10-01", endDate: "2026-10-05" }))).toEqual({ start: "2026-10-01", end: "2026-10-05" });
    expect(taskRange(task("b", { endDate: "2026-10-05" }))).toEqual({ start: "2026-10-05", end: "2026-10-05" });
    expect(taskRange(task("c", { startDate: "2026-10-05" }))).toEqual({ start: "2026-10-05", end: "2026-10-05" });
    expect(taskRange(task("d"))).toBeNull();
    expect(taskRange(task("e", { endDate: "not a date" }))).toBeNull();
  });
  it("spans every dated task with a margin", () => {
    expect(spanOf([task("a", { startDate: "2026-10-10", endDate: "2026-10-20" })], TODAY)).toEqual({ start: "2026-10-08", days: 15 });
    expect(spanOf([], TODAY)).toEqual({ start: "2026-10-18", days: 30 });
  });
});

describe("a day's tasks (D4, D5)", () => {
  const tasks = [
    task("span", { startDate: "2026-10-18", endDate: "2026-10-22" }),
    task("due", { endDate: "2026-10-20" }),
    task("next", { startDate: "2026-10-27", endDate: "2026-10-27" }),
  ];
  it("lists what's active, starting or due on a day", () => {
    expect(tasksOnDay(tasks, TODAY).map((t) => t.id)).toEqual(["span", "due"]);
    expect(dayRole(tasks[0], "2026-10-18")).toBe("starts");
    expect(dayRole(tasks[0], "2026-10-22")).toBe("ends");
    expect(dayRole(tasks[0], TODAY)).toBe("ongoing");
    expect(dayRole(tasks[2], "2026-10-27")).toBe("single");
  });
  it("lands on today if something is on, else the next day with something", () => {
    expect(firstDayToShow(tasks, TODAY)).toBe(TODAY);
    expect(firstDayToShow([tasks[2]], TODAY)).toBe("2026-10-27");
    expect(firstDayToShow([], TODAY)).toBe(TODAY);
  });
  it("puts each task under every day it covers", () => {
    const map = tasksByDay(tasks);
    expect(map.get("2026-10-19")?.map((t) => t.id)).toEqual(["span"]);
    expect(map.get(TODAY)?.map((t) => t.id)).toEqual(["span", "due"]);
    expect(map.has("2026-10-23")).toBe(false);
  });
});

describe("crunch days and quiet stretches (D1)", () => {
  const days = daysFrom("2026-10-19", 14);
  const tasks = [
    ...["a", "b", "c", "d"].map((id) => task(id, { endDate: "2026-10-22" })),
    task("e", { endDate: "2026-10-23" }),
    task("old1", { endDate: "2026-10-19" }),
    task("old2", { endDate: "2026-10-19" }),
    task("old3", { endDate: "2026-10-19" }),
  ];
  const deadlines = deadlinesPerDay(tasks, days);
  const events = days.map(() => 0);

  it("marks days well above the average, from today on", () => {
    expect(deadlines.slice(0, 5)).toEqual([3, 0, 0, 4, 1]);
    expect([...crunchDays(days, deadlines, events, TODAY)]).toEqual(["2026-10-22"]);
  });
  it("needs at least 2 deadlines for a busiest day", () => {
    expect(busiestDay(days, deadlines, events, TODAY)).toBe("2026-10-22");
    expect(busiestDay(days, days.map(() => 1), events, TODAY)).toBeNull();
  });
  it("finds the longest run of quiet weekdays", () => {
    // Free from Mon 26 to Fri 30 Oct (the weekend before is skipped).
    expect(quietStretch(days, tasks, events, TODAY)).toEqual({ start: "2026-10-26", end: "2026-10-30" });
  });
});

describe("people (D6, W4)", () => {
  const tasks = [
    task("a", { responsible: ["Ana"], informed: [{ name: "Ben", note: "backup" }], endDate: "2026-10-25" }),
    task("b", { responsible: ["Ana", "Ben"], endDate: "2026-10-22" }),
    task("c", { responsible: ["Ana"], completed: true }),
    task("d", { responsible: ["Full Team"] }),
  ];
  it("ranks everyone by what they own, leaving out placeholders", () => {
    expect(loadPerPerson(tasks, TODAY)).toEqual([
      { name: "Ana", owned: 2, informed: 0, nextDeadline: "2026-10-22" },
      { name: "Ben", owned: 1, informed: 1, nextDeadline: "2026-10-22" },
    ]);
  });
  it("counts someone both responsible and kept informed once, as responsible", () => {
    expect(loadPerPerson([task("x", { responsible: ["Ana"], informed: [{ name: "Ana" }, { name: "Ben" }] })], TODAY)).toEqual([
      { name: "Ana", owned: 1, informed: 0, nextDeadline: null },
      { name: "Ben", owned: 0, informed: 1, nextDeadline: null },
    ]);
  });
  it("splits owned from informed, with the person's part", () => {
    const ben = tasksForPerson(tasks, "Ben");
    expect(ben.owned.map((t) => t.id)).toEqual(["b"]);
    expect(ben.informed.map((i) => [i.task.id, i.note])).toEqual([["a", "backup"]]);
  });
  it("offers the names already in use, without placeholders", () => {
    expect(namesInUse(tasks, ["Cici"], [{ label: "Owner", names: ["Dodi"] }])).toEqual(["Ana", "Ben", "Cici", "Dodi"]);
  });
  it("makes initials and a stable hue", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("ko will")).toBe("KW");
    expect(initials("Greg")).toBe("GR");
    expect(initials("王小明")).toBe("王小");
    expect(initials("  ")).toBe("?");
    expect(hue("Maya Chen")).toBe(hue("Maya Chen"));
    expect(hue("Maya Chen")).toBeGreaterThanOrEqual(0);
    expect(hue("Maya Chen")).toBeLessThan(6);
  });
});
