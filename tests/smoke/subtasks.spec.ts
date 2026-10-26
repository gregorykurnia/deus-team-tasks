// Subtasks (N24): added from a task's sheet, listed under their parent on All tasks with a count on the parent, opened
// from the sheet and back to the parent, and kept as tasks of their own when the parent is deleted.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, task } from "./data";

async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const rows = (page: Page) => page.getByRole("main").getByRole("article");
const sheet = (page: Page) => page.getByRole("dialog", { name: "Task" });

test("a subtask is added from its parent's sheet, sits under it on All tasks, and links back", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "To Follow Up" })]);
  await seedTasks([
    task("p", { task: "Run the Pelita trial", endDate: isoDay(9), linkedClientId: 1 }),
    task("o", { task: "Send the quote", endDate: isoDay(3) }),
  ]);
  await page.goto("/tasks?task=p");
  await waitUntilLive(page);
  const subtasks = sheet(page).getByRole("group", { name: "Subtasks" });
  await subtasks.getByRole("textbox", { name: "Add a subtask" }).fill("Book the trial room");
  await subtasks.getByRole("textbox", { name: "Add a subtask" }).press("Enter");
  await expect(subtasks.getByRole("article")).toContainText("Book the trial room");
  await expect(subtasks.getByRole("textbox", { name: "Add a subtask" })).toHaveValue("");

  // It sits under its parent, though its own empty deadline would sort it last, and the parent counts it.
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText("Send the quote");
  await expect(rows(page).nth(1)).toContainText("Run the Pelita trial");
  await expect(rows(page).nth(1)).toContainText("0/1 subtask");
  await expect(rows(page).nth(2)).toContainText("Book the trial room");
  await expect(rows(page).nth(2)).toHaveAttribute("data-sub", "true");

  // A subtask has its parent's company, and no subtasks of its own; its sheet goes back to the parent.
  await rows(page).nth(2).getByRole("link", { name: "Book the trial room" }).click();
  await expect(sheet(page).getByText("Subtask of")).toBeVisible();
  await expect(sheet(page).getByRole("group", { name: "Subtasks" })).toHaveCount(0);
  await sheet(page).getByRole("link", { name: "Run the Pelita trial" }).click();
  await expect(sheet(page).getByRole("textbox", { name: "Description" })).toHaveValue("Run the Pelita trial");
  const id = new URL(page.url()).searchParams.get("task");
  expect(id).toBe("p");
});

test("deleting a parent keeps its subtasks as tasks of their own", async ({ page }) => {
  await seedTasks([task("p", { task: "Plan the offsite" }), task("s", { task: "Book the venue", parentId: "p" })]);
  await page.goto("/tasks?task=p");
  await waitUntilLive(page);
  await sheet(page).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this task?" });
  await expect(confirm).toContainText("Its subtask stays, as a task of its own.");
  await confirm.getByRole("button", { name: "Delete task" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).not.toHaveAttribute("data-sub");
  await expect.poll(async () => (await storedById("tasks", "tasks", "s"))?.parentId ?? null).toBeNull();
});
