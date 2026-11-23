import { describe, expect, it } from "vitest";
import { buildLedger } from "@/lib/leaveLedger";

type Profile = Parameters<typeof buildLedger>[0];
type Request = Parameters<typeof buildLedger>[1][number];

const openingDate = "2026-12-01";
const holidays = [
  { date: "2026-12-25" }, { date: "2027-01-01" }, { date: "2027-01-05" }, { date: "2027-02-06" },
];

function profile(openingBalance: number, overrides: Partial<Profile> = {}): Profile {
  return { openingDate, openingBalance, openingCarried: 0, accrualStart: "2026-01-01", endDate: null, ...overrides };
}

function annual(id: string, start: string, end: string = start, overrides: Partial<Request> = {}): Request {
  return { id, start, end, type: "annual", reason: null, half: null, status: "approved", pay: "deduct", ...overrides };
}

function adjustment(date: string, days: number) {
  return { id: date, date, days, reason: "Balance correction" };
}

describe("the ledger’s worked example", () => {
  it("keeps Calista’s leave in advance and starts her +1s in February", () => {
    const calista = profile(0, { accrualStart: "2027-02-01" });
    const requests = [annual("jan", "2027-01-12", "2027-01-14")];
    const at = (today: string) => buildLedger(calista, requests, [], holidays, today);
    expect(at("2027-01-31").summary).toEqual({
      balance: -3, upcoming: 0, waiting: 0, available: -3, nextPlusOne: "2027-02-01", lapseWarning: null,
    });
    expect(at("2027-02-01").summary.balance).toBe(-2);
    const march = at("2027-03-01");
    expect(march.summary.balance).toBe(-1);
    expect(march.lines.map(({ kind, date, days, balance }) => [kind, date, days, balance])).toEqual([
      ["opening", "2026-12-01", 0, 0],
      ["request", "2027-01-12", -3, -3],
      ["accrual", "2027-02-01", 1, -2],
      ["accrual", "2027-03-01", 1, -1],
    ]);
  });

  it("charges Audrey for cuti bersama, skips the January holiday, and lapses exactly 2.5 days", () => {
    const requests = [
      annual("christmas-eve", "2026-12-24"),
      annual("jan", "2027-01-04", "2027-01-06"),
      annual("feb", "2027-02-05", "2027-02-05", { half: "morning" }),
    ];
    const at = (today: string) => buildLedger(profile(6), requests, [], holidays, today);
    expect(at("2026-12-31").summary.balance).toBe(5);
    expect(at("2027-01-06").summary.balance).toBe(4);
    expect(at("2027-02-10").summary.lapseWarning).toBe(2.5);
    expect(at("2027-02-28").summary.balance).toBe(4.5);
    const march = at("2027-03-01");
    expect(march.summary.balance).toBe(3);
    expect(march.summary.lapseWarning).toBeNull();
    expect(march.lines.map(({ kind, date, days, balance }) => [kind, date, days, balance])).toEqual([
      ["opening", "2026-12-01", 6, 6],
      ["request", "2026-12-24", -1, 5],
      ["accrual", "2027-01-01", 1, 6],
      ["request", "2027-01-04", -2, 4],
      ["accrual", "2027-02-01", 1, 5],
      ["request", "2027-02-05", -0.5, 4.5],
      ["lapse", "2027-03-01", -2.5, 2],
      ["accrual", "2027-03-01", 1, 3],
    ]);
    expect(march.lines.find(({ kind }) => kind === "lapse")?.label).toBe("2026 days not used by 28 Feb");
  });

  it("accounts for Gregory’s negative adjustment and splits his four days at 1 March", () => {
    const gregory = profile(10, { accrualStart: "2020-01-01" });
    const requests = [annual("feb-mar", "2027-02-25", "2027-03-02")];
    const adjustments = [adjustment("2027-01-20", -5)];
    expect(buildLedger(gregory, requests, adjustments, holidays, "2027-02-28").summary).toMatchObject({
      balance: 5, upcoming: 2, lapseWarning: 3,
    });
    const march = buildLedger(gregory, requests, adjustments, holidays, "2027-03-01");
    expect(march.summary.balance).toBe(1);
    expect(march.lines.map(({ kind, date, days, balance }) => [kind, date, days, balance])).toEqual([
      ["opening", "2026-12-01", 10, 10],
      ["accrual", "2027-01-01", 1, 11],
      ["adjustment", "2027-01-20", -5, 6],
      ["accrual", "2027-02-01", 1, 7],
      ["request", "2027-02-25", -2, 5],
      ["lapse", "2027-03-01", -3, 2],
      ["accrual", "2027-03-01", 1, 3],
      ["request", "2027-03-01", -2, 1],
    ]);
  });
});

