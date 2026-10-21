// Plan (tasks 3.5 to 3.7, guide 6.4, 4.12): the Timeline's bars by person with diamonds and fading bars, the summary, the
// team calendar's counts, the Work, Person and Rows filters and the stepper; then Month, Day and People (task 3.7). Only
// marking a task done from the Day view or a person's page writes data.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, task } from "./data";

const timeline = (page: Page) => page.getByRole("region", { name: "Timeline" });
const stepper = (page: Page) => page.getByRole("toolbar", { name: "Narrow the plan" });

const MAYA = "Maya Chen";
const KEVIN = "Kevin Tan";

test("D1: the timeline has a lane for each person, bars, diamonds and a bar that fades out", async ({ page }) => {
  await seedTasks([
    task("a", { task: "Write the proposal", responsible: [MAYA], startDate: isoDay(1), endDate: isoDay(6) }),
    task("b", { task: "Send the quote", responsible: [MAYA], endDate: isoDay(3) }),
    task("c", { task: "Plan the offsite", responsible: [KEVIN], startDate: isoDay(2) }),
    task("d", { task: "Nobody has this", endDate: isoDay(4) }),
  ]);
  await page.goto("/plan");
  const tl = timeline(page);
  await expect(page.getByRole("heading", { level: 1, name: "Plan" })).toBeVisible();
  await expect(tl.getByText("Maya Chen, 2 tasks")).toBeAttached();
  await expect(tl.getByText("Kevin Tan, 1 task")).toBeAttached();
  await expect(tl.getByText("Nobody responsible, 1 task")).toBeAttached();
  const bar = tl.getByRole("link", { name: /^Write the proposal\. Internal\. Starts .*, deadline / });
  await expect(bar).not.toHaveAttribute("data-diamond");
  await expect(tl.getByRole("link", { name: /^Send the quote\./ })).toHaveAttribute("data-diamond", "true");
  await expect(tl.getByRole("link", { name: /^Plan the offsite\. Internal\. Starts .*, no deadline\./ })).toHaveAttribute("data-open-end", "true");
  await expect(tl.getByText("This week")).toBeVisible();
});

test("D3: a bar opens the task over the plan", async ({ page }) => {
  await seedTasks([task("t1", { task: "Write the proposal", responsible: [MAYA], endDate: isoDay(2) })]);
  await page.goto("/plan");
  await timeline(page).getByRole("link", { name: /^Write the proposal\./ }).click();
  await expect(page).toHaveURL("/plan?task=t1");
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
});

test("D1: the summary names the busiest day, the tasks that aren't on it, and links on", async ({ page }) => {
  await seedTasks([
    task("a", { endDate: isoDay(2) }),
    task("b", { endDate: isoDay(2) }),
    task("c", { endDate: isoDay(2) }),
    task("old", { endDate: isoDay(-40) }),
    task("nodate"),
  ]);
  await page.goto("/plan");
  await expect(page.getByRole("link", { name: /^Busiest: .*, 3 deadlines$/ })).toHaveAttribute("href", `/plan?view=day&date=${isoDay(2)}`);
  await expect(page.getByRole("link", { name: /^1 overdue task ended before / })).toHaveAttribute("href", "/tasks?due=overdue");
  await expect(page.getByRole("link", { name: "1 task has no dates, so it isn't shown" })).toHaveAttribute("href", "/tasks?due=nodate");
  await expect(timeline(page).getByText("3 deadlines")).toBeAttached();
});

test("D2: the stepper moves two weeks, and Today brings the weeks back", async ({ page }) => {
  await page.goto("/plan");
  const bar = stepper(page);
  const label = bar.locator('[aria-live="polite"]');
  const first = await label.textContent();
  await expect(bar.getByRole("button", { name: "Today" })).toBeDisabled();
  await bar.getByRole("button", { name: "Next two weeks" }).click();
  await expect(label).not.toHaveText(first!);
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  await bar.getByRole("button", { name: "Today" }).click();
  await expect(label).toHaveText(first!);
  await expect(page).toHaveURL("/plan");
  await bar.getByRole("button", { name: "Previous two weeks" }).click();
  await expect(bar.getByRole("button", { name: "Today" })).toBeEnabled();
});

