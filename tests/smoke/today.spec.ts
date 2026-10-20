// Today (task 3.2, guide 6.1): the day in a sentence, what needs attention, quick capture, the two-week chart, the team
// calendar and who carries what.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, stored, task } from "./data";

// Writes are refused until the app has reached the server. The live status sits in the side bar (hidden on phones).
async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const needs = (page: Page) => page.getByRole("region", { name: "Needs attention" });
const hero = (page: Page) => page.getByRole("region", { name: "Today at a glance" });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });

test("D-007: the hero says the day in a sentence and the chips go to All tasks", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "Active" })]);
  await seedTasks([
    task("a", { task: "Send the contract", endDate: isoDay(-3), linkedClientId: 1, lastActionDate: isoDay(-20) }),
    task("b", { endDate: isoDay(-1) }),
    task("c", { endDate: isoDay(2) }),
    task("d"),
  ]);
  await page.goto("/");
  await expect(hero(page).getByRole("heading", { level: 2 })).toHaveText("Two tasks are overdue and one company has gone quiet");
  await expect(hero(page).getByText("Start with Pelita Foods, it's 3 days late.")).toBeVisible();
  await expect(hero(page).getByRole("link", { name: /^2\s*Overdue$/ })).toHaveAttribute("href", "/tasks?due=overdue");
  await expect(hero(page).getByRole("link", { name: /^1\s*Due in 3 days$/ })).toBeVisible();
  await expect(hero(page).getByRole("link", { name: /^1\s*No action for 14\+ days$/ })).toBeVisible();
  await expect(hero(page).getByRole("link", { name: /^1\s*Need a date$/ })).toBeVisible();
  const kinds = hero(page).getByRole("group", { name: "Open tasks by kind of work" });
  await expect(kinds).toContainText("Prospects 1");
  await expect(kinds).toContainText("Internal 3");
});

test("W5: Needs attention has its sections, and the kind switch narrows them", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "Active" })]);
  await seedTasks([
    task("late", { task: "Chase the invoice", endDate: isoDay(-2), linkedClientId: 1 }),
    task("soon", { task: "Prepare the board pack", endDate: isoDay(1) }),
    task("nodate", { task: "Plan the offsite" }),
    task("later", { task: "Far away", endDate: isoDay(40) }),
  ]);
  await page.goto("/");
  const panel = needs(page);
  await expect(panel.getByRole("heading", { name: /^Overdue/ })).toBeVisible();
  await expect(panel.getByRole("heading", { name: /^Due in the next 3 days/ })).toBeVisible();
  await expect(panel.getByRole("heading", { name: /^Needs a date/ })).toBeVisible();
  await expect(panel.getByText("Far away")).toHaveCount(0);
  const kind = panel.getByRole("group", { name: "Kind of work" });
  await expect(kind.getByRole("button", { name: /^All\s*3$/ })).toBeVisible();
  await kind.getByRole("button", { name: /^Prospects/ }).click();
  await expect(panel.getByText("Chase the invoice")).toBeVisible();
  await expect(panel.getByText("Prepare the board pack")).toHaveCount(0);
  await kind.getByRole("button", { name: /^Clients/ }).click();
  await expect(panel.getByRole("heading", { name: "No client work needs attention" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "See all client tasks" })).toHaveAttribute("href", "/tasks?kind=client");
});

test("D3: a section folds at six, with a link to see them all", async ({ page }) => {
  await seedTasks(Array.from({ length: 8 }, (_, i) => task(`t${i}`, { task: `Late task ${i}`, endDate: isoDay(-1 - i) })));
  await page.goto("/");
  await expect(needs(page).getByRole("link", { name: /^Mark done|^Late task/ }).first()).toBeVisible();
  await expect(needs(page).getByRole("article")).toHaveCount(6);
  await expect(needs(page).getByRole("link", { name: "See all 8" })).toHaveAttribute("href", "/tasks?due=overdue");
});

test("W1: a sentence in quick capture adds internal work, keeps the focus, and offers Add details", async ({ page }) => {
  await page.goto("/");
  await waitUntilLive(page);
  const field = needs(page).getByLabel("New task");
  await field.fill("Book the interview room");
  await field.press("Enter");
  await expect(page.getByText("Task added")).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  const all = await stored("tasks", "tasks");
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ task: "Book the interview room", responsible: [], informed: [] });
  expect(all[0].linkedClientId).toBeUndefined();
  await expect(needs(page).getByText("Book the interview room")).toBeVisible();
  await toasts(page).getByRole("button", { name: "Add details" }).click();
  await expect(page).toHaveURL(`/?task=${all[0].id}`);
  await expect(page.getByRole("dialog", { name: "Task" }).getByLabel("Description")).toHaveValue("Book the interview room");
});

test("W1: with nothing on the list, the hero holds the capture field", async ({ page }) => {
  await page.goto("/");
  await waitUntilLive(page);
  await expect(hero(page).getByRole("heading", { level: 2 })).toHaveText("Nothing on the list yet");
  await expect(needs(page).getByRole("heading", { name: "A clear day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nobody is assigned yet" })).toBeVisible();
  const field = hero(page).getByLabel("Add the first task");
  await field.fill("Write the onboarding guide");
  await field.press("Enter");
  await expect.poll(async () => (await stored("tasks", "tasks")).length).toBe(1);
});

