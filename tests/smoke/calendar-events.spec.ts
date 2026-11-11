// Tasks on the team calendar (C04/C05): the controls in task details and the event following browser writes.
// C04 covers the switch, the start and end times, and where a saved task stands
// on the calendar. The dev server runs the fake calendar (playwright.config.ts), so nothing reaches a real one. Captures
// for the look check go to test-results/calendar-events/c04/<project>/.
import type { Page, TestInfo } from "@playwright/test";
import type { calendar_v3 } from "googleapis";
import { test, expect } from "./fixtures";
import { isoDay, seedTasks, stored, storedById, task } from "./data";
import { seed } from "../support/emulator";

const dir = (info: TestInfo) => `test-results/calendar-events/c04/${info.project.name}`;
// The dev server's "N" badge isn't part of the app (builds don't have it), so captures hide it.
async function shot(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `${dir(info)}/${name}.png` });
}
// The switch, the times and the status line as one whole picture, free of the sheet's scroll edges.
async function blockShot(page: Page, info: TestInfo, name: string) {
  const block = page.getByRole("button", { name: "Put on the team calendar" }).locator("xpath=../..");
  await block.scrollIntoViewIfNeeded();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const b = (await block.boundingBox())!;
  await page.screenshot({ path: `${dir(info)}/block-${name}.png`, clip: { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 } });
}

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
  await blockShot(page, info, "new-times");
  // Scrolled to the end: the last field sits whole above the footer, so nothing is hidden behind it.
  await s.getByLabel("Key points").scrollIntoViewIfNeeded();
  const keyPoints = await box(page, s.getByLabel("Key points"));
  const addBox = await box(page, s.getByRole("button", { name: "Add task", exact: true }));
  expect(keyPoints.y + keyPoints.height).toBeLessThanOrEqual(addBox.y);
  await shot(page, info, "new-end");
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
  await blockShot(page, info, "stale");

  await s.getByRole("button", { name: "Try again" }).click();
  await expect(line("Adding to the team calendar…")).toBeVisible();
  await shot(page, info, "status-adding");
  await blockShot(page, info, "adding");

  release();
  await expect(line("On the team calendar")).toBeVisible({ timeout: 15_000 });
  const open = s.getByRole("link", { name: "Open in the team calendar" });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("href", /^https:\/\/calendar\.example\.test\/event\/dt/);
  expect((await storedById("tasks", "tasks", "board"))?.calendarSync).toMatchObject({ link: expect.stringContaining("calendar.example.test") });
  await shot(page, info, "status-on");
  await blockShot(page, info, "on");
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

