// Free and busy times per Asia/Jakarta day (UTC+7 all year, no daylight saving), for chat time suggestions.
export const WORK_START = "09:00";
export const WORK_END = "17:00";
export const MAX_FREE_TIME_DAYS = 14;
const MIN_FREE_MINUTES = 15;
const JAKARTA = "+07:00";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface BusyBlock { start: string; end: string }
export interface FreeTimeDay { date: string; weekday: string; busy: string[]; free: string[] }

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const label = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Every day from start to end inclusive, or an error to show the owner. */
export function freeTimeDates(startDate: string, endDate: string): { dates: string[] } | { error: string } {
  if (!isDay(startDate) || !isDay(endDate)) return { error: "Use real yyyy-mm-dd dates." };
  const dates: string[] = [];
  for (let day = Date.parse(`${startDate}T00:00:00Z`); day <= Date.parse(`${endDate}T00:00:00Z`); day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  if (!dates.length) return { error: "The end date must be on or after the start date." };
  if (dates.length > MAX_FREE_TIME_DAYS) return { error: `Check at most ${MAX_FREE_TIME_DAYS} days at a time.` };
  return { dates };
}

/** The window to ask the calendar about: start of the first day to the end of the last, in Jakarta. */
export function freeTimeWindow(dates: string[]) {
  const last = Date.parse(`${dates[dates.length - 1]}T00:00:00${JAKARTA}`) + 86_400_000;
  return { timeMin: new Date(`${dates[0]}T00:00:00${JAKARTA}`).toISOString(), timeMax: new Date(last).toISOString() };
}

/** Busy blocks (whole day, merged) and free gaps inside working hours, as HH:MM–HH:MM labels. */
export function freeTimeDays(dates: string[], busy: BusyBlock[]): FreeTimeDay[] {
  return dates.map((date) => {
    const dayStart = Date.parse(`${date}T00:00:00${JAKARTA}`);
    const blocks = busy
      .map(({ start, end }) => [Math.max(0, (Date.parse(start) - dayStart) / 60_000), Math.min(1440, (Date.parse(end) - dayStart) / 60_000)])
      .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
      .map(([from, to]) => [Math.floor(from), Math.ceil(to)])
      .sort((a, b) => a[0] - b[0]);
    const merged: number[][] = [];
    for (const block of blocks) {
      const previous = merged[merged.length - 1];
      if (previous && block[0] <= previous[1]) previous[1] = Math.max(previous[1], block[1]);
      else merged.push([...block]);
    }
    const free: string[] = [];
    let cursor = minutes(WORK_START);
    for (const [from, to] of [...merged, [minutes(WORK_END), minutes(WORK_END)]]) {
      const gapEnd = Math.min(from, minutes(WORK_END));
      if (gapEnd - cursor >= MIN_FREE_MINUTES) free.push(`${label(cursor)}–${label(gapEnd)}`);
      cursor = Math.max(cursor, to);
      if (cursor >= minutes(WORK_END)) break;
    }
    return {
      date,
      weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
      busy: merged.map(([from, to]) => `${label(from)}–${label(to)}`),
      free,
    };
  });
}
