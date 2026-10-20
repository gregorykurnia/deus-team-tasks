import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { toCalendarEvents } from "@/lib/calendarEvents";

const list = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: class {} },
    calendar: () => ({ events: { list } }),
  },
}));

const { GET } = await import("@/app/api/calendar/route");

const url = (q = "?timeMin=2026-10-01T00:00:00Z&timeMax=2026-11-01T00:00:00Z") => new NextRequest(`http://localhost/api/calendar${q}`);

function configure(on: boolean) {
  for (const [k, v] of Object.entries({ GOOGLE_CALENDAR_ID: "team", GOOGLE_SERVICE_ACCOUNT_EMAIL: "x@y", GOOGLE_SERVICE_ACCOUNT_KEY: "key" })) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
}

beforeEach(() => {
  list.mockReset();
  configure(true);
});

afterAll(() => configure(false));

describe("team calendar events (D9)", () => {
  it("gives 24-hour start and end times, all-day days inclusive, and the link", () => {
    expect(
      toCalendarEvents([
        {
          id: "m",
          summary: "Pelita demo",
          htmlLink: "https://calendar.example/m",
          start: { dateTime: "2026-10-21T14:30:00+07:00", timeZone: "Asia/Jakarta" },
          end: { dateTime: "2026-10-21T15:45:00+07:00", timeZone: "Asia/Jakarta" },
        },
        { id: "a", summary: "Offsite", start: { date: "2026-10-22" }, end: { date: "2026-10-24" } },
        { id: "x", status: "cancelled", start: { date: "2026-10-22" }, end: { date: "2026-10-23" } },
        { id: "n", start: { date: "2026-10-25" }, end: { date: "2026-10-26" } },
        { id: "late", start: { dateTime: "2026-10-27T22:00:00+07:00" }, end: { dateTime: "2026-10-28T00:00:00+07:00" } },
      ])
    ).toEqual([
      { id: "m", title: "Pelita demo", start: "2026-10-21", end: "2026-10-21", allDay: false, startTime: "14:30", endTime: "15:45", link: "https://calendar.example/m" },
      { id: "a", title: "Offsite", start: "2026-10-22", end: "2026-10-23", allDay: true, startTime: undefined, endTime: undefined, link: undefined },
      { id: "n", title: "(no title)", start: "2026-10-25", end: "2026-10-25", allDay: true, startTime: undefined, endTime: undefined, link: undefined },
      // Ending at midnight: it ends on the day it started.
      { id: "late", title: "(no title)", start: "2026-10-27", end: "2026-10-27", allDay: false, startTime: "22:00", endTime: "00:00", link: undefined },
    ]);
  });
});

describe("the calendar route (D10)", () => {
  it("says off when the calendar isn't connected", async () => {
    configure(false);
    const res = await GET(url());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "off", events: [], error: "Google Calendar not configured" });
    expect(list).not.toHaveBeenCalled();
  });

  it("returns the events with status ok", async () => {
    list.mockResolvedValue({ data: { items: [{ id: "a", summary: "Offsite", start: { date: "2026-10-22" }, end: { date: "2026-10-23" } }] } });
    const body = await (await GET(url())).json();
    expect(body).toEqual({ status: "ok", events: [{ id: "a", title: "Offsite", start: "2026-10-22", end: "2026-10-22", allDay: true }] });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "team", singleEvents: true, timeZone: "Asia/Jakarta" }));
  });

  it("says failed when the calendar can't be read, and tasks carry on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    list.mockRejectedValue(new Error("boom"));
    expect(await (await GET(url())).json()).toEqual({ status: "failed", events: [], error: "Failed to fetch Google Calendar events" });
  });

  it("needs a time range", async () => {
    const res = await GET(url("?timeMin=2026-10-01T00:00:00Z"));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("failed");
  });
});
