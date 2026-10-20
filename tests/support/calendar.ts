import type { Page } from "@playwright/test";

export type CalendarMode = "ok" | "off" | "failed";

export interface MockEvent {
  id: string;
  title: string;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd, inclusive
  allDay: boolean;
  startTime?: string; // "14:30"
  endTime?: string; // "15:30"
  link?: string;
}

// Answers /api/calendar in the browser, so no test reaches Google.
export async function mockCalendar(page: Page, mode: CalendarMode, events: MockEvent[] = []) {
  await page.route("**/api/calendar?**", (route) => {
    const body =
      mode === "ok"
        ? { status: "ok", events }
        : mode === "off"
          ? { status: "off", events: [], error: "Google Calendar not configured" }
          : { status: "failed", events: [], error: "Failed to fetch Google Calendar events" };
    return route.fulfill({ json: body });
  });
}
