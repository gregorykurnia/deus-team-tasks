import { google, type calendar_v3 } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { TEAM_TIME_ZONE, toCalendarEvents, type CalendarEvent, type CalendarResponse } from "@/lib/calendarEvents";

// The old calendar screen reads this name. Phase 4 (task 4.7) removes it.
export type GCalEvent = CalendarEvent;

// Google sends at most 2,500 events a page. Plan asks for ten weeks, so a few pages at most; the cap only guards a loop.
const PAGE_SIZE = 2500;
const MAX_PAGES = 10;

function auth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

export async function GET(req: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json<CalendarResponse>({ status: "off", events: [], error: "Google Calendar not configured" });
  }

  const timeMin = req.nextUrl.searchParams.get("timeMin");
  const timeMax = req.nextUrl.searchParams.get("timeMax");
  if (!timeMin || !timeMax) {
    return NextResponse.json<CalendarResponse>(
      { status: "failed", events: [], error: "timeMin and timeMax are required" },
      { status: 400 }
    );
  }

  try {
    const calendar = google.calendar({ version: "v3", auth: auth() });
    // Every page, so a busy run of weeks never drops its later events.
    const items: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        timeZone: TEAM_TIME_ZONE,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: PAGE_SIZE,
        pageToken,
      });
      items.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
    return NextResponse.json<CalendarResponse>({ status: "ok", events: toCalendarEvents(items) });
  } catch (err) {
    console.error("Google Calendar fetch failed", err);
    return NextResponse.json<CalendarResponse>({ status: "failed", events: [], error: "Failed to fetch Google Calendar events" });
  }
}
