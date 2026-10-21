// Task groups (the 1.2 job stories, on the new UI since 4.3): a starred group comes first, and a task moves into a group
// from its details. The other 1.2 stories are guarded in tasks-screen.spec (create, a new name needed, star, a group's
// own page, delete with its tasks left ungrouped) and selecting.spec (several tasks moved at once).
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seedGroups, seedTasks, storedById, task } from "./data";

const waitUntilLive = (page: Page) => expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
// The side bar lists the groups on large screens; phones have a row of chips under the title instead.
const groupLinks = (page: Page, isMobile: boolean) =>
  (isMobile ? page.getByRole("navigation", { name: "Task groups" }) : page.getByRole("region", { name: "Task groups" }))
    .getByRole("link")
    .filter({ hasText: /Hiring|Office move/ });

test("W9: a starred task group comes first", async ({ page, isMobile }) => {
  await seedGroups([
    { id: "g1", name: "Hiring", order: 1 },
    { id: "g2", name: "Office move", order: 2 },
  ]);
  await page.goto("/tasks/groups/g2");
  await waitUntilLive(page);
  await expect(groupLinks(page, isMobile)).toHaveText([/Hiring/, /Office move/]);
  await page.getByRole("button", { name: "Important" }).click();
  await expect.poll(async () => (await storedById("tasks", "taskGroups", "g2"))?.starred).toBe(true);
  await expect(groupLinks(page, isMobile)).toHaveText([/Office move/, /Hiring/]);
});

test("W11: a task moves to a task group from its details", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await seedTasks([task("t1", { task: "Pack the archive" })]);
  await page.goto("/tasks?task=t1");
  await waitUntilLive(page);
  const sheet = page.getByRole("dialog", { name: "Task" });
  await sheet.getByRole("combobox", { name: "Task group" }).selectOption("Office move");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.taskGroup).toBe("Office move");
  await page.goto("/tasks/groups/g1");
  await expect(page.getByRole("article").filter({ hasText: "Pack the archive" })).toHaveCount(1);
});
