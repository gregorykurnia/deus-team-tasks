import { addDays, dayLabel, daysBetween, isIsoDay, isWeekend, weekdayDate } from "./dates";

export const LEAVE_TYPE_LABELS = {
  annual: "Annual leave",
  sick: "Sick",
  other: "Other absence",
} as const;

export const LEAVE_REASON_LABELS = {
  special: "Special leave",
  law: "Leave by law",
  hours: "A few hours",
  unpaid: "Unpaid",
  else: "Something else",
} as const;

export const LEAVE_STATUS_LABELS = {
  waiting: "Waiting",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
} as const;

export const SPECIAL_LEAVE_EVENTS = {
  marriage: { label: "Own marriage", days: 3 },
  childMarriage: { label: "Child’s marriage", days: 2 },
  childCircumcision: { label: "Child’s circumcision", days: 2 },
  childBaptism: { label: "Child’s baptism", days: 2 },
  wifeBirthOrMiscarriage: { label: "Wife giving birth or miscarrying", days: 2 },
  closeFamilyDeath: { label: "Death of a spouse, parent, parent-in-law, child or child-in-law", days: 2 },
  householdDeath: { label: "Death of another household member", days: 1 },
} as const;

export const LAW_LEAVE_EVENTS = {
  maternity: "Maternity",
  miscarriage: "Miscarriage",
  menstrual: "Menstrual leave",
  religiousDuty: "Religious duty",
} as const;

export type LeaveType = keyof typeof LEAVE_TYPE_LABELS;
export type LeaveReason = keyof typeof LEAVE_REASON_LABELS;
export type LeaveStatus = keyof typeof LEAVE_STATUS_LABELS;
export type LeaveEvent = keyof typeof SPECIAL_LEAVE_EVENTS | keyof typeof LAW_LEAVE_EVENTS;
export type LeavePay = "deduct" | "paid" | "unpaid";
export type LeaveHalf = "morning" | "afternoon";
export interface LeaveHours { from: string; to: string }

export interface LeaveInput {
  type: LeaveType;
  reason: LeaveReason | null;
  event: LeaveEvent | null;
  start: string;
  end: string;
  half: LeaveHalf | null;
  hours: LeaveHours | null;
  note: string;
}

export interface LeaveProfile {
  email: string;
  name: string;
  joinDate: string;
  accrualStart: string;
  openingBalance: number;
  openingDate: string;
  openingCarried: number;
  endDate: string | null;
  updatedAt: number;
}

export type LeaveProfileDetails = Pick<LeaveProfile,
  "joinDate" | "accrualStart" | "openingBalance" | "openingDate" | "openingCarried" | "endDate">;
export type LeaveProfileField = keyof LeaveProfileDetails;

export interface LeaveAudit {
  id: string;
  email: string;
  by: string;
  at: number;
  field: LeaveProfileField;
  from: string | number | null;
  to: string | number | null;
}

export interface LeaveRequest extends LeaveInput {
  id: string;
  email: string;
  name: string;
  status: LeaveStatus;
  pay: LeavePay | null;
  createdBy: string;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  rejectReason: string | null;
  cancelledBy: string | null;
  cancelledAt: number | null;
}

export interface LeaveAdjustment {
  id: string;
  email: string;
  days: number;
  reason: string;
  date: string;
  by: string;
  at: number;
}

export function canCancelLeave(request: Pick<LeaveRequest, "status" | "start">, today: string, isAdmin: boolean): boolean {
  return request.status !== "cancelled" && (isAdmin || request.status === "waiting" || (request.status === "approved" && request.start > today));
}

export type LeaveAdjustmentInput = Pick<LeaveAdjustment, "email" | "days" | "reason"> & { date?: string };
export type LeaveDecision = { decision: "approve"; pay?: LeavePay } | { decision: "reject"; reason: string };

export interface LeaveHoliday {
  date: string;
  name: string;
}

type Holidays = readonly Pick<LeaveHoliday, "date">[];
type RequestDates = Pick<LeaveInput, "start" | "end" | "half">;

export function workingDates(start: string, end: string, holidays: Holidays): string[] {
  if (!isIsoDay(start) || !isIsoDay(end) || start > end) return [];

  const closed = new Set(holidays.map(({ date }) => date));
  const dates: string[] = [];
  for (let date = start; ; date = addDays(date, 1)) {
    if (!closed.has(date) && !isWeekend(date)) dates.push(date);
    if (date === end) break;
  }
  return dates;
}

