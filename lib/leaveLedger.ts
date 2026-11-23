import { addDays, isoOf, parseIso, shortDate } from "./dates";
import { defaultLeavePay, LEAVE_TYPE_LABELS, workingDates } from "./leave";
import type { LeaveAdjustment, LeaveHoliday, LeaveProfile, LeaveRequest } from "./leave";

type LedgerProfile = Pick<LeaveProfile, "accrualStart" | "openingDate" | "openingBalance" | "openingCarried" | "endDate">;
type LedgerRequest = Pick<LeaveRequest, "id" | "type" | "reason" | "status" | "pay" | "start" | "end" | "half">;
type LedgerAdjustment = Pick<LeaveAdjustment, "id" | "date" | "days" | "reason">;
type Holidays = readonly Pick<LeaveHoliday, "date">[];

const lineOrder = { opening: 0, lapse: 1, accrual: 2, request: 3, adjustment: 4 } as const;

interface LedgerEntry {
  kind: keyof typeof lineOrder;
  date: string;
  days: number;
  label: string;
  sourceId?: string;
}

export interface LeaveLedgerLine extends LedgerEntry {
  balance: number;
}

export interface LeaveSummary {
  balance: number;
  upcoming: number;
  waiting: number;
  available: number;
  nextPlusOne: string | null;
  lapseWarning: number | null;
}

interface MonthlyRequestDays {
  date: string;
  days: number;
}

function nextMonthStart(date: string): string | null {
  if (date.startsWith("9999-12")) return null;
  const first = parseIso(`${date.slice(0, 7)}-01`);
  first.setMonth(first.getMonth() + 1);
  return isoOf(first);
}

function nextAccrualAfter(profile: LedgerProfile, date: string): string | null {
  const next = nextMonthStart(date < profile.openingDate ? profile.openingDate : date);
  if (!next) return null;

  const start = profile.accrualStart;
  const first = start <= next ? next : start.endsWith("-01") ? start : nextMonthStart(start);
  return first && (!profile.endDate || first <= profile.endDate) ? first : null;
}

function requestDaysByMonth(request: LedgerRequest, openingDate: string, holidays: Holidays): MonthlyRequestDays[] {
  const months: MonthlyRequestDays[] = [];
  // The opening balance already accounts for the earlier part of a request.
  const start = request.start < openingDate ? openingDate : request.start;
  const perDay = request.half ? 0.5 : 1;
  for (const date of workingDates(start, request.end, holidays)) {
    const last = months.at(-1);
    if (last && last.date.slice(0, 7) === date.slice(0, 7)) {
      last.days += perDay;
    } else {
      months.push({ date, days: perDay });
    }
  }
  return months;
}

export function buildLedger(
  profile: LedgerProfile,
  requests: readonly LedgerRequest[],
  adjustments: readonly LedgerAdjustment[],
  holidays: Holidays,
  today: string,
): { lines: LeaveLedgerLine[]; summary: LeaveSummary } {
  const entries: LedgerEntry[] = [{
    kind: "opening", date: profile.openingDate, days: profile.openingBalance, label: "Opening balance",
  }];
  for (let date = nextAccrualAfter(profile, profile.openingDate); date && date <= today; date = nextAccrualAfter(profile, date)) {
    entries.push({ kind: "accrual", date, days: 1, label: "Monthly +1" });
  }

  const waitingDebits: MonthlyRequestDays[] = [];
  for (const request of requests) {
    if (request.status === "approved" && request.pay === "deduct") {
      for (const month of requestDaysByMonth(request, profile.openingDate, holidays)) {
        entries.push({
          kind: "request", date: month.date, days: -month.days,
          label: LEAVE_TYPE_LABELS[request.type], sourceId: request.id,
        });
      }
    } else if (request.status === "waiting" && (defaultLeavePay(request) ?? "deduct") === "deduct") {
      waitingDebits.push(...requestDaysByMonth(request, profile.openingDate, holidays));
    }
  }
  for (const adjustment of adjustments) {
    if (adjustment.date >= profile.openingDate) {
      entries.push({
        kind: "adjustment", date: adjustment.date, days: adjustment.days,
        label: adjustment.reason, sourceId: adjustment.id,
      });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date)
    || lineOrder[a.kind] - lineOrder[b.kind]
    || (a.sourceId ?? "").localeCompare(b.sourceId ?? ""));

  const lines: LeaveLedgerLine[] = [];
  let nextEntry = 0;
  let runningBalance = 0;
  let balance = 0;
  let upcoming = 0;
  let lapseWarning: number | null = null;

  function addLine(entry: LedgerEntry): void {
    runningBalance += entry.days;
    lines.push({ ...entry, balance: runningBalance });
    if (entry.date <= today) balance = runningBalance;
    else if (entry.kind === "request") upcoming -= entry.days;
  }

  function addBefore(date: string): void {
    while (nextEntry < entries.length && entries[nextEntry].date < date) {
      addLine(entries[nextEntry]);
      nextEntry += 1;
    }
  }

  const openingYear = Number(profile.openingDate.slice(0, 4));
  const todayYear = Number(today.slice(0, 4));
  for (let year = openingYear; year <= todayYear && profile.openingDate <= today; year += 1) {
    const january = `${String(year).padStart(4, "0")}-01-01`;
    const march = `${january.slice(0, 4)}-03-01`;
    if (profile.endDate && march > profile.endDate) break;
    if (march <= profile.openingDate) continue;

    addBefore(january);
    const carried = year === openingYear ? profile.openingCarried : Math.max(0, runningBalance);
    if (carried <= 0) continue;

    const firstDebit = nextEntry;
    addBefore(march);
    const debits = entries.slice(firstDebit, nextEntry).reduce((total, entry) => {
      const deducts = entry.kind === "request" || (entry.kind === "adjustment" && entry.date <= today);
      return deducts ? total - Math.min(0, entry.days) : total;
    }, 0);

    if (today < march) {
      const reserved = waitingDebits.reduce((total, entry) => (
        entry.date >= january && entry.date < march ? total + entry.days : total
      ), 0);
      lapseWarning = Math.max(0, carried - debits - reserved) || null;
    } else if (carried > debits) {
      addLine({
        kind: "lapse", date: march, days: debits - carried,
        label: `${year - 1} days not used by ${shortDate(addDays(march, -1), march)}`,
      });
    }
  }

  for (const entry of entries.slice(nextEntry)) addLine(entry);
  const waiting = waitingDebits.reduce((total, entry) => total + entry.days, 0);
  return {
    lines,
    summary: { balance, upcoming, waiting, available: balance - upcoming - waiting, nextPlusOne: nextAccrualAfter(profile, today), lapseWarning },
  };
}
