import { describe, expect, it } from "vitest";
import {
  canCancelLeave, checkRequest, dateRange, days, defaultLeavePay, LAW_LEAVE_EVENTS, LEAVE_REASON_LABELS, LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS, nextMissingHolidayYear, requestDays, requestDaysLabel, SPECIAL_LEAVE_EVENTS, workingDays,
} from "@/lib/leave";
import type { LeaveInput } from "@/lib/leave";

const today = "2027-01-12";
const holidays = [{ date: "2027-01-05" }, { date: "2027-01-20" }];
const options = { today, holidays, existing: [], isAdmin: false };
const annual = { type: "annual", start: today, end: today };

function other(reason: string, fields: Record<string, unknown> = {}) {
  return { ...annual, type: "other", reason, ...fields };
}

describe("working days and holiday coverage", () => {
  it("counts inclusively across a weekend and a holiday, even if the holiday is listed twice", () => {
    expect(workingDays("2027-01-04", "2027-01-11", [...holidays, holidays[0]])).toBe(5);
    expect(workingDays("2028-02-28", "2028-03-01", [])).toBe(3);
    expect(workingDays("2027-02-29", "2027-03-02", [])).toBe(0);
  });

  it("counts half a working day and returns zero when a holiday is added", () => {
    const half = { start: today, end: today, half: "afternoon" as const };
    expect(requestDays(half, holidays)).toBe(0.5);
    expect(requestDays(half, [...holidays, { date: today }])).toBe(0);
  });

  it("warns about each uncovered year touched, including a year across New Year", () => {
    const input = { ...annual, start: "2027-12-30", end: "2028-01-04" };
    const result = checkRequest(input, options);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(["Holidays for 2028 aren’t in the list yet, so this count may change."]);
    expect(checkRequest(input, { ...options, holidays: [] }).warnings).toEqual([
      "Holidays for 2027 aren’t in the list yet, so this count may change.",
      "Holidays for 2028 aren’t in the list yet, so this count may change.",
    ]);
    expect(nextMissingHolidayYear("2027-09-30", holidays)).toBeNull();
    expect(nextMissingHolidayYear("2027-10-01", holidays)).toBe("2028");
    expect(nextMissingHolidayYear("2027-10-01", [...holidays, { date: "2028-01-01" }])).toBeNull();
  });
});

