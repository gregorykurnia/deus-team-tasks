// The people picker's matching (W4, guide 4.13, 5.11): names already in use first, with their open tasks,
// and a new name offered second.
import { describe, expect, it } from "vitest";
import { matchNames, openCountsByName, type NameCount } from "@/lib/people";
import type { Task } from "@/lib/types";

const names: NameCount[] = [
  { name: "Nadia Pratama", open: 3 },
  { name: "Maya Chen", open: 5 },
  { name: "Kevin Tan", open: 0 },
  { name: "Ananda Putri", open: 1 },
  { name: "Dian Nadira", open: 2 },
];

describe("matchNames", () => {
  it("lists every name not yet chosen, A to Z, when nothing is typed", () => {
    expect(matchNames("", names, ["Kevin Tan"]).existing.map((n) => n.name)).toEqual([
      "Ananda Putri",
      "Dian Nadira",
      "Maya Chen",
      "Nadia Pratama",
    ]);
  });

  it("ignores case, and ranks names that start with the text, then words that start with it, then the rest", () => {
    expect(matchNames("NA", names, []).existing.map((n) => n.name)).toEqual(["Nadia Pratama", "Dian Nadira", "Ananda Putri"]);
  });

  it("leaves out people already chosen", () => {
    expect(matchNames("na", names, ["Nadia Pratama"]).existing.map((n) => n.name)).toEqual(["Dian Nadira", "Ananda Putri"]);
  });

  it("keeps each name's open task count", () => {
    expect(matchNames("maya", names, []).existing).toEqual([{ name: "Maya Chen", open: 5 }]);
  });

  it("offers the typed text as a new name, even when a longer name in use matches", () => {
    expect(matchNames("Nadia", names, []).addNew).toBe("Nadia");
    expect(matchNames("Agus", names, []).addNew).toBe("Agus");
  });

  it("offers no new name for one already in use, ignoring case and extra spaces", () => {
    expect(matchNames("maya   chen", names, []).addNew).toBeNull();
  });

  it("offers no new name for someone already chosen", () => {
    expect(matchNames("Sari Dewi", names, ["sari dewi"]).addNew).toBeNull();
  });

  it("offers no new name for empty or blank text, and trims the rest", () => {
    expect(matchNames("", names, []).addNew).toBeNull();
    expect(matchNames("   ", names, []).addNew).toBeNull();
    expect(matchNames("  Agus  ", names, []).addNew).toBe("Agus");
  });
});

function task(fields: Partial<Task>): Pick<Task, "responsible" | "informed" | "completed"> {
  return { responsible: [], informed: [], ...fields };
}

describe("openCountsByName", () => {
  it("counts open tasks for owners and for people kept informed, A to Z", () => {
    const counts = openCountsByName([
      task({ responsible: ["Maya Chen"], informed: [{ name: "Kevin Tan" }] }),
      task({ responsible: ["Maya Chen", "Kevin Tan"] }),
    ]);
    expect(counts).toEqual([
      { name: "Kevin Tan", open: 2 },
      { name: "Maya Chen", open: 2 },
    ]);
  });

  it("doesn't count finished tasks, but still lists the person", () => {
    const counts = openCountsByName([task({ responsible: ["Maya Chen"], completed: true })]);
    expect(counts).toEqual([{ name: "Maya Chen", open: 0 }]);
  });

  it("adds extra names with no tasks, and leaves out 'Full Team'", () => {
    const counts = openCountsByName([task({ responsible: ["Full Team"] })], ["Budi Santoso"]);
    expect(counts).toEqual([{ name: "Budi Santoso", open: 0 }]);
  });
});
