import { describe, expect, it } from "vitest";
import type { AwayDay } from "@/lib/leave";
import { awayByDate, awayForPeople, awayName, awayPeriods, planAwayWindow } from "@/lib/planAway";
import { landing } from "@/lib/planCalendar";
import { parsePlan } from "@/lib/planView";

const today = "2027-02-10";
const day = (date: string, waiting?: true): AwayDay => ({ name: "Audrey", part: "day", date, waiting });

describe("Away in Plan", () => {
  it.each([
    ["view=month&month=2027-05", { from: "2027-04-26", to: "2027-06-06" }],
    ["view=day&date=2027-07-01", { from: "2027-06-28", to: "2027-07-04" }],
    ["view=day", { from: today, to: "2027-04-12" }],
    ["view=people&person=Audrey", { from: today, to: "2027-02-23" }],
    ["view=timeline", null],
  ])("requests the days shown by %s", (search, expected) => {
    expect(planAwayWindow(parsePlan(new URLSearchParams(search)), today)).toEqual(expected);
  });

  it("matches alternate task spelling without creating a second person and keeps away-only people", () => {
    const audrey = day(today);
    const sovie: AwayDay = { name: "Sovie", date: today, part: "morning" };
    expect(awayForPeople([audrey, sovie], ["ＡＵＤＲＥＹ", "Maya"])).toEqual(new Map([["ＡＵＤＲＥＹ", [audrey]], ["Sovie", [sovie]]]));
    expect(awayByDate([audrey, sovie], " audrey ").get(today)).toEqual([audrey]);
    expect(awayName(sovie, true)).toBe("Sovie ½");
    expect(awayName(sovie)).toBe("Sovie ½ morning");
  });

  it("merges adjacent dates and keeps gaps and waiting dates visible", () => {
    expect(awayPeriods([
      day("2027-02-16"), day("2027-02-10"), day("2027-02-11"), day("2027-02-12", true), day("2027-02-15"),
    ], today)).toEqual([
      { label: "Away 10–11 Feb", waiting: undefined },
      { label: "Away 12 Feb (Waiting)", waiting: true },
      { label: "Away 15–16 Feb", waiting: undefined },
    ]);
  });

  it("finds an away-only day on the first visit to Day", () => {
    expect(landing([], null, today, [today])).toEqual({ date: today, landed: false });
    expect(landing([], null, today, ["2027-02-12", "2027-02-11"])).toEqual({ date: "2027-02-11", landed: true });
  });
});