describe("request checks", () => {
  it("returns only checked fields, with optional values normalized and the note trimmed", () => {
    const result = checkRequest({ ...annual, half: "morning", note: "  By the phone.  ", pay: "paid", status: "approved" }, options);
    expect(result).toEqual({
      request: { ...annual, half: "morning", note: "By the phone.", reason: null, event: null, hours: null },
      errors: [], warnings: [], days: 0.5,
    });
  });

  it("returns independent problems for missing, blank, noncanonical and impossible values", () => {
    for (const input of [null, [], {}, { type: "Annual", start: " ", end: "2027-02-29" }]) {
      const result = checkRequest(input, options);
      expect(result.request).toBeNull();
      expect(result.errors.map(({ field }) => field)).toEqual(["type", "start", "end"]);
    }
    expect(checkRequest({ ...annual, type: "__proto__" }, options).request).toBeNull();
    expect(checkRequest({ ...annual, end: "2027-01-11" }, options).errors).toEqual([
      { field: "end", message: "Choose an end date on or after the start date." },
    ]);
  });

  it("refuses the end date after the person's last day, including for an admin", () => {
    const lastDay = "2027-01-13";
    const profileOptions = { ...options, lastDay, isAdmin: true };
    expect(checkRequest({ ...annual, end: lastDay }, profileOptions).request?.end).toBe(lastDay);
    expect(checkRequest({ ...annual, end: "2027-01-14" }, profileOptions).errors).toEqual([
      { field: "end", message: "Choose an end date on or before the last day (Wed 13 Jan)." },
    ]);
  });

  it("accepts exactly 186 days and a start exactly 400 days away, for admins too", () => {
    const isAdmin = true;
    expect(checkRequest({ ...annual, end: "2027-07-16" }, { ...options, isAdmin }).errors).toEqual([]);
    expect(checkRequest({ ...annual, end: "2027-07-17" }, { ...options, isAdmin }).errors).toEqual([
      { field: "end", message: "Choose a range of 186 calendar days or fewer." },
    ]);
    expect(checkRequest({ ...annual, start: "2028-02-16", end: "2028-02-16" }, { ...options, isAdmin }).errors).toEqual([]);
    expect(checkRequest({ ...annual, start: "2028-02-17", end: "2028-02-17" }, { ...options, isAdmin }).errors).toEqual([
      { field: "start", message: "Choose a start date within the next 400 days." },
    ]);
  });

  it("requires a working day for full days, half days and hours", () => {
    const noWorkingDay = { field: "end", message: "These dates have no working days." };
    const weekend = { start: "2027-01-16", end: "2027-01-17" };
    expect(checkRequest({ ...annual, ...weekend }, options).errors).toEqual([noWorkingDay]);
    expect(checkRequest({ ...annual, start: weekend.start, end: weekend.start, half: "afternoon" }, options).errors).toEqual([noWorkingDay]);
    expect(checkRequest(other("hours", { start: "2027-01-20", end: "2027-01-20", hours: { from: "13:00", to: "15:00" } }), options).errors)
      .toEqual([noWorkingDay]);
  });

  it("flags the first shared date with an approved or waiting request, including a shared weekend", () => {
    const existing = [
      { start: "2027-01-15", end: "2027-01-15", status: "approved" },
      { start: "2027-01-13", end: "2027-01-13", status: "waiting" },
      { start: today, end: today, status: "rejected" },
      { start: today, end: today, status: "cancelled" },
    ] as const;
    expect(checkRequest(annual, { ...options, existing }).errors).toEqual([]);
    expect(checkRequest({ ...annual, end: "2027-01-15" }, { ...options, existing }).errors).toEqual([
      { field: "start", message: "You already have leave on Wed 13 Jan." },
    ]);
    expect(checkRequest({ ...annual, end: "2027-01-18" }, {
      ...options, isAdmin: true, existing: [{ start: "2027-01-16", end: "2027-01-18", status: "approved" }],
    }).errors).toEqual([{ field: "start", message: "You already have leave on Sat 16 Jan." }]);
  });

  it("does not allow a second half on the same day", () => {
    const existing = [{ start: today, end: today, status: "approved", half: "afternoon" }] as const;
    const result = checkRequest({ ...annual, half: "morning" }, { ...options, existing });
    expect(result.request).toBeNull();
    expect(result.errors).toEqual([{ field: "start", message: "You already have leave on Tue 12 Jan." }]);
  });

  it("allows annual leave from today, or backdated for an admin", () => {
    const past = { ...annual, start: "2027-01-11", end: "2027-01-11" };
    expect(checkRequest(annual, options).errors).toEqual([]);
    expect(checkRequest(past, options).errors).toEqual([{ field: "start", message: "Choose today or a later date." }]);
    expect(checkRequest(past, { ...options, isAdmin: true }).errors).toEqual([]);
  });

  it("allows one morning or afternoon on one annual leave date only", () => {
    expect(checkRequest({ ...annual, half: "afternoon" }, options).days).toBe(0.5);
    expect(checkRequest({ ...annual, half: "Morning" }, options).errors.map(({ field }) => field)).toEqual(["half"]);
    expect(checkRequest({ ...annual, half: "morning", end: "2027-01-13" }, options).errors.map(({ field }) => field))
      .toEqual(["end"]);
    expect(checkRequest({ ...annual, type: "sick", half: "morning" }, options).errors.map(({ field }) => field))
      .toEqual(["half"]);
    expect(checkRequest(other("unpaid", { half: "afternoon" }), options).errors.map(({ field }) => field)).toEqual(["half"]);
  });

  it("enforces both ends of the 30-day sick window, with inclusive boundaries and an admin exception", () => {
    const sick = { ...annual, type: "sick", start: "2026-12-13", end: "2027-02-11" };
    expect(checkRequest(sick, options).errors).toEqual([]);
    const outside = { ...sick, start: "2026-12-12", end: "2027-02-12" };
    expect(checkRequest(outside, options).errors).toEqual([
      { field: "start", message: "Choose a start date no more than 30 days ago." },
      { field: "end", message: "Choose an end date no more than 30 days ahead." },
    ]);
    expect(checkRequest(outside, { ...options, isAdmin: true }).errors).toEqual([]);
  });

  it("requires an Other absence reason and the matching event only where there is an event list", () => {
    expect(checkRequest(other(""), options).errors.map(({ field }) => field)).toEqual(["reason"]);
    expect(checkRequest({ ...annual, reason: "unpaid" }, options).errors.map(({ field }) => field)).toEqual(["reason"]);
    expect(checkRequest(other("special"), options).errors.map(({ field }) => field)).toEqual(["event"]);
    expect(checkRequest(other("special", { event: "maternity" }), options).errors.map(({ field }) => field)).toEqual(["event"]);
    expect(checkRequest(other("law", { event: "marriage" }), options).errors.map(({ field }) => field)).toEqual(["event"]);
    expect(checkRequest(other("unpaid", { event: "marriage" }), options).errors.map(({ field }) => field)).toEqual(["event"]);
  });

  it("counts the special leave cap in working days and lets an admin add longer", () => {
    const special = other("special", { event: "marriage", start: "2027-01-02", end: "2027-01-07" });
    expect(checkRequest(special, options)).toMatchObject({ errors: [], days: 3 });
    const longer = { ...special, end: "2027-01-08" };
    expect(checkRequest(longer, options).errors).toEqual([{ field: "end", message: "This special leave allows up to 3 days." }]);
    expect(checkRequest(longer, { ...options, isAdmin: true })).toMatchObject({ errors: [], days: 4 });
    const household = other("special", { event: "householdDeath", end: "2027-01-13" });
    expect(checkRequest(household, options).errors).toEqual([{ field: "end", message: "This special leave allows up to 1 day." }]);
  });

  it("enforces the special leave lookback and allows backdated leave by law", () => {
    const special = other("special", { event: "marriage", start: "2026-12-13", end: "2026-12-14" });
    expect(checkRequest(special, options).errors).toEqual([]);
    expect(checkRequest({ ...special, start: "2026-12-12" }, options).errors).toEqual([
      { field: "start", message: "Choose a start date no more than 30 days ago." },
    ]);
    const law = other("law", { event: "maternity", start: "2026-09-01", end: "2026-12-01" });
    expect(checkRequest(law, options).errors).toEqual([]);
  });

  it("requires both hours within the window, in order, on one date", () => {
    const hours = { from: "07:00", to: "20:00" };
    const fullWindow = other("hours", { hours });
    expect(checkRequest(fullWindow, options)).toMatchObject({ errors: [], days: 1 });
    for (const time of [undefined, {}, { from: "06:59", to: "20:01" }, { from: "07:60", to: 20 }]) {
      expect(checkRequest({ ...fullWindow, hours: time }, options).errors.map(({ field }) => field))
        .toEqual(["hours.from", "hours.to"]);
    }
    for (const to of ["08:00", "07:00"]) {
      expect(checkRequest(other("hours", { hours: { from: "08:00", to } }), options).errors).toEqual([
        { field: "hours.to", message: "The end time must be after the start time." },
      ]);
    }
    expect(checkRequest({ ...fullWindow, end: "2027-01-13" }, options).errors).toEqual([
      { field: "end", message: "Choose one date for a few hours." },
    ]);
    expect(checkRequest({ ...annual, hours }, options).errors.map(({ field }) => field)).toEqual(["hours"]);
  });

  it.each(["hours", "unpaid", "else"])("requires %s to start today or later", (reason) => {
    const fields = {
      start: "2027-01-11", end: "2027-01-11", note: "Family errand",
      hours: reason === "hours" ? { from: "13:00", to: "15:00" } : null,
    };
    expect(checkRequest(other(reason, fields), options).errors).toEqual([
      { field: "start", message: "Choose today or a later date." },
    ]);
  });

  it("requires a nonblank note for Something else and rejects notes over 500 characters", () => {
    for (const note of [undefined, "", " \n\t "]) {
      expect(checkRequest(other("else", { note }), options).errors).toEqual([
        { field: "note", message: "Add a note about this absence." },
      ]);
    }
    expect(checkRequest(other("else", { note: "x".repeat(500) }), options).errors).toEqual([]);
    expect(checkRequest({ ...annual, note: "x".repeat(501) }, options).errors).toEqual([
      { field: "note", message: "Use 500 characters or fewer." },
    ]);
    expect(checkRequest({ ...annual, note: 42 }, options).errors.map(({ field }) => field)).toEqual(["note"]);
  });
});