describe("ledger boundaries and lapse", () => {
  it("does not add a +1 to a first-of-month opening and waits for the first eligible 1st", () => {
    const start = profile(7, { accrualStart: "2027-01-12" });
    const december = buildLedger(start, [], [], [], openingDate);
    expect(december.lines).toEqual([{ kind: "opening", label: "Opening balance", date: openingDate, days: 7, balance: 7 }]);
    expect(december.summary.nextPlusOne).toBe("2027-02-01");
    const february = buildLedger(start, [], [], [], "2027-02-01");
    expect(february.summary).toMatchObject({ balance: 8, nextPlusOne: "2027-03-01" });
  });

  it("splits New Year at the first working day of each month", () => {
    const requests = [annual("new-year", "2026-12-30", "2027-01-05")];
    const december = buildLedger(profile(6), requests, [], holidays, "2026-12-31");
    expect(december.lines.filter(({ kind }) => kind === "request")).toEqual([
      { kind: "request", date: "2026-12-30", days: -2, balance: 4, label: "Annual leave", sourceId: "new-year" },
      { kind: "request", date: "2027-01-04", days: -1, balance: 3, label: "Annual leave", sourceId: "new-year" },
    ]);
    expect(december.summary).toMatchObject({ balance: 4, upcoming: 1, available: 3, nextPlusOne: "2027-01-01" });
    const january = buildLedger(profile(6), requests, [], holidays, "2027-01-04");
    expect(january.summary).toMatchObject({ balance: 4, upcoming: 0, lapseWarning: 3 });
  });

  it("uses openingCarried for a 15 January opening, with debits from the opening date onward", () => {
    const start = profile(5, { openingDate: "2027-01-15", openingCarried: 3 });
    const requests = [
      annual("before", "2027-01-11", "2027-01-13"),
      annual("straddles", "2027-01-14", "2027-01-15"),
    ];
    const adjustments = [adjustment("2027-01-14", -1), adjustment("2027-01-20", -0.5)];
    const at = (today: string) => buildLedger(start, requests, adjustments, [], today);
    expect(at("2027-01-14").summary).toMatchObject({ balance: 0, lapseWarning: null });
    expect(at("2027-01-15").summary).toMatchObject({ balance: 4, lapseWarning: 2 });
    expect(at("2027-02-28").summary).toMatchObject({ balance: 4.5, lapseWarning: 1.5 });
    expect(at("2027-03-01").lines.map(({ kind, date, days }) => [kind, date, days])).toEqual([
      ["opening", "2027-01-15", 5],
      ["request", "2027-01-15", -1],
      ["adjustment", "2027-01-20", -0.5],
      ["accrual", "2027-02-01", 1],
      ["lapse", "2027-03-01", -1.5],
      ["accrual", "2027-03-01", 1],
    ]);
  });

  it("stops +1s and lapses after the last day, and includes both if the last day is 1 March", () => {
    const januaryEnd = profile(4, { endDate: "2027-01-31" });
    expect(buildLedger(januaryEnd, [], [], [], "2027-01-10").summary)
      .toMatchObject({ balance: 5, nextPlusOne: null, lapseWarning: null });
    const after = buildLedger(januaryEnd, [], [], [], "2027-03-02");
    expect(after.lines.map(({ date }) => date)).toEqual([openingDate, "2027-01-01"]);
    expect(after.summary.balance).toBe(5);

    const marchEnd = buildLedger(profile(4, { endDate: "2027-03-01" }), [], [], [], "2027-04-01");
    expect(marchEnd.lines.filter(({ date }) => date === "2027-03-01").map(({ kind, days }) => [kind, days]))
      .toEqual([["lapse", -4], ["accrual", 1]]);
    expect(marchEnd.summary).toMatchObject({ balance: 3, nextPlusOne: null });
  });

  it("lapses the positive carry when none was used and counts a later year from the resulting balance", () => {
    const ledger = buildLedger(profile(4), [], [], [], "2028-03-01");
    expect(ledger.lines.filter(({ kind }) => kind === "lapse").map(({ date, days, balance }) => [date, days, balance]))
      .toEqual([["2027-03-01", -4, 2], ["2028-03-01", -12, 2]]);
    expect(ledger.summary.balance).toBe(3);
  });

  it("emits no lapse when the carry was used up or the December balance was negative", () => {
    const requests = [annual("used-up", "2027-01-11", "2027-01-14")];
    const usedUp = buildLedger(profile(4), requests, [], [], "2027-03-01");
    expect(usedUp.lines.some(({ kind }) => kind === "lapse")).toBe(false);
    expect(usedUp.summary.balance).toBe(3);
    const inDebt = buildLedger(profile(-2), [], [], [], "2027-03-01");
    expect(inDebt.lines.some(({ kind }) => kind === "lapse")).toBe(false);
    expect(inDebt.summary.balance).toBe(1);
  });

  it("keeps credits in January and processes 1 March as lapse, accrual, leave, then adjustment", () => {
    const adjustments = [adjustment("2027-01-20", 7), adjustment("2027-03-01", 2)];
    const requests = [annual("march", "2027-03-01")];
    const february = buildLedger(profile(4), requests, adjustments, [], "2027-02-01");
    expect(february.summary.lapseWarning).toBe(4);
    const march = buildLedger(profile(4), requests, adjustments, [], "2027-03-01");
    expect(march.lines.filter(({ date }) => date === "2027-03-01").map(({ kind, days, balance }) => [kind, days, balance]))
      .toEqual([["lapse", -4, 9], ["accrual", 1, 10], ["request", -1, 9], ["adjustment", 2, 11]]);
    expect(march.summary.balance).toBe(11);
  });

  it("counts 29 February in the carry window in a leap year", () => {
    const start = profile(5, { openingDate: "2027-12-01" });
    const requests = [annual("leap", "2028-02-28", "2028-03-01")];
    const february = buildLedger(start, requests, [], [], "2028-02-29");
    expect(february.summary).toMatchObject({ balance: 5, upcoming: 1, lapseWarning: 3, nextPlusOne: "2028-03-01" });
    const march = buildLedger(start, requests, [], [], "2028-03-01");
    expect(march.lines.filter(({ date }) => date === "2028-03-01").map(({ label, days, balance }) => [label, days, balance]))
      .toEqual([["2027 days not used by 29 Feb", -3, 2], ["Monthly +1", 1, 3], ["Annual leave", -1, 2]]);
  });
});

