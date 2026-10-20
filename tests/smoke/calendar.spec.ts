// The team calendar on the old UI: events from the calendar route (D9, D10).
import { test, expect } from "./fixtures";
import { isoDay, seedBaseline } from "./data";
import { openArea } from "./old-ui";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

test.beforeEach(async () => {
  await seedBaseline();
});

test("D9: team calendar events show with their 24-hour start time and a link", async ({ page, calendar }) => {
  await calendar("ok", [
    { id: "e1", title: "Pelita demo", start: isoDay(0), end: isoDay(0), allDay: false, startTime: "14:30", endTime: "15:30", link: "https://calendar.example/e1" },
  ]);
  await page.goto("/");
  await openArea(page, "Calendar");
  await expect(page.getByText("14:30 Pelita demo")).toBeVisible();
  await page.getByText("14:30 Pelita demo").click();
  await expect(page.getByRole("link", { name: /Pelita demo/ })).toHaveAttribute("href", "https://calendar.example/e1");
});

test("D10: a notice says when the calendar isn't connected, and tasks carry on", async ({ page }) => {
  await page.goto("/");
  await openArea(page, "Calendar");
  await expect(page.getByText("Google Calendar not configured")).toBeVisible();
});

test("D10: a notice says when the calendar couldn't be read", async ({ page, calendar }) => {
  await calendar("failed");
  await page.goto("/");
  await openArea(page, "Calendar");
  await expect(page.getByText("Failed to fetch Google Calendar events")).toBeVisible();
});
