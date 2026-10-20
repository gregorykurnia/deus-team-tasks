// Live changes (task 4.2, A1, guide 3 and 5.8): what a colleague changes appears without a reload with the blue glow and
// "Just changed", your own change glows without the tag, and a lot at once makes one toast.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, task } from "./data";

async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const row = (page: Page, name: string) => page.getByRole("article").filter({ hasText: name });

test("A1: a colleague's change to a task shows at once, with the glow and Just changed", async ({ page }) => {
  await seedTasks([task("a", { task: "Send the contract" }), task("b", { task: "Book the room" })]);
  await page.goto("/tasks");
  await waitUntilLive(page);
  await expect(row(page, "Send the contract")).toBeVisible();
  await expect(page.getByText("Just changed")).toHaveCount(0);
  // The colleague's write: the whole task again, with a new deadline.
  await seedTasks([task("a", { task: "Send the contract today", endDate: isoDay(1) })]);
  const changed = row(page, "Send the contract today");
  await expect(changed).toBeVisible();
  await expect(changed.getByText("Just changed")).toBeVisible();
  await expect(changed).toHaveAttribute("data-new", "true");
  await expect(row(page, "Book the room").getByText("Just changed")).toHaveCount(0);
});

test("A1: your own change doesn't say Just changed", async ({ page }) => {
  await seedTasks([task("a", { task: "Send the contract", endDate: isoDay(-1) })]);
  await page.goto("/tasks");
  await waitUntilLive(page);
  await row(page, "Send the contract").getByRole("button", { name: /Mark done/ }).click();
  await expect(page.getByText("Marked done")).toBeVisible();
  await expect(page.getByText("Just changed")).toHaveCount(0);
});

test("A1: a company changed by a colleague says Just changed in the list", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "Active" }), company(2, { company: "Tirta Water", status: "Active" })]);
  await page.goto("/companies");
  await waitUntilLive(page);
  await expect(row(page, "Pelita Foods")).toBeVisible();
  await seedCompanies([company(1, { company: "Pelita Foods", status: "Active", pic: "Dewi" })]);
  await expect(row(page, "Pelita Foods").getByText("Just changed")).toBeVisible();
  await expect(row(page, "Tirta Water").getByText("Just changed")).toHaveCount(0);
});

test("A1: a lot of changes at once make one toast", async ({ page }) => {
  await seedTasks(Array.from({ length: 8 }, (_, i) => task(`t${i}`, { task: `Task number ${i}` })));
  await page.goto("/tasks");
  await waitUntilLive(page);
  await expect(row(page, "Task number 0")).toBeVisible();
  await seedTasks(Array.from({ length: 8 }, (_, i) => task(`t${i}`, { task: `Task number ${i}`, endDate: isoDay(i + 1) })));
  await expect(page.getByText("A colleague’s changes just came in")).toBeVisible();
  await expect(page.getByText("A colleague’s changes just came in")).toHaveCount(1);
});
