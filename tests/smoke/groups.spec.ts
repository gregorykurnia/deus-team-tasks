// Task groups on the old UI: create, star, delete.
import { test, expect } from "./fixtures";
import { acceptDialogs, seedBaseline, seedGroups, seedTasks, stored, storedById, task } from "./data";
import { OLD_UI, taskRow } from "./old-ui";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

test.beforeEach(async () => {
  await seedBaseline();
});

function groupHeader(page: import("@playwright/test").Page, name: string) {
  return page.locator("tbody tr").filter({ has: page.getByRole("button", { name: new RegExp(`^▸\\s*${name}`) }) });
}

test("W8: create a task group", async ({ page }) => {
  await page.goto(OLD_UI);
  await page.getByRole("button", { name: "+ Add Task Group" }).click();
  await page.getByPlaceholder("Group name").fill("Office move");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(groupHeader(page, "Office move")).toBeVisible();
  await expect
    .poll(async () => (await stored("tasks", "taskGroups")).map((g) => ({ name: g.name, starred: g.starred })))
    .toEqual([{ name: "Office move", starred: false }]);
});

test("W8: a task group's name must be new", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await page.goto(OLD_UI);
  await page.getByRole("button", { name: "+ Add Task Group" }).click();
  await page.getByPlaceholder("Group name").fill("Office move");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("A group with that name already exists.")).toBeVisible();
  expect(await stored("tasks", "taskGroups")).toHaveLength(1);
});

test("W9: star a task group so it comes first", async ({ page }) => {
  await seedGroups([
    { id: "g1", name: "Hiring", order: 1 },
    { id: "g2", name: "Office move", order: 2 },
  ]);
  await page.goto(OLD_UI);
  await groupHeader(page, "Office move").getByTitle("Star group").click();

  await expect.poll(async () => (await storedById("tasks", "taskGroups", "g2"))?.starred).toBe(true);
  await expect(page.locator("tbody tr").first()).toContainText("Office move");
});

test("W10: one task group's work on its own", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await seedTasks([task("t1", { task: "Pack the archive", taskGroup: "Office move" })]);
  await page.goto(OLD_UI);
  await page.getByRole("button", { name: /^Office move\s*1$/ }).click();

  await expect(taskRow(page, "Pack the archive")).toBeVisible();
  await expect(taskRow(page, "Baseline task")).toHaveCount(0);
});

test("W11: delete a task group after confirming", async ({ page }) => {
  acceptDialogs(page);
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await page.goto(OLD_UI);
  await groupHeader(page, "Office move").getByTitle("Delete group").click();

  await expect.poll(() => stored("tasks", "taskGroups")).toEqual([]);
  await expect(groupHeader(page, "Office move")).toHaveCount(0);
});

test("W11: deleting a task group leaves its tasks ungrouped", async ({ page }) => {
  acceptDialogs(page);
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await seedTasks([task("t1", { task: "Pack the archive", taskGroup: "Office move" })]);
  await page.goto(OLD_UI);
  await groupHeader(page, "Office move").getByTitle("Delete group").click();

  await expect.poll(() => stored("tasks", "taskGroups")).toEqual([]);
  await expect(taskRow(page, "Pack the archive")).toBeVisible();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.taskGroup, { timeout: 5000 }).toBeUndefined();
  await expect(groupHeader(page, "Office move")).toHaveCount(0);
});

test("W11: move a task to a task group", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await seedTasks([task("t1", { task: "Pack the archive" })]);
  await page.goto(OLD_UI);
  await taskRow(page, "Pack the archive").click();
  await page.locator("select").filter({ hasText: "— Ungrouped" }).selectOption("Office move");
  await page.getByRole("button", { name: "Save" }).click();

  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.taskGroup).toBe("Office move");
});