export function workingDays(start: string, end: string, holidays: Holidays): number {
  return workingDates(start, end, holidays).length;
}

export function requestDays(request: RequestDates, holidays: Holidays): number {
  return workingDays(request.start, request.end, holidays) * (request.half ? 0.5 : 1);
}

export function defaultLeavePay(request: Pick<LeaveInput, "type" | "reason">): LeavePay | null {
  if (request.type === "annual") return "deduct";
  if (request.type === "other" && request.reason === "else") return null;
  if (request.type === "other" && request.reason === "unpaid") return "unpaid";
  return "paid";
}

export function days(count: number): string {
  const amount = Math.abs(count);
  const unit = amount === 0.5 || amount === 1 ? "day" : "days";
  return `${count < 0 ? "−" : ""}${amount.toLocaleString("en-US")} ${unit}`;
}

export function requestDaysLabel(count: number): string {
  return count === 0 ? "0 days (holiday)" : days(count);
}

export function dateRange(start: string, end: string, today: string): string {
  if (start === end) return weekdayDate(start, today);
  const first = start.slice(0, 7) === end.slice(0, 7) ? dayLabel(start) : weekdayDate(start, end);
  return `${first} – ${weekdayDate(end, today)}`;
}

function hasHolidays(year: string, holidays: Holidays): boolean {
  return holidays.some(({ date }) => date.startsWith(`${year}-`));
}

export function nextMissingHolidayYear(today: string, holidays: Holidays): string | null {
  const year = today.slice(0, 4);
  if (today < `${year}-10-01`) return null;
  const nextYear = String(Number(year) + 1).padStart(4, "0");
  return hasHolidays(nextYear, holidays) ? null : nextYear;
}

function holidayWarnings(start: string, end: string, holidays: Holidays): string[] {
  const warnings: string[] = [];
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year += 1) {
    if (!hasHolidays(String(year).padStart(4, "0"), holidays)) {
      warnings.push(`Holidays for ${year} aren’t in the list yet, so this count may change.`);
    }
  }
  return warnings;
}

type RequestField = keyof LeaveInput | "hours.from" | "hours.to";
export interface LeaveIssue {
  field: RequestField | LeaveProfileField | "email" | "pay" | "days" | "date" | "name" | "decision";
  message: string;
}
type Refuse = (field: RequestField, message: string) => void;
type ExistingRequest = Pick<LeaveRequest, "start" | "end" | "status">;

interface RequestOptions {
  today: string;
  holidays: Holidays;
  existing: readonly ExistingRequest[]; // The person's own requests.
  isAdmin: boolean;
}

export interface LeaveRequestCheck {
  request: LeaveInput | null;
  errors: LeaveIssue[];
  warnings: string[];
  days: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isKey<T extends object>(list: T, value: unknown): value is Extract<keyof T, string> {
  return typeof value === "string" && Object.hasOwn(list, value);
}

function isLeaveTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:[0-5]\d$/.test(value) && value >= "07:00" && value <= "20:00";
}

function checkHours(value: unknown, refuse: Refuse): LeaveHours | null {
  const { from, to } = record(value);
  const validFrom = isLeaveTime(from);
  const validTo = isLeaveTime(to);
  if (!validFrom) refuse("hours.from", "Enter a start time between 07:00 and 20:00.");
  if (!validTo) refuse("hours.to", "Enter an end time between 07:00 and 20:00.");
  if (!validFrom || !validTo) return null;
  if (to <= from) refuse("hours.to", "The end time must be after the start time.");
  return { from, to };
}

function checkDateLimits(
  type: LeaveType | null, reason: LeaveReason | null, start: string | null, end: string | null,
  { today, isAdmin }: RequestOptions, refuse: Refuse,
): void {
  if (start) {
    const offset = daysBetween(today, start);
    if (offset > 400) refuse("start", "Choose a start date within the next 400 days.");
    if (((type === "annual" && !isAdmin) || reason === "hours" || reason === "unpaid" || reason === "else") && offset < 0) {
      refuse("start", "Choose today or a later date.");
    }
    if (((type === "sick" && !isAdmin) || reason === "special") && offset < -30) {
      refuse("start", "Choose a start date no more than 30 days ago.");
    }
  }
  if (end && type === "sick" && !isAdmin && daysBetween(today, end) > 30) {
    refuse("end", "Choose an end date no more than 30 days ahead.");
  }
}

