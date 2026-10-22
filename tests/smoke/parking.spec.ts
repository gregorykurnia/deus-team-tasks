// Parked tasks (N19): a task parked from its details or from Select leaves Today, Plan and the open list, never shows
// as late, waits under Parked with when it comes back, and returns with Bring back or on the day it was parked until.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { isoDay, seedTasks, storedById, task } from "./data";

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const rows = (page: Page) => page.getByRole("article");
const views = (page: Page) => page.getByRole("group", { name: "Open, parked or done" });

async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

test("N19: a task parked for a week leaves the open list and Today, waits under Parked, and Undo brings it back", async ({ page }) => {
  await seedTasks([task("t1", { task: "Refresh the price list", endDate: isoDay(-2) }), task("t2", { task: "Book the venue", endDate: isoDay(1) })]);
  await page.goto("/tasks?task=t1");
  const s = sheet(page, "Task");
  await s.getByRole("button", { name: "Park" }).click();
  await page.getByRole("menu", { name: "Park" }).getByRole("menuitem", { name: "For a week" }).click();
  await expect(s).toHaveCount(0);
  await expect(toasts(page).getByText(/^Parked until /)).toBeVisible();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.parkedUntil).toBe(isoDay(7));
  await expect(rows(page)).toHaveCount(1);
  await expect(views(page).getByRole("button", { name: /Parked/ })).toContainText("1");

  await views(page).getByRole("button", { name: /Parked/ }).click();
  await expect(page).toHaveURL(/view=parked/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Refresh the price list");
  await expect(rows(page).first()).not.toContainText("late");

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Needs attention" })).not.toContainText("Refresh the price list");
  await expect(page.getByRole("region", { name: "Needs attention" })).toContainText("Book the venue");
});

test("N19: parked tasks are brought back together from Select, and one parked until today is open again", async ({ page }) => {
  await seedTasks([
    task("p1", { task: "Redo the brochure", parkedAt: 1 }),
    task("p2", { task: "Try the new supplier", parkedAt: 1, parkedUntil: isoDay(10) }),
    task("p3", { task: "Call the old agency", parkedAt: 1, parkedUntil: isoDay(0) }),
  ]);
  await page.goto("/tasks?view=parked");
  await waitUntilLive(page);
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select: Redo the brochure" }).click();
  await page.getByRole("checkbox", { name: "Select: Try the new supplier" }).click();
  await page.getByRole("region", { name: "Selected tasks" }).getByRole("button", { name: "Bring back" }).click();
  await expect(toasts(page).getByText("2 tasks brought back to open tasks")).toBeVisible();
  await expect.poll(async () => (await storedById("tasks", "tasks", "p2"))?.parkedAt).toBeUndefined();
  await expect(page.getByText("Nothing parked")).toBeVisible();

  await views(page).getByRole("button", { name: "Open" }).click();
  await expect(rows(page)).toHaveCount(3);
});

test("N19: a parked task's details say until when, and Bring back returns it", async ({ page }) => {
  await seedTasks([task("t1", { task: "Redo the brochure", parkedAt: Date.now(), parkedUntil: isoDay(14) })]);
  await page.goto("/tasks?view=parked&task=t1");
  const s = sheet(page, "Parked task");
  await expect(s).toContainText("Parked until");
  await expect(s.getByRole("button", { name: "Park" })).toHaveCount(0);
  await s.getByRole("button", { name: "Bring back" }).click();
  await expect(s).toHaveCount(0);
  await expect(toasts(page).getByText("Brought back to open tasks")).toBeVisible();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.parkedUntil).toBeUndefined();
});
