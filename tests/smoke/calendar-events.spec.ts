// Tasks on the team calendar (C04): the switch in task details, the start and end times, and where a saved task stands
// on the calendar. The dev server runs the fake calendar (playwright.config.ts), so nothing reaches a real one. Captures
// for the look check go to test-results/calendar-events/c04/<project>/.
import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { isoDay, seedTasks, storedById, task } from "./data";

const shot = (page: Page, info: TestInfo, name: string) =>
  page.screenshot({ path: `test-results/calendar-events/c04/${info.project.name}/${name}.png` });

async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
// The sync route compiles on first use in the dev server, which can outlast a test's wait: warm it once.
test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  expect((await request.get("/api/calendar/sync", { timeout: 110_000 })).ok()).toBe(true);
});

const box = async (page: Page, selector: ReturnType<Page["locator"]>) => (await selector.boundingBox())!;

test("the switch sits under the dates and shows the two times, side by side on desktop and stacked on phone", { tag: "@phone" }, async ({ page, isMobile }, info) => {
  await page.goto("/tasks?task=new");
  await waitUntilLive(page);
  const s = sheet(page, "New task");
  await s.getByLabel("Description").fill("Quarterly review with the board");
  await s.getByRole("button", { name: /Add details/ }).click();
  const toggle = s.getByRole("button", { name: "Put on the team calendar" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(s.getByLabel("Starts")).toHaveCount(0);

  // Right under the row of dates (Start, Deadline, Last action; two plus one on phones), before anything else.
  const dates = await box(page, s.getByLabel("Last action"));
  const switchBox = await box(page, toggle);
  expect(switchBox.y).toBeGreaterThan(dates.y + dates.height);
  expect(switchBox.y - (dates.y + dates.height)).toBeLessThan(40);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const starts = s.getByLabel("Starts");
  const ends = s.getByLabel("Ends");
  await s.getByLabel("Start", { exact: true }).fill(isoDay(1));
  await s.getByLabel("Deadline").fill(isoDay(1));
  await starts.fill("09:30");
  const a = await box(page, starts);
  const b = await box(page, ends);
  if (isMobile) expect(b.y).toBeGreaterThan(a.y + a.height);
  else expect(Math.abs(a.y - b.y)).toBeLessThan(1);

  // A start time alone is refused, with the message under Ends; the footer's buttons stay clear of the fields.
  await s.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(s.getByText("Add an end time to go with the start time.")).toBeVisible();
  await expect(ends).toBeFocused();
  await s.getByText("Add an end time to go with the start time.").scrollIntoViewIfNeeded();
  const footer = await box(page, s.getByRole("button", { name: "Add task", exact: true }));
  const error = await box(page, s.getByText("Add an end time to go with the start time."));
  expect(error.y + error.height).toBeLessThanOrEqual(footer.y);
  await shot(page, info, "new-times-error");

  await ends.fill("11:00");
  await expect(s.getByText("Add an end time to go with the start time.")).toHaveCount(0);
  await toggle.scrollIntoViewIfNeeded();
  await shot(page, info, "new-times");
  await s.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(s).toHaveCount(0);
});

test("a saved task says whether it's on the team calendar, and Try again brings it up to date", { tag: "@phone" }, async ({ page }, info) => {
  await seedTasks([task("board", { task: "Quarterly review with the board", startDate: isoDay(1), endDate: isoDay(1), calendar: { startTime: "09:30", endTime: "11:00" } })]);
  // Hold the sync until the test lets it go, so "Adding…" can be seen.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/calendar/sync", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await page.goto("/tasks?task=board");
  await waitUntilLive(page);
  const s = sheet(page, "Task");
  const line = (text: string) => s.getByRole("status").filter({ hasText: text });

  // Never synced: the calendar isn't up to date.
  await expect(line("The team calendar isn’t up to date.")).toBeVisible();
  await line("The team calendar isn’t up to date.").scrollIntoViewIfNeeded();
  await shot(page, info, "status-stale");

  await s.getByRole("button", { name: "Try again" }).click();
  await expect(line("Adding to the team calendar…")).toBeVisible();
  await shot(page, info, "status-adding");

  release();
  await expect(line("On the team calendar")).toBeVisible({ timeout: 15_000 });
  const open = s.getByRole("link", { name: "Open in the team calendar" });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("href", /^https:\/\/calendar\.example\.test\/event\/dt/);
  expect((await storedById("tasks", "tasks", "board"))?.calendarSync).toMatchObject({ link: expect.stringContaining("calendar.example.test") });
  await shot(page, info, "status-on");
});

test("with calendar writes off, the switch isn't there and task details look as before", async ({ page }, info) => {
  await page.route("**/api/calendar/sync", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { enabled: false } }) : route.continue(),
  );
  await seedTasks([task("plain", { task: "Send the proposal", startDate: isoDay(1), endDate: isoDay(3) })]);
  await page.goto("/tasks?task=plain");
  await waitUntilLive(page);
  const s = sheet(page, "Task");
  await expect(s.getByLabel("Deadline")).toBeVisible();
  await expect(s.getByRole("button", { name: "Put on the team calendar" })).toHaveCount(0);
  await s.getByLabel("Deadline").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, info, process.env.C04_BEFORE ? "off-before" : "off-after");
});