test("D4: Work, Person and Rows narrow the timeline, and the × clears each", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "Active" })]);
  await seedTasks([
    task("a", { task: "Chase Pelita", responsible: [MAYA], endDate: isoDay(2), linkedClientId: 1 }),
    task("b", { task: "Order chairs", responsible: [KEVIN], endDate: isoDay(3) }),
    task("c", { task: "Brief Kevin", responsible: [MAYA], informed: [{ name: KEVIN, note: "backup" }], endDate: isoDay(4) }),
  ]);
  await page.goto("/plan");
  const tl = timeline(page);
  const bar = stepper(page);

  await bar.getByRole("button", { name: "Work" }).click();
  await page.getByRole("menuitemradio", { name: "Prospects" }).click();
  await expect(page).toHaveURL("/plan?kind=prospect");
  await expect(tl.getByRole("link", { name: /^Chase Pelita\./ })).toBeVisible();
  await expect(tl.getByRole("link", { name: /^Order chairs\./ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Clear the work filter" }).click();
  await expect(page).toHaveURL("/plan");

  await bar.getByRole("button", { name: "Person" }).click();
  await page.getByRole("menuitemradio", { name: /^Kevin Tan/ }).click();
  await expect(page).toHaveURL("/plan?person=Kevin+Tan");
  await expect(tl.getByText("Kevin Tan, 1 owned, 1 informed")).toBeAttached();
  await expect(tl.getByRole("link", { name: /^Brief Kevin\..* Kevin Tan is kept informed\.$/ })).toHaveAttribute("data-informed", "true");
  await expect(bar.getByRole("button", { name: /^Rows/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Clear the person filter" }).click();

  await bar.getByRole("button", { name: /^Rows/ }).click();
  await page.getByRole("menuitemradio", { name: "Kind of work" }).click();
  await expect(page).toHaveURL("/plan?rows=kind");
  await expect(tl.getByText("Prospect work, 1 task")).toBeAttached();
  await expect(tl.getByText("Internal, 2 tasks")).toBeAttached();
});

test("D1: a lane folds at four lines with Show more, and unfolds", async ({ page }) => {
  await seedTasks(Array.from({ length: 7 }, (_, i) => task(`t${i}`, { task: `Overlapping ${i}`, responsible: [MAYA], startDate: isoDay(1), endDate: isoDay(6) })));
  await page.goto("/plan");
  const tl = timeline(page);
  await expect(tl.getByText("7 at once on")).toBeAttached();
  await expect(tl.getByRole("link", { name: /^Overlapping/ })).toHaveCount(4);
  await tl.getByRole("button", { name: "Show 3 more tasks for Maya Chen" }).click();
  await expect(tl.getByRole("link", { name: /^Overlapping/ })).toHaveCount(7);
  await tl.getByRole("button", { name: "Show fewer for Maya Chen" }).click();
  await expect(tl.getByRole("link", { name: /^Overlapping/ })).toHaveCount(4);
});

test("D3: nothing dated in these weeks says so, and a task with no dates is counted, not drawn", async ({ page }) => {
  await seedTasks([task("a", { task: "Far ahead", endDate: isoDay(120) }), task("b", { task: "Undated" })]);
  await page.goto("/plan");
  await expect(timeline(page).getByRole("heading", { name: /^No tasks between / })).toBeVisible();
  await expect(timeline(page).getByText("Nothing dated falls in these four weeks.")).toBeVisible();
  await expect(timeline(page).getByRole("link", { name: /^Far ahead/ })).toHaveCount(0);
});

test("nothing planned yet: the timeline invites the first task", async ({ page }) => {
  await page.goto("/plan");
  await expect(timeline(page).getByRole("heading", { name: "Nothing planned yet" })).toBeVisible();
  await expect(timeline(page).getByRole("link", { name: "New task" })).toHaveAttribute("href", "/plan?task=new");
});

test.describe("the team calendar row (D7, D9, D10)", () => {
  test("counts events per day, with the words for each, and Events shows their times", async ({ page, calendar }) => {
    await calendar("ok", [
      { id: "e1", title: "Weekly sync", start: isoDay(1), end: isoDay(1), allDay: false, startTime: "09:30", endTime: "10:00" },
      { id: "e2", title: "Offsite", start: isoDay(1), end: isoDay(1), allDay: true },
    ]);
    await seedTasks([task("a", { endDate: isoDay(2) })]);
    await page.goto("/plan");
    const tl = timeline(page);
    await expect(tl.getByText("Team calendar, read only")).toBeAttached(); // phones keep only the icon

    await expect(tl.getByRole("link", { name: /^2 events on .*\. Open the day$/ })).toHaveAttribute("href", `/plan?view=day&date=${isoDay(1)}`);
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Events", exact: true }).click();
    await expect(page).toHaveURL("/plan?show=events");
    await expect(tl.getByRole("link", { name: /Weekly sync, 09:30 to 10:00/ })).toBeAttached();
    await expect(tl.getByText("Deadlines")).toHaveCount(0);
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Tasks", exact: true }).click();
    await expect(tl.getByText("Team calendar, read only")).toHaveCount(0);
  });

  test("says so when the calendar isn't connected or fails, and tasks carry on", async ({ page, calendar }) => {
    await seedTasks([task("a", { task: "Still here", responsible: [MAYA], endDate: isoDay(2) })]);
    await page.goto("/plan");
    await expect(timeline(page).getByText("The team calendar isn't connected.")).toBeVisible();
    await expect(timeline(page).getByRole("link", { name: /^Still here\./ })).toBeVisible();
    await calendar("failed");
    await page.goto("/plan");
    await expect(timeline(page).getByText("Couldn't load the team calendar.")).toBeVisible();
    await expect(timeline(page).getByRole("link", { name: /^Still here\./ })).toBeVisible();
  });
});

test("D5: a link with a date and no view opens the Day view on that day", async ({ page }) => {
  await seedTasks([task("a", { task: "Due then", endDate: isoDay(2) })]);
  await page.goto(`/plan?date=${isoDay(2)}`);
  await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Tasks" }).getByRole("link", { name: "Due then" })).toBeVisible();
});

// ---------- Month ----------

const month = (page: Page) => page.getByRole("region", { name: /^[A-Z][a-z]+ \d{4}$/ });
const dayRegion = (page: Page, name: string) => page.getByRole("region", { name });

test.describe("Month (D5, D7)", () => {
  test("shows the day's deadlines and events, and a day opens the Day view", async ({ page, calendar, isMobile }) => {
    await calendar("ok", [{ id: "e1", title: "Weekly sync", start: isoDay(0), end: isoDay(0), allDay: false, startTime: "09:30", endTime: "10:00" }]);
    await seedTasks([task("a", { task: "Write the proposal", endDate: isoDay(0), responsible: [MAYA] }), task("late", { task: "Chase the invoice", endDate: isoDay(-1) })]);
    await page.goto("/plan?view=month");
    await expect(page.getByRole("heading", { level: 1, name: "Plan" })).toBeVisible();
    const grid = month(page);
    const todayCell = grid.getByRole(isMobile ? "button" : "link", { name: /: 1 deadline, 1 event$/ });
    await expect(todayCell).toBeVisible();
    if (isMobile) {
      // Phones show dots, and the chosen day is listed under the grid.
      await expect(grid.getByRole("link", { name: "Write the proposal" })).toHaveCount(0);
      await expect(dayRegion(page, "Tasks").getByRole("link", { name: "Write the proposal" })).toBeVisible();
      await expect(dayRegion(page, "Team calendar").getByText("09:30 to 10:00")).toBeVisible();
      await grid.getByRole("button", { name: /: 1 deadline$/ }).click();
      await expect(dayRegion(page, "Tasks").getByRole("link", { name: "Chase the invoice" })).toBeVisible();
      await expect(dayRegion(page, "Tasks").getByRole("link", { name: "Write the proposal" })).toHaveCount(0);
    } else {
      await expect(grid.getByRole("link", { name: "Write the proposal" })).toBeVisible();
      await expect(grid.getByText("09:30 Weekly sync")).toBeVisible();
      await grid.getByRole("link", { name: "Write the proposal" }).click();
      await expect(page).toHaveURL(/\?view=month&task=a$/);
      await page.keyboard.press("Escape");
      await todayCell.click();
      await expect(page).toHaveURL(`/plan?view=day&date=${isoDay(0)}`);
      await expect(dayRegion(page, "Tasks").getByRole("link", { name: "Write the proposal" })).toBeVisible();
    }
  });

  test("the stepper moves a month, an empty month says so, and Back to this month returns", async ({ page }) => {
    await seedTasks([task("a", { task: "Due soon", endDate: isoDay(0) })]);
    await page.goto("/plan?view=month");
    const bar = stepper(page);
    await expect(bar.getByRole("button", { name: "Today" })).toBeDisabled();
    await bar.getByRole("button", { name: "Next month" }).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(bar.getByRole("button", { name: "Today" })).toBeEnabled();
    await expect(page.getByRole("heading", { name: /^Nothing in / })).toBeVisible();
    await page.getByRole("button", { name: "Back to this month" }).click();
    await expect(page).toHaveURL("/plan?view=month");
    await expect(page.getByRole("heading", { name: /^Nothing in / })).toHaveCount(0);
  });

  test("a busy day has three deadlines, and a day with many items folds the rest into a count", async ({ page, isMobile }) => {
    test.skip(isMobile, "Phones show dots, not lines.");
    await seedTasks(Array.from({ length: 6 }, (_, i) => task(`t${i}`, { task: `Busy ${i}`, endDate: isoDay(0) })));
    await page.goto("/plan?view=month");
    const grid = month(page);
    await expect(grid.getByRole("link", { name: /^Busy \d$/ })).toHaveCount(3);
    await expect(grid.getByRole("link", { name: /^3 more items on .*, open the day$/ })).toBeVisible();
    await expect(grid.getByText("3 more")).toBeVisible();
  });

  test("calendar off: a notice in the month, and tasks carry on", async ({ page, isMobile }) => {
    await seedTasks([task("a", { task: "Still here", endDate: isoDay(0) })]);
    await page.goto("/plan?view=month");
    await expect(month(page).getByText("The team calendar isn't connected.")).toBeVisible();
    if (!isMobile) await expect(month(page).getByRole("link", { name: "Still here" })).toBeVisible();
  });
});

// ---------- Day ----------

const heading = (page: Page) => page.getByRole("region", { name: "Choose a day" }).getByRole("heading", { level: 2 });
const tasksPanel = (page: Page) => dayRegion(page, "Tasks");

test.describe("Day (D4, D5, D9)", () => {
  test("splits a day into deadline, starting and under way, with events and their links", async ({ page, calendar }) => {
    await calendar("ok", [
      { id: "e1", title: "Weekly sync", start: isoDay(1), end: isoDay(1), allDay: false, startTime: "09:30", endTime: "10:00", link: "https://calendar.example/e1" },
      { id: "e2", title: "Offsite", start: isoDay(1), end: isoDay(1), allDay: true },
    ]);
    await seedTasks([
      task("due", { task: "Send the quote", endDate: isoDay(1), responsible: [MAYA], informed: [{ name: KEVIN, note: "backup" }], keyPoints: "Ask about the discount" }),
      task("start", { task: "Plan the offsite", startDate: isoDay(1), endDate: isoDay(5) }),
      task("run", { task: "Write the handbook", startDate: isoDay(-3), endDate: isoDay(6) }),
      task("other", { task: "Not on this day", endDate: isoDay(3) }),
    ]);
    await page.goto(`/plan?view=day&date=${isoDay(1)}`);
    const panel = tasksPanel(page);
    await expect(panel.getByText("Deadline on this day")).toBeVisible();
    await expect(panel.getByText(/^Starting/)).toBeVisible();
    await expect(panel.getByText(/^Under way/)).toBeVisible();
    await expect(panel.getByRole("link", { name: "Send the quote" })).toBeVisible();
    await expect(panel.getByText("Ask about the discount")).toBeVisible();
    await expect(panel.getByText("Not on this day")).toHaveCount(0);
    await expect(page.getByText("1 due, 1 starting, 1 under way, 2 events")).toBeVisible();
    const events = dayRegion(page, "Team calendar");
    await expect(events.getByText("All day")).toBeVisible();
    await expect(events.getByText("09:30 to 10:00")).toBeVisible();
    await expect(events.getByRole("link", { name: "Open “Weekly sync” in the team calendar" })).toHaveAttribute("href", "https://calendar.example/e1");
    await expect(events.getByText("Read only")).toBeVisible();
  });

  test("lands on the next day with something, says so, and Show today stays on today", async ({ page, calendar }) => {
    await calendar("ok", []);
    await seedTasks([task("a", { task: "Far off", endDate: isoDay(4) })]);
    await page.goto("/plan?view=day");
    await expect(page.getByText("Nothing is happening today.")).toBeVisible();
    await expect(tasksPanel(page).getByRole("link", { name: "Far off" })).toBeVisible();
    await expect(stepper(page).getByRole("button", { name: "Today" })).toBeEnabled();
    await page.getByRole("button", { name: "Show today" }).click();
    await expect(page).toHaveURL(`/plan?view=day&date=${isoDay(0)}`);
    await expect(page.getByRole("heading", { name: /^Nothing on / })).toBeVisible();
    await expect(page.getByText("Nothing is happening today.")).toHaveCount(0);
    await page.getByRole("button", { name: /^Next with something: / }).click();
    await expect(tasksPanel(page).getByRole("link", { name: "Far off" })).toBeVisible();
  });

  test("today lands on today when anything is happening", async ({ page }) => {
    await seedTasks([task("a", { task: "Due now", endDate: isoDay(0) })]);
    await page.goto("/plan?view=day");
    await expect(page.getByText("Nothing is happening today.")).toHaveCount(0);
    await expect(tasksPanel(page).getByText("Deadline today")).toBeVisible();
    await expect(stepper(page).getByRole("button", { name: "Today" })).toBeDisabled();
  });

  test("the stepper, the week strip and the date picker move the day", async ({ page }) => {
    await seedTasks([task("a", { task: "Due now", endDate: isoDay(0) })]);
    await page.goto(`/plan?view=day&date=${isoDay(0)}`);
    const before = await heading(page).textContent();
    await stepper(page).getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(`/plan?view=day&date=${isoDay(1)}`);
    await expect(heading(page)).not.toHaveText(before!);
    await page.getByRole("group", { name: "Days of this week" }).getByRole("button", { pressed: false, name: /: 1 deadline, 0 events$/ }).first().click();
    await expect(heading(page)).toHaveText(before!);
    await page.getByLabel("Go to a date").fill(isoDay(10));
    await expect(page).toHaveURL(`/plan?view=day&date=${isoDay(10)}`);
    await stepper(page).getByRole("button", { name: "Today" }).click();
    await expect(page).toHaveURL(`/plan?view=day&date=${isoDay(0)}`);
  });

  test("the done circle marks a task done, and Undo brings it back", async ({ page }) => {
    await seedTasks([task("t1", { task: "Order the new chairs", endDate: isoDay(0) })]);
    await page.goto(`/plan?view=day&date=${isoDay(0)}`);
    await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
    await tasksPanel(page).getByRole("button", { name: "Mark done: Order the new chairs" }).click();
    await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(true);
    await expect(tasksPanel(page).getByText("Order the new chairs")).toHaveCount(0);
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(false);
    await expect(tasksPanel(page).getByText("Order the new chairs")).toBeVisible();
  });

  test("Tasks only and Events only show one panel each; a person's page marks the part they play", async ({ page, calendar }) => {
    await calendar("ok", [{ id: "e1", title: "Weekly sync", start: isoDay(0), end: isoDay(0), allDay: false, startTime: "09:30", endTime: "10:00" }]);
    await seedTasks([task("a", { task: "Due now", endDate: isoDay(0), responsible: [MAYA], informed: [{ name: KEVIN, note: "backup" }] })]);
    await page.goto(`/plan?view=day&date=${isoDay(0)}&show=events`);
    await expect(dayRegion(page, "Team calendar")).toBeVisible();
    await expect(tasksPanel(page)).toHaveCount(0);
    await page.goto(`/plan?view=day&date=${isoDay(0)}&show=tasks`);
    await expect(dayRegion(page, "Team calendar")).toHaveCount(0);
    await expect(tasksPanel(page).getByRole("link", { name: "Due now" })).toBeVisible();
    await page.goto(`/plan?view=day&date=${isoDay(0)}&person=Kevin+Tan`);
    await expect(tasksPanel(page).getByText("Their part:")).toBeVisible();
    await expect(tasksPanel(page).getByText("backup").first()).toBeVisible();
  });

  test("says so when the calendar isn't connected or fails, loads tasks regardless, and an empty day offers the days around it", async ({ page, calendar }) => {
    await seedTasks([task("a", { task: "Due now", endDate: isoDay(0) }), task("b", { task: "Due later", endDate: isoDay(5) })]);
    await page.goto(`/plan?view=day&date=${isoDay(0)}`);
    await expect(dayRegion(page, "Team calendar").getByText("The team calendar isn't connected.")).toBeVisible();
    await calendar("failed");
    await page.goto(`/plan?view=day&date=${isoDay(0)}`);
    await expect(dayRegion(page, "Team calendar").getByText("Couldn't load the team calendar.")).toBeVisible();
    await expect(tasksPanel(page).getByRole("link", { name: "Due now" })).toBeVisible();
    await page.goto(`/plan?view=day&date=${isoDay(2)}&show=tasks`);
    await expect(page.getByRole("heading", { name: /^Nothing on / })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Next with something: / })).toBeVisible();
    await page.getByRole("button", { name: /^\d+ \w+$/ }).first().click();
    await expect(tasksPanel(page).getByRole("link", { name: "Due now" })).toBeVisible();
  });
});

// ---------- People ----------

const people = (page: Page) => page.getByRole("region", { name: "People" });

test.describe("People (D1, D6)", () => {
  test("ranks everyone by what they own, with the words for each bar, and a name opens their page", async ({ page, isMobile }) => {
    await seedTasks([
      task("a", { task: "Write the proposal", responsible: [MAYA], endDate: isoDay(2) }),
      task("b", { task: "Send the quote", responsible: [MAYA], endDate: isoDay(-2) }),
      task("c", { task: "Order chairs", responsible: [KEVIN], informed: [{ name: MAYA, note: "backup" }] }),
      task("d", { task: "Done long ago", responsible: ["Nadia Putri"], completed: true }),
    ]);
    await page.goto("/plan?view=people");
    await expect(page.getByRole("heading", { level: 1, name: "Plan" })).toBeVisible();
    await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "People" })).toHaveAttribute("aria-pressed", "true");
    const list = people(page);
    const rows = list.getByRole("link");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Maya Chen");
    await expect(rows.nth(0)).toContainText("Owns 2, kept informed on 1, 1 overdue");
    await expect(rows.nth(0).getByRole("img", { name: "Owns 2, kept informed on 1" })).toBeVisible();
    if (!isMobile) await expect(rows.nth(0).getByRole("img", { name: "1 deadline in the next two weeks" })).toBeAttached(); // phones drop the sparkline
    await expect(rows.nth(1)).toContainText("Kevin Tan");
    await expect(rows.nth(1)).toContainText("No deadlines");
    await expect(rows.nth(2)).toContainText("Nothing open");
    await expect(list.getByRole("searchbox", { name: "Find a person" })).toHaveCount(0); // only with more than eight people
    await rows.nth(0).click();
    await expect(page).toHaveURL("/plan?view=people&person=Maya+Chen");
  });

  test("a person's page has their figures, what they own, and what they're kept informed on with their part", async ({ page }) => {
    await seedTasks([
      task("a", { task: "Write the proposal", responsible: [MAYA], endDate: isoDay(2) }),
      task("b", { task: "Send the quote", responsible: [MAYA], endDate: isoDay(-2) }),
      task("c", { task: "Order chairs", responsible: [KEVIN], informed: [{ name: MAYA, note: "backup" }] }),
      task("d", { task: "Review the plan", responsible: [KEVIN], informed: [{ name: MAYA }] }),
    ]);
    await page.goto("/plan?view=people&person=Maya+Chen");
    await expect(page.getByRole("heading", { level: 2, name: "Maya Chen" })).toBeVisible();
    await expect(page.getByText("Responsible for 2 open tasks and kept informed on 2.")).toBeVisible();
    const figure = (label: string) => page.getByText(label, { exact: true }).locator("xpath=preceding-sibling::b");
    await expect(figure("Owned")).toHaveText("2");
    await expect(figure("Kept informed")).toHaveText("2");
    await expect(figure("Due in 2 weeks")).toHaveText("1");
    await expect(figure("Overdue")).toHaveText("1");
    const owns = page.getByRole("region", { name: "Responsible for" });
    await expect(owns.getByRole("link", { name: "Send the quote" })).toBeVisible();
    await expect(owns.getByRole("link", { name: "Write the proposal" })).toBeVisible();
    const informed = page.getByRole("region", { name: "Kept informed on" });
    await expect(informed.getByText("Their part: backup")).toBeVisible();
    await expect(informed.getByText("Kept informed, with no note on their part")).toBeVisible();

    await page.getByRole("link", { name: "On the timeline" }).click();
    await expect(page).toHaveURL("/plan?person=Maya+Chen");
    await page.goBack();
    await page.getByRole("link", { name: "Their day" }).click();
    await expect(page).toHaveURL(/\/plan\?view=day&person=Maya\+Chen/);
    await page.goBack();
    await page.getByRole("link", { name: "Everyone" }).click();
    await expect(page).toHaveURL("/plan?view=people");
  });

  test("a person with nothing open says so, and a task opens over their page", async ({ page }) => {
    await seedTasks([task("d", { task: "Done long ago", responsible: ["Nadia Putri"], completed: true }), task("a", { task: "Write the proposal", responsible: [MAYA] })]);
    await page.goto("/plan?view=people&person=Nadia+Putri");
    await expect(page.getByRole("heading", { name: "Nothing open for Nadia Putri" })).toBeVisible();
    await expect(page.getByText("Nadia isn't responsible for any open task and isn't kept informed on any.")).toBeVisible();
    await page.getByRole("link", { name: "Everyone" }).last().click();
    await expect(page).toHaveURL("/plan?view=people");
    await people(page).getByRole("link", { name: /Maya Chen/ }).click();
    await page.getByRole("region", { name: "Responsible for" }).getByRole("link", { name: "Write the proposal" }).click();
    await expect(page).toHaveURL(/task=a/);
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  });

  test("a placeholder in the address shows everyone, and someone named both ways counts once", async ({ page }) => {
    await seedTasks([task("a", { task: "Write the proposal", responsible: [MAYA, "Full Team"], informed: [{ name: MAYA }] })]);
    await page.goto("/plan?view=people&person=Full%20Team");
    const rows = people(page).getByRole("link");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Owns 1, kept informed on 0");
  });

  test("a search finds people once there are more than eight, and Work narrows the counts", async ({ page }) => {
    await seedCompanies([company(1, { company: "Pelita Foods", status: "Active" })]);
    await seedTasks([
      task("c1", { task: "Chase Pelita", responsible: [MAYA], endDate: isoDay(3), linkedClientId: 1 }),
      task("i1", { task: "Order chairs", responsible: [MAYA] }),
      ...Array.from({ length: 8 }, (_, i) => task(`p${i}`, { responsible: [`Person Number${i}`] })),
    ]);
    await page.goto("/plan?view=people");
    const list = people(page);
    await expect(list.getByRole("link")).toHaveCount(9);
    const search = list.getByRole("searchbox", { name: "Find a person" });
    await search.fill("number3");
    await expect(list.getByRole("link")).toHaveCount(1);
    await search.fill("zzz");
    await expect(list.getByRole("heading", { name: "Nobody matches “zzz”" })).toBeVisible();
    await search.fill("");

    await page.getByRole("toolbar", { name: "Narrow the plan" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("menuitemradio", { name: "Prospects" }).click();
    await expect(page).toHaveURL("/plan?view=people&kind=prospect");
    await expect(list.getByRole("link", { name: /Maya Chen/ })).toContainText("Owns 1");
    await expect(list.getByText("Counting prospect work only.")).toBeVisible();
    await list.getByRole("button", { name: "Clear filter" }).click();
    await expect(list.getByRole("link", { name: /Maya Chen/ })).toContainText("Owns 2");
  });

  test("the done circle on a person's page marks the task done, and Undo brings it back", async ({ page }) => {
    await seedTasks([task("t1", { task: "Order the new chairs", responsible: [MAYA], endDate: isoDay(1) })]);
    await page.goto("/plan?view=people&person=Maya+Chen");
    await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
    const owns = page.getByRole("region", { name: "Responsible for" });
    await owns.getByRole("button", { name: "Mark done: Order the new chairs" }).click();
    await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(true);
    await expect(owns.getByText("Order the new chairs")).toHaveCount(0);
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(false);
    await expect(owns.getByText("Order the new chairs")).toBeVisible();
  });
});