describe("who may cancel", () => {
  it("lets an admin cancel waiting or approved leave at any time, but never a rejected or cancelled one", () => {
    for (const status of ["waiting", "approved"] as const) {
      expect(canCancelLeave({ status, start: "2027-01-01" }, today, true)).toBe(true);
    }
    for (const status of ["rejected", "cancelled"] as const) {
      expect(canCancelLeave({ status, start: "2027-02-01" }, today, true)).toBe(false);
      expect(canCancelLeave({ status, start: "2027-02-01" }, today, false)).toBe(false);
    }
  });

  it("lets a person cancel while waiting, or approved leave that starts after today", () => {
    expect(canCancelLeave({ status: "waiting", start: "2027-01-01" }, today, false)).toBe(true);
    expect(canCancelLeave({ status: "approved", start: "2027-01-13" }, today, false)).toBe(true);
    expect(canCancelLeave({ status: "approved", start: today }, today, false)).toBe(false);
  });
});

describe("leave words and pay defaults", () => {
  it("publishes the brief’s labels, events and caps", () => {
    expect(Object.values(LEAVE_TYPE_LABELS)).toEqual(["Annual leave", "Sick", "Other absence"]);
    expect(Object.values(LEAVE_STATUS_LABELS)).toEqual(["Waiting", "Approved", "Not approved", "Cancelled"]);
    expect(Object.values(LEAVE_REASON_LABELS)).toEqual(["Special leave", "Leave by law", "A few hours", "Unpaid", "Something else"]);
    expect(Object.values(SPECIAL_LEAVE_EVENTS).map(({ days }) => days)).toEqual([3, 2, 2, 2, 2, 2, 1]);
    expect(Object.values(LAW_LEAVE_EVENTS)).toEqual(["Maternity", "Miscarriage", "Menstrual leave", "Religious duty"]);
  });

  it.each([
    [0, "0 days"], [0.5, "0.5 day"], [1, "1 day"], [2, "2 days"], [-0.5, "−0.5 day"], [-2, "−2 days"],
  ])("formats %s as %s", (count, label) => {
    expect(days(count)).toBe(label);
  });

  it("formats a holiday recount and Jakarta date ranges in the guide’s short style", () => {
    expect(requestDaysLabel(0)).toBe("0 days (holiday)");
    expect(requestDaysLabel(0.5)).toBe("0.5 day");
    expect(dateRange(today, today, today)).toBe("Tue 12 Jan");
    expect(dateRange(today, "2027-01-14", "2026-12-01")).toBe("Tue 12 – Thu 14 Jan 2027");
    expect(dateRange("2027-02-25", "2027-03-02", today)).toBe("Thu 25 Feb – Tue 2 Mar");
    expect(dateRange("2026-12-31", "2027-01-01", today)).toBe("Thu 31 Dec 2026 – Fri 1 Jan");
  });

  it.each<[LeaveInput["type"], LeaveInput["reason"], ReturnType<typeof defaultLeavePay>]>([
    ["annual", null, "deduct"], ["sick", null, "paid"], ["other", "special", "paid"], ["other", "law", "paid"],
    ["other", "hours", "paid"], ["other", "unpaid", "unpaid"], ["other", "else", null],
  ])("assigns the approval pay for %s / %s", (type, reason, pay) => {
    expect(defaultLeavePay({ type, reason })).toBe(pay);
  });
});
