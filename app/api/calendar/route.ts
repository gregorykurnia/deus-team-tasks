import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export interface GCalEvent {
  id: string;
  title: string;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd, inclusive
  allDay: boolean;
  startTime?: string; // e.g. "14:30" when not all-day
  htmlLink?: string;
}

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
    return NextResponse.json({ events: [], error: "Google Calendar not configured" }, { status: 200 });
  }

  const timeMin = req.nextUrl.searchParams.get("timeMin");
  const timeMax = req.nextUrl.searchParams.get("timeMax");
  if (!timeMin || !timeMax) {
    return NextResponse.json({ events: [], error: "timeMin and timeMax are required" }, { status: 400 });
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

    const events: GCalEvent[] = (res.data.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => {
        const allDay = !!e.start?.date;
        const start = e.start?.date ?? e.start?.dateTime ?? "";
        const end = e.end?.date ?? e.end?.dateTime ?? start;
        const startDate = start.slice(0, 10);
        // GCal all-day end dates are exclusive; convert to inclusive.
        let endDate = end.slice(0, 10);
        if (allDay && endDate) {
          const d = new Date(endDate + "T00:00:00");
          d.setDate(d.getDate() - 1);
          endDate = d.toISOString().slice(0, 10);
        }
        return {
          id: e.id ?? "",
          title: e.summary ?? "(no title)",
          start: startDate,
          end: endDate || startDate,
          allDay,
          startTime: allDay
            ? undefined
            : new Date(e.start?.dateTime ?? "").toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: e.start?.timeZone ?? "Asia/Jakarta",
              }),
          htmlLink: e.htmlLink ?? undefined,
        };
      });

    return NextResponse.json({ events });
  } catch (err) {
    console.error("Google Calendar fetch failed", err);
    return NextResponse.json({ events: [], error: "Failed to fetch Google Calendar events" }, { status: 200 });
  }
}
