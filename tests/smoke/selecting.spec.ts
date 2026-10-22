// Selecting several tasks (task 3.4, guide 4.7, D-008): tick tasks, then mark them done, move them to a task group
// (company tasks stay), or delete them after a confirmation. Select all reaches every task matching the view.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedGroups, seedTasks, stored, storedById, task } from "./data";

async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const rows = (page: Page) => page.getByRole("article");
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const bar = (page: Page) => page.getByRole("region", { name: "Selected tasks" });
const tick = (page: Page, title: string) => page.getByRole("checkbox", { name: `Select: ${title}` });

async function startSelecting(page: Page) {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page).toHaveURL(/select=1/);
  await expect(bar(page)).toContainText("Choose tasks");
}

async function seedMixed() {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "To Follow Up" })]);
  await seedGroups([{ id: "g1", name: "Hiring", order: 1 }]);
  await seedTasks([
    task("co", { task: "Chase the invoice", endDate: isoDay(-2), linkedClientId: 1 }),
    task("a", { task: "Book interviews", endDate: isoDay(3) }),
    task("b", { task: "Plan the offsite", endDate: isoDay(5) }),
    task("c", { task: "Order the chairs" }),
  ]);
}

test("D-008: ticked tasks are marked done together, and Undo puts them back", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await waitUntilLive(page);
  await startSelecting(page);
  await expect(bar(page).getByRole("button", { name: "Mark done" })).toBeDisabled();
  await tick(page, "Book interviews").click();
  await page.getByText("Plan the offsite").click(); // a click anywhere on the row ticks it rather than opening it
  await expect(tick(page, "Plan the offsite")).toHaveAttribute("aria-checked", "true");
  await expect(page).not.toHaveURL(/task=/);
  await expect(bar(page)).toContainText("2 selected");
  await expect(bar(page).getByRole("button", { name: "Select all 4" })).toBeVisible();
  await bar(page).getByRole("button", { name: "Mark done" }).click();
  await expect(toasts(page).getByText("2 tasks marked done")).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/select=1/);
  await expect(rows(page)).toHaveCount(2);
  expect(await storedById("tasks", "tasks", "a")).toMatchObject({ completed: true });
  expect(await storedById("tasks", "tasks", "b")).toMatchObject({ completed: true });
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect.poll(async () => (await storedById("tasks", "tasks", "a"))?.completed).toBe(false);
});

test("moving to a group takes company tasks too, and they keep their company", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await waitUntilLive(page);
  await startSelecting(page);
  await tick(page, "Chase the invoice").click();
  await tick(page, "Plan the offsite").click();
  await bar(page).getByRole("button", { name: "Move to group" }).click();
  const menu = page.getByRole("menu", { name: "Move to group" });
  await expect(menu).toContainText("Move 2 tasks to");
  await expect(menu).toContainText("The company task keeps its company.");
  await menu.getByRole("menuitem", { name: "Hiring" }).click();
  await expect(toasts(page).getByText("Moved 2 tasks to Hiring.")).toBeVisible();
  expect(await storedById("tasks", "tasks", "b")).toMatchObject({ taskGroup: "Hiring" });
  expect(await storedById("tasks", "tasks", "co")).toMatchObject({ taskGroup: "Hiring", linkedClientId: 1 });
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await storedById("tasks", "tasks", "b"))?.taskGroup).toBeUndefined();
  await expect.poll(async () => (await storedById("tasks", "tasks", "co"))?.taskGroup).toBeUndefined();
});

test("D-008: a new group made from the move menu gets the selected tasks", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await waitUntilLive(page);
  await startSelecting(page);
  await tick(page, "Book interviews").click();
  await tick(page, "Order the chairs").click();
  await bar(page).getByRole("button", { name: "Move to group" }).click();
  await page.getByRole("menuitem", { name: "New group…" }).click();
  const dialog = page.getByRole("dialog", { name: "New task group" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Office move");
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(toasts(page).getByText("Group “Office move” created, and 2 tasks moved into it")).toBeVisible();
  expect(await storedById("tasks", "tasks", "a")).toMatchObject({ taskGroup: "Office move" });
  expect(await storedById("tasks", "tasks", "c")).toMatchObject({ taskGroup: "Office move" });
  expect((await stored("tasks", "taskGroups")).map((g) => g.name)).toContain("Office move");
});

test("D-008: deleting selected tasks asks first, and Esc stops selecting", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await waitUntilLive(page);
  await startSelecting(page);
  await tick(page, "Book interviews").click();
  await tick(page, "Order the chairs").click();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete 2 tasks?" });
  await expect(confirm).toContainText("They will be removed for everyone on the team.");
  await page.keyboard.press("Escape"); // closes the confirmation only
  await expect(confirm).toHaveCount(0);
  await expect(bar(page)).toContainText("2 selected");
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete 2 tasks" }).click();
  await expect(toasts(page).getByText("2 tasks deleted")).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  expect((await stored("tasks", "tasks")).map((t) => t.id).sort()).toEqual(["b", "co"]);
  await startSelecting(page);
  await page.keyboard.press("Escape");
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark done: Plan the offsite" })).toBeVisible();
});

test("D-008: Select all reaches every matching task, not only the 100 shown", async ({ page }) => {
  await seedTasks(Array.from({ length: 120 }, (_, i) => task(`t${i}`, { task: `Task number ${i}`, endDate: isoDay(i % 30) })));
  await page.goto("/tasks");
  await waitUntilLive(page);
  await expect(rows(page)).toHaveCount(100);
  await startSelecting(page);
  await tick(page, "Task number 0").click();
  await bar(page).getByRole("button", { name: "Select all 120" }).click();
  await expect(bar(page)).toContainText("All 120 selected");
  await bar(page).getByRole("button", { name: "Mark done" }).click();
  await expect(toasts(page).getByText("120 tasks marked done")).toBeVisible();
  await expect.poll(async () => (await stored("tasks", "tasks")).filter((t) => t.completed === true).length).toBe(120);
});

test("D-008: Select all covers the view it was used in, and never grows to a wider one", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks?kind=internal");
  await waitUntilLive(page);
  await startSelecting(page);
  await bar(page).getByRole("button", { name: "Select all 3" }).click();
  await expect(bar(page)).toContainText("All 3 selected");
  await page.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: /^All/ }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(bar(page)).toContainText("3 selected");
  await expect(bar(page)).not.toContainText("All 3 selected");
  await expect(bar(page).getByRole("button", { name: "Select all 4" })).toBeVisible();
  await expect(tick(page, "Chase the invoice")).toHaveAttribute("aria-checked", "false");
  await bar(page).getByRole("button", { name: "Mark done" }).click();
  await expect(toasts(page).getByText("3 tasks marked done")).toBeVisible();
  expect(await storedById("tasks", "tasks", "co")).not.toMatchObject({ completed: true });
});

test("D-008: among finished tasks the bar offers Mark not done", async ({ page }) => {
  await seedTasks([
    task("x", { task: "Order the chairs", completed: true, completedAt: Date.now() - 86_400_000 }),
    task("y", { task: "Book the room", completed: true, completedAt: Date.now() - 86_400_000 }),
  ]);
  await page.goto("/tasks?view=done");
  await waitUntilLive(page);
  await startSelecting(page);
  await tick(page, "Order the chairs").click();
  await bar(page).getByRole("button", { name: "Mark not done" }).click();
  await expect(toasts(page).getByText("1 task moved back to open tasks")).toBeVisible();
  expect(await storedById("tasks", "tasks", "x")).toMatchObject({ completed: false });
  expect(await storedById("tasks", "tasks", "y")).toMatchObject({ completed: true });
});
