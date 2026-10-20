// Team calendar events as the app shows them (D9, D10, guide 5.9): read only,
// with 24-hour start and end times or all day, and a link to open the event.
import { addDays } from "./dates";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd, inclusive
  allDay: boolean;
  startTime?: string; // "14:30", when not all day
  endTime?: string; // "15:30", when not all day
  link?: string;
}

// ok: the events. off: the calendar isn't connected. failed: it couldn't be read.
export type CalendarStatus = "ok" | "off" | "failed";

export interface CalendarResponse {
  status: CalendarStatus;
  events: CalendarEvent[];
  error?: string; // a short line for the notice
}

// The parts of a Google Calendar event this app reads.
export interface GoogleEvent {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  htmlLink?: string | null;
  start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
}

export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

function time24(dateTime: string, timeZone: string): string {
  return new Date(dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
}

export function toCalendarEvent(e: GoogleEvent, timeZone = DEFAULT_TIME_ZONE): CalendarEvent {
  const allDay = !!e.start?.date;
  const start = (e.start?.date ?? e.start?.dateTime ?? "").slice(0, 10);
  let end = (e.end?.date ?? e.end?.dateTime ?? "").slice(0, 10) || start;
  // All-day end dates from Google are exclusive; the app's are inclusive.
  if (allDay && e.end?.date) end = addDays(e.end.date, -1);
  if (end < start) end = start;
  const zone = e.start?.timeZone ?? timeZone;
  return {
    id: e.id ?? "",
    title: e.summary ?? "(no title)",
    start,
    end,
    allDay,
    startTime: !allDay && e.start?.dateTime ? time24(e.start.dateTime, zone) : undefined,
    endTime: !allDay && e.end?.dateTime ? time24(e.end.dateTime, e.end.timeZone ?? zone) : undefined,
    link: e.htmlLink ?? undefined,
  };
}

export function toCalendarEvents(items: GoogleEvent[], timeZone = DEFAULT_TIME_ZONE): CalendarEvent[] {
  return items.filter((e) => e.status !== "cancelled").map((e) => toCalendarEvent(e, timeZone));
}
