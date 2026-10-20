import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { toCalendarEvents, type CalendarEvent, type CalendarResponse } from "@/lib/calendarEvents";

// The old calendar screen reads this name. Phase 4 (task 4.7) removes it.
export type GCalEvent = CalendarEvent;

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
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });
    return NextResponse.json<CalendarResponse>({ status: "ok", events: toCalendarEvents(res.data.items ?? []) });
  } catch (err) {
    console.error("Google Calendar fetch failed", err);
    return NextResponse.json<CalendarResponse>({ status: "failed", events: [], error: "Failed to fetch Google Calendar events" });
  }
}
