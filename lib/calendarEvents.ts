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

// The route asks Google for times in the team's zone.
export const TEAM_TIME_ZONE = "Asia/Jakarta";

// Google writes times as "2026-10-20T14:30:00+07:00", in the zone asked for.
// The date and time are both read from that text, so they always agree.
function time24(dateTime: string): string {
  return dateTime.slice(11, 16);
}

export function toCalendarEvent(e: GoogleEvent): CalendarEvent {
  const allDay = !!e.start?.date;
  const start = (e.start?.date ?? e.start?.dateTime ?? "").slice(0, 10);
  let end = (e.end?.date ?? e.end?.dateTime ?? "").slice(0, 10) || start;
  // All-day end dates from Google are exclusive; the app's are inclusive.
  if (allDay && e.end?.date) end = addDays(e.end.date, -1);
  // An event ending at midnight ends on the day before.
  if (!allDay && e.end?.dateTime && time24(e.end.dateTime) === "00:00" && end > start) end = addDays(end, -1);
  if (end < start) end = start;
  return {
    id: e.id ?? "",
    title: e.summary ?? "(no title)",
    start,
    end,
    allDay,
    startTime: !allDay && e.start?.dateTime ? time24(e.start.dateTime) : undefined,
    endTime: !allDay && e.end?.dateTime ? time24(e.end.dateTime) : undefined,
    link: e.htmlLink ?? undefined,
  };
}

export function toCalendarEvents(items: GoogleEvent[]): CalendarEvent[] {
  return items.filter((e) => e.status !== "cancelled").map(toCalendarEvent);
}
