// Plan, the bar, filters, stepper and Timeline (task 3.5, guide 6.4, 4.12): bars by person with diamonds and fading
// bars, the summary, the team calendar's counts, the Work, Person and Rows filters, and the stepper. It writes no data.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, task } from "./data";

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
  await expect(tl.getByText("Prospects, 1 task")).toBeAttached();
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

test("D5: a link with a date and no view opens the Day view, until 3.6 builds it", async ({ page }) => {
  await page.goto(`/plan?date=${isoDay(2)}`);
  await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Day isn't built yet.")).toBeVisible();
});