function firstOverlap(start: string, end: string, existing: readonly ExistingRequest[]): string | null {
  let first: string | null = null;
  for (const request of existing) {
    if (request.status !== "waiting" && request.status !== "approved") continue;
    if (request.start > end || request.end < start) continue;
    const sharedDay = request.start < start ? start : request.start;
    if (first === null || sharedDay < first) first = sharedDay;
  }
  return first;
}

export function checkRequest(input: unknown, options: RequestOptions): LeaveRequestCheck {
  const raw = record(input);
  const errors: LeaveIssue[] = [];
  const refuse: Refuse = (field, message) => { errors.push({ field, message }); };
  const type = isKey(LEAVE_TYPE_LABELS, raw.type) ? raw.type : null;
  const reason = type === "other" && isKey(LEAVE_REASON_LABELS, raw.reason) ? raw.reason : null;
  const special = reason === "special" && isKey(SPECIAL_LEAVE_EVENTS, raw.event) ? raw.event : null;
  const law = reason === "law" && isKey(LAW_LEAVE_EVENTS, raw.event) ? raw.event : null;
  const event = special ?? law;
  const start = isIsoDay(raw.start) ? raw.start : null;
  const end = isIsoDay(raw.end) ? raw.end : null;
  const half = raw.half === "morning" || raw.half === "afternoon" ? raw.half : null;
  const hours = reason === "hours" ? checkHours(raw.hours, refuse) : null;
  const note = typeof raw.note === "string" ? raw.note.trim() : "";

  if (!type) refuse("type", "Choose a leave type.");
  if (type === "other" && !reason) refuse("reason", "Choose an absence reason.");
  if (type && type !== "other" && raw.reason != null) refuse("reason", "Only other absences have a reason to choose.");
  if (reason === "special" || reason === "law") {
    if (!event) refuse("event", "Choose an event for this reason.");
  } else if (raw.event != null) {
    refuse("event", "Choose an event only for special leave or leave by law.");
  }
  if (raw.half != null) {
    if (type !== "annual") refuse("half", "Only annual leave can be a half day.");
    else if (!half) refuse("half", "Choose morning or afternoon for a half day.");
  }
  if (reason !== "hours" && raw.hours != null) refuse("hours", "Enter times only for a few hours.");
  if (raw.note != null && typeof raw.note !== "string") refuse("note", "Enter a note as text.");
  else if (typeof raw.note === "string" && raw.note.length > 500) refuse("note", "Use 500 characters or fewer.");
  else if (reason === "else" && !note) refuse("note", "Add a note about this absence.");
  if (!start) refuse("start", "Enter a valid start date.");
  if (!end) refuse("end", "Enter a valid end date.");

  checkDateLimits(type, reason, start, end, options, refuse);
  let count = 0;
  let warnings: string[] = [];
  if (start && end) {
    if (end < start) {
      refuse("end", "Choose an end date on or after the start date.");
    } else {
      if (end !== start && half && type === "annual") refuse("end", "Choose one date for a half day.");
      if (end !== start && reason === "hours") refuse("end", "Choose one date for a few hours.");
      const sharedDay = firstOverlap(start, end, options.existing);
      if (sharedDay) refuse("start", `You already have leave on ${weekdayDate(sharedDay, options.today)}.`);

      if (daysBetween(start, end) >= 186) {
        refuse("end", "Choose a range of 186 calendar days or fewer.");
      } else {
        count = requestDays({ start, end, half: type === "annual" ? half : null }, options.holidays);
        if (count === 0) refuse("end", "These dates have no working days.");
        if (special && !options.isAdmin && count > SPECIAL_LEAVE_EVENTS[special].days) {
          refuse("end", `This special leave allows up to ${days(SPECIAL_LEAVE_EVENTS[special].days)}.`);
        }
        warnings = holidayWarnings(start, end, options.holidays);
      }
    }
  }

  return {
    request: type && start && end && errors.length === 0 ? { type, reason, event, start, end, half, hours, note } : null,
    errors,
    warnings,
    days: count,
  };
}
