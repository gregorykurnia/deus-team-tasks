// Calendar days as "yyyy-mm-dd" strings in local time, the way tasks and
// companies store them.

const DAY_MS = 86_400_000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isoOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayIso(now: Date = new Date()): string {
  return isoOf(now);
}

export function isIsoDay(value: unknown): value is string {
  // Written back it must read the same: "2026-13-40" would otherwise roll over into January 2027.
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isoOf(parseIso(value)) === value;
}

// The Leave fields accept a day-first date or an ISO date pasted from elsewhere.
export function parseDayFirstDate(text: string): string | null {
  const value = text.trim();
  if (isIsoDay(value)) return value;
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const parts = numeric ?? /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(value);
  if (!parts) return null;
  const [, day, monthText, year] = parts;
  const name = monthText.toLowerCase();
  const month = numeric ? Number(monthText) : 1 + MONTHS_LONG.findIndex((full, index) =>
    name === full.toLowerCase() || name === MONTHS_SHORT[index].toLowerCase());
  const iso = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isIsoDay(iso) ? iso : null;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

// Whole days from `from` to `to`: positive when `to` is later.
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
}

export function isWeekend(iso: string): boolean {
  const day = parseIso(iso).getDay();
  return day === 0 || day === 6;
}

// "3 Nov", with the year when it isn't this year's.
export function shortDate(iso: string, today: string = todayIso()): string {
  const d = parseIso(iso);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

// "Thu 23 Oct", with the year when it isn't this year's.
export function weekdayDate(iso: string, today: string = todayIso()): string {
  return `${WEEKDAYS_SHORT[parseIso(iso).getDay()]} ${shortDate(iso, today)}`;
}

// "October 2026", from "2026-10".
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

// "today", "yesterday", "3 days ago", or the date for anything in the future.
export function ago(iso: string, today: string = todayIso()): string {
  const n = daysBetween(iso, today);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 0) return shortDate(iso, today);
  return `${n.toLocaleString("en-US")} days ago`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

// "Thu 23": the weekday and the day of the month.
export function dayLabel(iso: string): string {
  const d = parseIso(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
}

// "Tuesday, 20 October", for a page's subtitle.
export function longDayLabel(iso: string): string {
  const d = parseIso(iso);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}