describe("reserves and recomputing from the current records", () => {
  it("reserves upcoming approved and waiting deductible leave and uses only Jan–Feb dates for the warning", () => {
    const requests = [
      annual("approved-jan", "2027-01-14", "2027-01-15"),
      annual("approved-mar", "2027-03-04", "2027-03-05"),
      annual("waiting-half", "2027-01-19", "2027-01-19", { status: "waiting", pay: null, half: "morning" }),
      annual("waiting-other", "2027-02-24", "2027-02-25", { status: "waiting", type: "other", reason: "else", pay: null }),
      annual("waiting-sick", "2027-01-21", "2027-01-21", { status: "waiting", type: "sick", pay: null }),
      annual("paid-other", "2027-01-27", "2027-01-27", { type: "other", reason: "else", pay: "paid" }),
      annual("rejected", "2027-01-28", "2027-01-28", { status: "rejected", pay: null }),
      annual("cancelled", "2027-01-29", "2027-01-29", { status: "cancelled" }),
    ];
    const at = (today: string) => buildLedger(profile(6), requests, [], holidays, today);
    expect(at("2027-01-12").summary).toEqual({
      balance: 7, upcoming: 4, waiting: 2.5, available: 0.5, nextPlusOne: "2027-02-01", lapseWarning: 1.5,
    });
    expect(at("2027-01-14").summary).toMatchObject({ balance: 5, upcoming: 2, available: 0.5, lapseWarning: 1.5 });
    expect(at("2027-03-01").summary).toMatchObject({ balance: 3, waiting: 2.5, available: -1.5, lapseWarning: null });
  });

  it("moves a reservation to the approved debit or releases it when the admin chooses paid", () => {
    const request = annual("other", "2027-01-13", "2027-01-13", { type: "other", reason: "else" });
    const at = (overrides: Partial<Request>) => buildLedger(profile(2), [{ ...request, ...overrides }], [], [], "2027-01-12").summary;
    expect(at({ status: "waiting", pay: null })).toMatchObject({ available: 2, waiting: 1, upcoming: 0 });
    expect(at({ pay: "deduct" })).toMatchObject({ available: 2, waiting: 0, upcoming: 1 });
    expect(at({ pay: "paid" })).toMatchObject({ available: 3, waiting: 0, upcoming: 0 });
  });

  it("turns approved leave into zero deductible days when a holiday is added", () => {
    const requests = [annual("holiday", "2027-01-13", "2027-01-13", { half: "afternoon" })];
    const today = "2027-01-13";
    const before = buildLedger(profile(2), requests, [], holidays, today);
    expect(before.summary).toMatchObject({ balance: 2.5, lapseWarning: 1.5 });
    const after = buildLedger(profile(2), requests, [], [...holidays, { date: today }], today);
    expect(after.lines.some(({ kind }) => kind === "request")).toBe(false);
    expect(after.summary).toMatchObject({ balance: 3, lapseWarning: 2 });
    expect(buildLedger(profile(2), requests, [], holidays, today)).toEqual(before);
  });

  it("rebuilds the same running balances on a repeat call and with the records in a different order", () => {
    const start = Object.freeze(profile(3));
    const requests = Object.freeze([Object.freeze(annual("one", "2027-01-13")), Object.freeze(annual("two", "2027-01-12"))]);
    const adjustments = Object.freeze([Object.freeze(adjustment("2027-01-20", 1)), Object.freeze(adjustment("2027-01-11", 2))]);
    const today = "2027-01-20";
    const first = buildLedger(start, requests, adjustments, holidays, today);
    expect(first.summary).toMatchObject({ balance: 5, lapseWarning: 1 });
    expect(buildLedger(start, requests, adjustments, holidays, today)).toEqual(first);
    expect(buildLedger(start, [...requests].reverse(), [...adjustments].reverse(), holidays, today)).toEqual(first);
  });
});
