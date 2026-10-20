import { describe, expect, it } from "vitest";
import { byDeadline, nextDueLabel, personLine, personRows, rankLine, searchPeople, sparkHeight, widestLoad, workWords } from "@/lib/planPeople";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20"; // a Tuesday

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: id, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const MAYA = "Maya Chen";
const KEVIN = "Kevin Tan";

describe("personRows", () => {
  const open = [
    task("a", { responsible: [MAYA], endDate: "2026-10-18" }), // overdue
    task("b", { responsible: [MAYA], endDate: "2026-10-20" }), // today
    task("c", { responsible: [MAYA], endDate: "2026-10-22" }),
    task("d", { responsible: [MAYA], endDate: "2026-11-30" }), // beyond two weeks
    task("e", { responsible: [KEVIN], informed: [{ name: MAYA, note: "backup" }], endDate: "2026-10-22" }),
    task("f", { responsible: [MAYA, KEVIN] }), // no deadline, two owners
  ];
  const rows = personRows([MAYA, KEVIN, "Nadia Putri"], open, TODAY);

  it("ranks by what they own, then what they're informed on, then name", () => {
    expect(rows.map((r) => r.name)).toEqual([MAYA, KEVIN, "Nadia Putri"]);
    expect(rows.map((r) => [r.owned.length, r.informed.length])).toEqual([[5, 1], [2, 0], [0, 0]]);
  });

  it("counts overdue, due in two weeks and the next deadline", () => {
    const maya = rows[0];
    expect(maya.overdue).toBe(1);
    expect(maya.soon).toBe(2); // today and 22 Oct; 30 Nov is too far, 18 Oct has gone
    expect(maya.next).toBe("2026-10-20");
    expect(rows[1].next).toBe("2026-10-22");
    expect(rows[2].next).toBeNull();
  });

  it("puts each owned deadline on its day of the next fourteen", () => {
    const maya = rows[0];
    expect(maya.perDay).toHaveLength(14);
    expect(maya.perDay[0]).toBe(1);
    expect(maya.perDay[2]).toBe(1);
    expect(maya.perDay.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("counts someone both responsible and kept informed once, as responsible", () => {
    const [maya, kevin] = personRows([MAYA, KEVIN], [task("x", { responsible: [MAYA], informed: [{ name: MAYA }, { name: KEVIN }] })], TODAY);
    expect([maya.name, maya.owned.length, maya.informed.length]).toEqual([MAYA, 1, 0]);
    expect([kevin.name, kevin.owned.length, kevin.informed.length]).toEqual([KEVIN, 0, 1]);
  });

  it("dates the next deadline in full beyond two weeks", () => {
    expect(nextDueLabel("2026-10-22", TODAY)).toBe("Thu 22");
    expect(nextDueLabel("2026-11-02", TODAY)).toBe("Mon 2");
    expect(nextDueLabel("2026-11-03", TODAY)).toBe("Tue 3 Nov");
    expect(nextDueLabel("2027-02-05", TODAY)).toBe("Fri 5 Feb 2027");
  });

  it("lists a name with no open work, and leaves out placeholders", () => {
    expect(personRows(["Full Team", "Nadia Putri"], [task("x", { responsible: ["Full Team"] })], TODAY).map((r) => r.name)).toEqual(["Nadia Putri"]);
  });

  it("finds people from part of a name, ignoring case", () => {
    expect(searchPeople(rows, " chen ").map((r) => r.name)).toEqual([MAYA]);
    expect(searchPeople(rows, "")).toHaveLength(3);
    expect(searchPeople(rows, "zzz")).toEqual([]);
  });

  it("draws the bars against the widest total", () => {
    expect(widestLoad(rows)).toBe(6);
    expect(widestLoad([])).toBe(1);
  });
});

describe("wording and sparkline", () => {
  it("sizes sparkline bars: a stub when quiet, never taller than 24px", () => {
    expect(sparkHeight(0, 5)).toBe(2);
    expect(sparkHeight(1, 1)).toBe(14); // the scale starts at two a day
    expect(sparkHeight(4, 4)).toBe(24);
  });

  it("says what a person carries", () => {
    const [maya, , nadia] = personRows([MAYA, KEVIN, "Nadia Putri"], [task("a", { responsible: [MAYA] }), task("b", { informed: [{ name: MAYA }] })], TODAY);
    expect(personLine(maya, null)).toBe("Responsible for 1 open task and kept informed on 1.");
    expect(personLine(maya, "client work")).toBe("Responsible for 1 open task and kept informed on 1, in client work.");
    expect(personLine(nadia, null)).toBe("No open work at the moment.");
    expect(personLine(nadia, "internal work")).toBe("Nothing open in internal work.");
    expect(rankLine(maya)).toBe("Owns 1, kept informed on 1");
    expect(rankLine(nadia)).toBe("Nothing open");
  });

  it("names the Work filter for a sentence", () => {
    expect(workWords({ kind: "client", group: null })).toBe("client work");
    expect(workWords({ kind: null, group: "Hiring" })).toBe("Hiring");
    expect(workWords({ kind: null, group: null })).toBeNull();
  });

  it("orders a person's tasks by deadline, with undated ones last", () => {
    const list = [task("none"), task("late", { endDate: "2026-11-01" }), task("soon", { endDate: "2026-10-21" })];
    expect(byDeadline(list).map((t) => t.id)).toEqual(["soon", "late", "none"]);
  });
});
