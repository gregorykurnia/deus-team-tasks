// Parked companies (N20): an Active company parked from its row menu leaves the companies in play and Where to act,
// takes its open tasks with it, waits under Parked with when it comes back, and returns with Bring back from its record.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, task } from "./data";

const row = (page: Page, name: string) => page.getByRole("article", { name });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const views = (page: Page) => page.getByRole("group", { name: "In play or parked" });

test("N20: a company parked for two weeks leaves the list in play with its task, and Bring back returns both", async ({ page }) => {
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "To Follow Up", date: isoDay(-20), target: isoDay(-2) }),
    company(2, { company: "Borneo Retail", status: "Meeting Soon", date: isoDay(-1) }),
  ]);
  await seedTasks([task("t1", { task: "Call Rina about the quote", linkedClientId: 1, endDate: isoDay(-2) })]);
  await page.goto("/companies");
  await page.getByRole("button", { name: "More for Pelita Foods" }).click();
  await page.getByRole("menuitem", { name: "Park" }).click();
  await page.getByRole("menu", { name: "Park" }).getByRole("menuitem", { name: "For two weeks" }).click();
  await expect(toasts(page).getByText(/^Pelita Foods parked until .*, with its open task$/)).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.parkedUntil).toBe(isoDay(14));
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.parkedUntil).toBe(isoDay(14));
  await expect(row(page, "Pelita Foods")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Where to act" }).getByRole("button", { name: /Gone cold/ })).toContainText("0");

  await views(page).getByRole("button", { name: /Parked/ }).click();
  await expect(page).toHaveURL(/view=parked/);
  await expect(row(page, "Pelita Foods")).toContainText("Back");
  await expect(row(page, "Borneo Retail")).toHaveCount(0);

  await row(page, "Pelita Foods").getByRole("link", { name: "Pelita Foods" }).click();
  const record = page.getByRole("dialog", { name: "Pelita Foods" });
  await expect(record).toContainText("Parked until");
  await expect(record).not.toContainText("Gone cold");
  await record.getByRole("button", { name: "Bring back" }).click();
  await expect(toasts(page).getByText("Pelita Foods brought back, with its open task")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.parkedAt).toBeUndefined();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.parkedAt).toBeUndefined();
});
