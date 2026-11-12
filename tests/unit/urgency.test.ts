import { describe, expect, it } from "vitest";
import {
  deadlineSignal,
  dueBucket,
  isGoneCold,
  isTargetClose,
  lastActionSignal,
  outreachSignal,
  targetDateSignal,
} from "@/lib/urgency";

const TODAY = "2026-10-20";
const t = (endDate: string, startDate = "", completed = false) => ({ endDate, startDate, completed });

describe("deadline (guide 5.1)", () => {
  it("names the date, with how late once missed, in red", () => {
    expect(deadlineSignal(t("2026-10-18"), TODAY)).toEqual({ tone: "red", label: "Sun 18 Oct · 2 days late", date: "Sun 18 Oct", word: "2 days late" });
    expect(deadlineSignal(t("2026-10-19"), TODAY)).toEqual({ tone: "red", label: "Mon 19 Oct · 1 day late", date: "Mon 19 Oct", word: "1 day late" });
  });
  it("is amber within 3 days, adding Today and Tomorrow to the date", () => {
    expect(deadlineSignal(t("2026-10-20"), TODAY)).toEqual({ tone: "amber", label: "Tue 20 Oct · Today", date: "Tue 20 Oct", word: "Today" });
    expect(deadlineSignal(t("2026-10-21"), TODAY)).toEqual({ tone: "amber", label: "Wed 21 Oct · Tomorrow", date: "Wed 21 Oct", word: "Tomorrow" });
    expect(deadlineSignal(t("2026-10-23"), TODAY)).toEqual({ tone: "amber", label: "Fri 23 Oct", date: "Fri 23 Oct" });
  });
  it("is the plain date further out, never a count of days, and another year's date with its year", () => {
    expect(deadlineSignal(t("2026-10-24"), TODAY)).toEqual({ tone: "plain", label: "Sat 24 Oct", date: "Sat 24 Oct" });
    expect(deadlineSignal(t("2026-11-19"), TODAY)).toEqual({ tone: "plain", label: "Thu 19 Nov", date: "Thu 19 Nov" });
    expect(deadlineSignal(t("2027-01-05"), TODAY)).toEqual({ tone: "plain", label: "5 Jan 2027", date: "5 Jan 2027" });
  });
  it("names missing dates", () => {
    expect(deadlineSignal(t(""), TODAY)).toEqual({ tone: "none", label: "No dates" });
    expect(deadlineSignal(t("", "2026-10-01"), TODAY)).toEqual({ tone: "none", label: "No deadline" });
  });
  it("never shows urgency on a done task", () => {
    expect(deadlineSignal(t("2026-10-01", "", true), TODAY)).toEqual({ tone: "done", label: "Done" });
    const doneAt = new Date(2026, 9, 17, 15, 0).getTime();
    expect(deadlineSignal({ ...t("2026-10-01", "", true), completedAt: doneAt }, TODAY)).toEqual({
      tone: "done",
      label: "Done 3 days ago",
    });
  });
});

describe("due buckets", () => {
  it("sorts tasks into Today's sections", () => {
    expect(dueBucket(t("2026-10-19"), TODAY)).toBe("overdue");
    expect(dueBucket(t("2026-10-23"), TODAY)).toBe("soon");
    expect(dueBucket(t("2026-10-30", "2026-10-20"), TODAY)).toBe("active");
    expect(dueBucket(t("2026-10-30", "2026-10-21"), TODAY)).toBe("later");
    expect(dueBucket(t(""), TODAY)).toBe("nodate");
  });
});

describe("days since the last action", () => {
  it("is plain under 7 days, amber from 7, red from 14", () => {
    expect(lastActionSignal("2026-10-14", TODAY)).toEqual({ tone: "plain", label: "Last action 6 days ago" });
    expect(lastActionSignal("2026-10-20", TODAY)).toEqual({ tone: "plain", label: "Last action today" });
    expect(lastActionSignal("2026-10-13", TODAY)).toEqual({ tone: "amber", label: "Last action 7 days ago" });
    expect(lastActionSignal("2026-10-07", TODAY)).toEqual({ tone: "amber", label: "Last action 13 days ago" });
    expect(lastActionSignal("2026-10-06", TODAY)).toEqual({ tone: "red", label: "No action for 14 days" });
    expect(lastActionSignal(undefined, TODAY)).toBeNull();
  });
  it("calls 14 days or more gone cold", () => {
    expect(isGoneCold("2026-10-07", TODAY)).toBe(false);
    expect(isGoneCold("2026-10-06", TODAY)).toBe(true);
    expect(isGoneCold(undefined, TODAY)).toBe(false);
  });
});

describe("company target date and planned outreach", () => {
  it("target date: amber within 3 days, red once missed", () => {
    expect(targetDateSignal("2026-10-24", TODAY)?.tone).toBe("plain");
    expect(targetDateSignal("2026-10-23", TODAY)).toEqual({ tone: "amber", label: "Target date in 3 days" });
    expect(targetDateSignal("2026-10-20", TODAY)).toEqual({ tone: "amber", label: "Target date today" });
    expect(targetDateSignal("2026-10-17", TODAY)).toEqual({ tone: "red", label: "Target date missed 3 days ago" });
    expect(isTargetClose("2026-10-23", TODAY)).toBe(true);
    expect(isTargetClose("2026-10-01", TODAY)).toBe(true);
    expect(isTargetClose("2026-10-24", TODAY)).toBe(false);
  });
  it("planned outreach: amber once missed", () => {
    expect(outreachSignal("2026-10-19", TODAY)?.tone).toBe("amber");
    expect(outreachSignal("2026-10-25", TODAY)?.tone).toBe("plain");
  });
});

describe("a parked task (N19)", () => {
  it("shows no urgency, only that it's parked or when it comes back", () => {
    expect(deadlineSignal({ ...t("2026-10-18"), parkedAt: 1 }, TODAY)).toEqual({ tone: "none", label: "Parked" });
    expect(deadlineSignal({ ...t("2026-10-18"), parkedAt: 1, parkedUntil: "2026-11-03" }, TODAY)).toEqual({ tone: "none", label: "Back 3 Nov" });
  });
  it("is late again once the day it was parked until comes", () => {
    expect(deadlineSignal({ ...t("2026-10-18"), parkedAt: 1, parkedUntil: "2026-10-20" }, TODAY)).toEqual({ tone: "red", label: "Sun 18 Oct · 2 days late", date: "Sun 18 Oct", word: "2 days late" });
  });
});