test("A3: with no connection, adding is refused and what was typed stays", async ({ page, context }) => {
  await seedTasks([task("t1", { endDate: isoDay(0) })]);
  await page.goto("/");
  await waitUntilLive(page);
  const field = needs(page).getByLabel("New task");
  await field.fill("Written offline");
  await context.setOffline(true);
  await field.press("Enter");
  await expect(page.getByText("No connection. The task wasn't added.")).toBeVisible();
  await expect(field).toHaveValue("Written offline");
  await context.setOffline(false);
  expect(await stored("tasks", "tasks")).toHaveLength(1);
});

test("W5: the done circle marks a task done, it leaves the list, and Undo brings it back", async ({ page }) => {
  await seedTasks([task("t1", { task: "Order the new chairs", endDate: isoDay(-1) }), task("t2", { task: "Another one", endDate: isoDay(-2) })]);
  await page.goto("/");
  await waitUntilLive(page);
  await needs(page).getByRole("button", { name: "Mark done: Order the new chairs" }).click();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(true);
  await expect(needs(page).getByText("Order the new chairs")).toHaveCount(0);
  await expect(needs(page).getByText("Another one")).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(false);
  await expect(needs(page).getByText("Order the new chairs")).toBeVisible();
});

test("D2: a task row opens its details over Today", async ({ page }) => {
  await seedTasks([task("t1", { task: "Order the new chairs", endDate: isoDay(1) })]);
  await page.goto("/");
  await needs(page).getByRole("link", { name: "Order the new chairs" }).click();
  await expect(page).toHaveURL("/?task=t1");
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
});

test("D4: the two-week chart has a column for each day, and a day opens Plan", async ({ page }) => {
  await seedTasks([task("a", { endDate: isoDay(2) }), task("b", { endDate: isoDay(2) }), task("c", { endDate: isoDay(2) })]);
  await page.goto("/");
  const columns = hero(page).locator('a[href^="/plan?view=day&date="]');
  await expect(columns).toHaveCount(14);
  await expect(hero(page).getByText(/is the busiest, with 3 deadlines/)).toBeVisible();
  const busy = columns.nth(2);
  await expect(busy).toHaveAttribute("aria-label", /: 3 deadlines$/);
  await expect(busy).toHaveAttribute("href", `/plan?view=day&date=${isoDay(2)}`);
});

test.describe("the team calendar (D7, D9, D10)", () => {
  test("shows today's events with their times, read only, and counts them on the chart", async ({ page, calendar }) => {
    await calendar("ok", [
      { id: "e1", title: "Weekly sync", start: isoDay(0), end: isoDay(0), allDay: false, startTime: "09:30", endTime: "10:00", link: "https://calendar.example/e1" },
      { id: "e2", title: "Kevin out of office", start: isoDay(0), end: isoDay(0), allDay: true },
      { id: "e3", title: "Next week", start: isoDay(3), end: isoDay(3), allDay: false, startTime: "11:00", endTime: "12:00" },
    ]);
    await seedTasks([task("t1", { responsible: ["Kevin Tan"], endDate: isoDay(1) })]);
    await page.goto("/");
    const panel = page.getByRole("region", { name: "Calendar today" });
    await expect(panel.getByText("Read only")).toBeVisible();
    await expect(panel.getByText("Weekly sync")).toBeVisible();
    await expect(panel.getByText("09:30 to 10:00")).toBeVisible();
    await expect(panel.getByText("All day")).toBeVisible();
    await expect(panel.getByText("Next week")).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "Open “Weekly sync” in the team calendar" })).toHaveAttribute("target", "_blank");
    await expect(hero(page).getByText("Calendar events", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Who's carrying what" }).getByText("Owns 1, out of office today")).toBeVisible();
  });

  test("says so when there are no events, and when the calendar isn't connected", async ({ page, calendar }) => {
    await calendar("ok", []);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "No events today" })).toBeVisible();
    await page.unroute("**/api/calendar?**");
    await calendar("off");
    await page.reload();
    const panel = page.getByRole("region", { name: "Calendar today" });
    await expect(panel.getByText("The team calendar isn't connected.")).toBeVisible();
    await expect(hero(page).getByText("Calendar events unavailable")).toBeVisible();
  });

  test("an amber notice when the events fail, with tasks carrying on", async ({ page, calendar }) => {
    await calendar("failed");
    await seedTasks([task("t1", { task: "Order the new chairs", endDate: isoDay(1) })]);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Calendar today" }).getByText("Couldn't load today's events.")).toBeVisible();
    await expect(needs(page).getByText("Order the new chairs")).toBeVisible();
  });
});

test("D6: who's carrying what ranks people by what they own and opens their page", async ({ page }) => {
  await seedTasks([
    task("a", { responsible: ["Maya Chen"], endDate: isoDay(5) }),
    task("b", { responsible: ["Maya Chen"], endDate: isoDay(6), informed: [{ name: "Kevin Tan" }] }),
    task("c", { responsible: ["Kevin Tan"], endDate: isoDay(7) }),
  ]);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Who's carrying what" });
  const people = panel.getByRole("link");
  await expect(people).toHaveCount(2);
  await expect(people.first()).toContainText("Maya Chen");
  await expect(people.first()).toContainText("Owns 2, informed on 0");
  await expect(people.last()).toContainText("Owns 1, informed on 1");
  await expect(people.first()).toHaveAttribute("href", "/plan?view=people&person=Maya%20Chen");
});

test("search: the header search takes the words to All tasks", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await expect(page.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/tasks?focus=search");
    return;
  }
  const field = page.getByRole("searchbox", { name: "Search" });
  await field.fill("chairs & tables");
  await field.press("Enter");
  await expect(page).toHaveURL("/tasks?q=chairs%20%26%20tables");
});