// C05 exercises real browser writes and the server's fake calendar, not intercepted sync responses.
test.describe("app calendar flow", () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const messages: string[] = [];
    errors.set(page, messages);
    page.on("pageerror", (error) => messages.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") messages.push(message.text()); });
  });
  test.afterEach(async ({ page }) => {
    expect(errors.get(page), "browser console and uncaught errors").toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll").toBe(true);
  });

  async function eventFor(id: string) {
    const events = (await stored("tasks", "testCalendarEvents")).map((doc) => JSON.parse(doc.event as string) as calendar_v3.Schema$Event);
    const matches = events.filter((event) => event.extendedProperties?.private?.deusTaskId === id);
    expect(matches.length, "one event ID even after off/on and retries").toBeLessThanOrEqual(1);
    return matches[0];
  }

  async function openTask(page: Page, id: string) {
    await page.goto(`/tasks?task=${id}`);
    await waitUntilLive(page);
    return sheet(page, "Task");
  }

  async function save(page: Page) {
    const s = sheet(page, "Task");
    await s.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(s).toHaveCount(0);
  }

  // A viewport capture plus an original-size crop of the calendar and footer. Scrolled content can continue
  // behind the sheet's fixed head/footer, but every calendar word and action must be whole and unobscured.
  async function capture(page: Page, info: TestInfo, name: string, isMobile: boolean) {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const s = sheet(page, "Task");
    const block = s.getByRole("button", { name: "Put on the team calendar" }).locator("xpath=../..");
    await block.scrollIntoViewIfNeeded();
    const faults = await s.evaluate((dialog) => {
      const issues: string[] = [];
      const targets = dialog.querySelectorAll<HTMLElement>("button, a, input, textarea, label, [role=status] span");
      for (const el of targets) {
        // The description has a deliberately screen-reader-only label; its one-pixel box isn't visible text.
        if (el.closest(".sr-only")) continue;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || b.top < 0 || b.bottom > innerHeight) continue;
        // Only test things visible in the sheet's scrollport (not fields intentionally scrolled behind its head).
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        if (!hit || !el.contains(hit)) {
          if (el.closest("footer") || el.closest('[class*="calendar"]')) issues.push(`covered: ${el.textContent || el.getAttribute("aria-label")}`);
          continue;
        }
        if (b.left < 0 || b.right > innerWidth) issues.push(`outside viewport: ${el.textContent}`);
        if (el.scrollWidth > el.clientWidth + 1) issues.push(`clipped: ${el.textContent || el.getAttribute("aria-label")}`);
      }
      if ([...document.images].some((el) => el.getClientRects().length && !el.naturalWidth)) issues.push("unloaded image");
      return issues;
    });
    expect(faults, "visible fields, labels and calendar actions").toEqual([]);
    const b = (await block.boundingBox())!;
    const footer = (await s.getByRole("button", { name: "Save changes" }).boundingBox())!;
    expect(b.y).toBeGreaterThan(0);
    expect(b.y + b.height).toBeLessThanOrEqual(footer.y);
    if (isMobile) expect((await s.boundingBox())!.width).toBeLessThanOrEqual(390);
    const path = `test-results/calendar-events/c05/${info.project.name}/${name}`;
    await page.screenshot({ path: `${path}.png`, animations: "disabled" });
    await page.screenshot({ path: `${path}-detail.png`, animations: "disabled", clip: {
      x: Math.max(0, b.x - 8), y: b.y - 8, width: b.width + 16,
      height: Math.min(page.viewportSize()!.height, footer.y + footer.height + 16) - b.y + 8,
    } });
  }

  test("subtask all day → times → date and Undo → off/on → delete", { tag: "@phone" }, async ({ page, isMobile }, info) => {
    test.setTimeout(120_000);
    await seedTasks([task("main", { task: "Plan the board review" })]);
    const s = await openTask(page, "main");
    const subtasks = s.getByRole("group", { name: "Subtasks" });
    await subtasks.getByRole("textbox", { name: "Add a subtask" }).fill("Review the quarterly forecast");
    await subtasks.getByRole("textbox", { name: "Add a subtask" }).press("Enter");
    await subtasks.getByRole("link", { name: "Review the quarterly forecast", exact: true }).click();
    await expect(s.getByText("Subtask of")).toBeVisible();
    const id = new URL(page.url()).searchParams.get("task")!;
    await s.getByRole("button", { name: "Put on the team calendar" }).click();
    await s.getByLabel("Start", { exact: true }).fill(isoDay(1));
    await s.getByLabel("Deadline").fill(isoDay(1));
    await save(page);
    await expect.poll(() => eventFor(id)).toMatchObject({ summary: "Review the quarterly forecast", start: { date: isoDay(1) }, end: { date: isoDay(2) }, status: "confirmed" });
    const eventId = (await eventFor(id))!.id;
    expect((await eventFor(id))!.description).toContain("Main task: Plan the board review");
    expect((await eventFor(id))!.description).toContain(`/tasks?task=${id}`);
    expect((await eventFor(id))!.attendees).toBeUndefined();
    await openTask(page, id);
    await expect(s.getByText("On the team calendar", { exact: true })).toBeVisible();
    await capture(page, info, "all-day", isMobile);

    await s.getByLabel("Starts").fill("09:30");
    await s.getByLabel("Ends").fill("11:00");
    await s.getByLabel("Description").fill("Review the updated quarterly forecast");
    await save(page);
    const timed = { id: eventId, summary: "Review the updated quarterly forecast", start: { dateTime: `${isoDay(1)}T09:30:00`, timeZone: "Asia/Jakarta" }, end: { dateTime: `${isoDay(1)}T11:00:00`, timeZone: "Asia/Jakarta" }, status: "confirmed" };
    await expect.poll(() => eventFor(id)).toMatchObject(timed);
    await openTask(page, id);
    await expect(s.getByText("On the team calendar", { exact: true })).toBeVisible();
    await capture(page, info, "timed", isMobile);

    await s.getByRole("button", { name: "Close", exact: true }).click();
    const row = page.getByRole("article").filter({ has: page.getByRole("link", { name: "Review the updated quarterly forecast", exact: true }) });
    await row.getByRole("button", { name: /^Deadline:.*Change$/ }).click();
    const dateEditor = page.getByRole("dialog", { name: "Deadline", exact: true });
    await dateEditor.locator('input[type="date"]').fill(isoDay(3));
    await dateEditor.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => eventFor(id)).toMatchObject({ ...timed, end: { dateTime: `${isoDay(3)}T11:00:00`, timeZone: "Asia/Jakarta" } });
    await expect.poll(async () => (await storedById("tasks", "tasks", id))?.endDate).toBe(isoDay(3));
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => eventFor(id)).toMatchObject(timed);
    await expect.poll(async () => (await storedById("tasks", "tasks", id))?.endDate).toBe(isoDay(1));

    await openTask(page, id);
    await s.getByRole("button", { name: "Put on the team calendar" }).click();
    await save(page);
    await expect.poll(() => eventFor(id)).toMatchObject({ id: eventId, status: "cancelled" });
    await expect.poll(() => storedById("tasks", "tasks", id)).not.toHaveProperty("calendar");
    await openTask(page, id);
    await expect(s.getByText("On the team calendar", { exact: true })).toHaveCount(0);
    await s.getByRole("button", { name: "Put on the team calendar" }).click();
    await save(page);
    await expect.poll(() => eventFor(id)).toMatchObject({ id: eventId, status: "confirmed", start: { date: isoDay(1) }, end: { date: isoDay(2) } });
    await openTask(page, id);
    await s.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Delete this task?" }).getByRole("button", { name: "Delete task", exact: true }).click();
    await expect(s).toHaveCount(0);
    await expect.poll(() => storedById("tasks", "tasks", id)).toBeUndefined();
    await expect.poll(() => eventFor(id)).toMatchObject({ id: eventId, status: "cancelled" });
    expect(await storedById("tasks", "tasks", "main")).toMatchObject({ task: "Plan the board review" });
  });

  test("a calendar failure keeps the task; Try again recovers; deleting its main task keeps its event", { tag: "@phone" }, async ({ page, isMobile }, info) => {
    await seedTasks([task("main", { task: "Plan the board review" }), task("child", { task: "Review the quarterly forecast", parentId: "main", startDate: isoDay(1), endDate: isoDay(1) })]);
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503 }]);
    const s = await openTask(page, "child");
    await s.getByRole("button", { name: "Put on the team calendar" }).click();
    await save(page);
    await expect.poll(async () => (await storedById("tasks", "tasks", "child"))?.calendarSync).toHaveProperty("error");
    expect(await storedById("tasks", "tasks", "child")).toMatchObject({ task: "Review the quarterly forecast", parentId: "main", calendar: {} });
    expect(await eventFor("child")).toBeUndefined();
    await openTask(page, "child");
    await expect(s.getByText("The team calendar isn’t up to date.")).toBeVisible();
    await capture(page, info, "failure", isMobile);
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 0 }]);
    await s.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(s.getByText("On the team calendar", { exact: true })).toBeVisible();
    await expect.poll(() => eventFor("child")).toMatchObject({ summary: "Review the quarterly forecast", status: "confirmed" });
    const eventId = (await eventFor("child"))!.id;
    expect((await eventFor("child"))!.description).toContain("Main task: Plan the board review");
    expect((await storedById("tasks", "tasks", "child"))?.calendarSync).not.toHaveProperty("error");

    // Navigate from the subtask's own parent link, then use the app's confirmation (no direct database deletes).
    await s.getByRole("link", { name: "Plan the board review", exact: true }).click();
    await expect(s.getByLabel("Description")).toHaveValue("Plan the board review");
    await s.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete this task?" });
    await expect(confirm).toContainText("Its subtask stays, as a task of its own.");
    await confirm.getByRole("button", { name: "Delete task", exact: true }).click();
    await expect(s).toHaveCount(0);
    await expect.poll(() => storedById("tasks", "tasks", "main")).toBeUndefined();
    await expect.poll(() => storedById("tasks", "tasks", "child")).not.toHaveProperty("parentId");
    await expect.poll(async () => (await eventFor("child"))?.description).not.toContain("Main task:");
    expect(await eventFor("child")).toMatchObject({ id: eventId, summary: "Review the quarterly forecast", status: "confirmed", start: { date: isoDay(1) }, end: { date: isoDay(2) } });
    await openTask(page, "child");
    await expect(s.getByText("Subtask of")).toHaveCount(0);
    await expect(s.getByText("On the team calendar", { exact: true })).toBeVisible();
    await capture(page, info, "freed-task", isMobile);
  });
});
