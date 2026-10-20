// All tasks and task groups (task 3.3, guide 6.2): the list with its kind switch, filters, sort and details shown, marking done
// from the list, 100 rows at a time, and making, renaming, starring and deleting a task group.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedGroups, seedTasks, storedById, stored, task } from "./data";

// Writes are refused until the app has reached the server. The live status sits in the side bar (hidden on phones).
async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const rows = (page: Page) => page.getByRole("article");
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const filter = (page: Page, name: string | RegExp) => page.getByRole("toolbar", { name: "Filter and sort" }).getByRole("button", { name });
const kinds = (page: Page) => page.getByRole("group", { name: "Kind of work" });
const search = (page: Page) => page.getByRole("searchbox", { name: /^Search/ });

async function seedMixed() {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "To Follow Up" }), company(2, { company: "Halcyon Logistics", status: "Client / Partner Done Deal" })]);
  await seedGroups([{ id: "g1", name: "Hiring", order: 1 }]);
  await seedTasks([
    task("late", { task: "Chase the invoice", endDate: isoDay(-2), linkedClientId: 1, lastActionDate: isoDay(-20), taskType: "Follow Up" }),
    task("quote", { task: "Send the quote", endDate: isoDay(2), linkedClientId: 2, lastActionDate: isoDay(-1) }),
    task("hire", { task: "Book interviews", endDate: isoDay(10), taskGroup: "Hiring" }),
    task("loose", { task: "Plan the offsite" }),
    task("done1", { task: "Order the chairs", completed: true, completedAt: Date.now() - 86_400_000 }),
  ]);
}

test("W5, W6: open tasks by deadline with a count per kind, and the kind switch narrows them", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(page.getByText("4 open tasks").first()).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).first()).toContainText("Chase the invoice");
  await expect(rows(page).last()).toContainText("Plan the offsite"); // no deadline goes last
  await expect(kinds(page).getByRole("button", { name: /^All\s*4$/ })).toBeVisible();
  await expect(kinds(page).getByRole("button", { name: /^Clients\s*1$/ })).toBeVisible();
  await kinds(page).getByRole("button", { name: /^Clients/ }).click();
  await expect(page).toHaveURL(/kind=client/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Send the quote");
  await expect(page.getByText("1 open task", { exact: true })).toBeVisible();
});

test("W8: a link from Today lands on the filtered list", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks?due=overdue");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Chase the invoice");
  await expect(filter(page, /^Due\s*Overdue/)).toBeVisible();
  await expect(page.getByText(/of 4 open tasks/)).toBeVisible();
  await filter(page, "Clear the due filter").click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page).toHaveURL("/tasks");
});

test("W9: 'No action for' counts company tasks, and says when none has gone that long", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks?idle=14");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Chase the invoice");
  await filter(page, /^No action for/).click();
  await page.getByRole("menuitemradio", { name: "30 days or more" }).click();
  await expect(page.getByRole("heading", { name: "Nothing has gone 30 days without action" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filter" }).click();
  await expect(rows(page)).toHaveCount(4);
});

test("W6: search and the task type narrow the list, and nothing matching says so", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(4); // typing before the page is ready would be lost
  await search(page).fill("pelita");
  await expect(rows(page)).toHaveCount(1);
  await expect(page).toHaveURL(/q=pelita/);
  await expect(page.getByText(/^1 of 4 open tasks/)).toBeVisible();
  await search(page).fill("budget");
  await expect(page.getByRole("heading", { name: "No tasks match" })).toBeVisible();
  await expect(page.getByText("Nothing open matches “budget”.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(search(page)).toHaveValue("");
  await filter(page, /^Type/).click();
  await page.getByRole("menuitemradio", { name: "Follow Up" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(filter(page, /^Type\s*Follow Up/)).toBeVisible();
});

test("D3: sorting from the menu puts empty values last whichever way round", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(4);
  await filter(page, /^Sort/).click();
  await page.getByRole("menuitemradio", { name: "Description" }).click();
  await expect(filter(page, /^Sort\s*Description, A to Z/)).toBeVisible();
  await expect(rows(page).first()).toContainText("Book interviews");
  await filter(page, /^Sort/).click();
  await page.getByRole("menuitemradio", { name: "Z to A" }).click();
  await expect(rows(page).first()).toContainText("Send the quote");
  await filter(page, /^Sort/).click();
  await page.getByRole("menuitemradio", { name: "Deadline" }).click();
  await filter(page, /^Sort/).click();
  await page.getByRole("menuitemradio", { name: "Latest first" }).click();
  await expect(rows(page).first()).toContainText("Book interviews");
  await expect(rows(page).last()).toContainText("Plan the offsite");
});

test("W15: details shown are chosen from a menu and remembered on this device", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('[data-col="touch"]')).toHaveCount(0);
  await filter(page, "Details shown").click();
  await page.getByRole("menuitemcheckbox", { name: "Touch point" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Touch point" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-col="touch"]').first()).toBeAttached();
  await page.reload();
  await expect(page.locator('[data-col="touch"]').first()).toBeAttached();
  await filter(page, "Details shown").click();
  await page.getByRole("menuitem", { name: "Reset to the default" }).click();
  await expect(page.locator('[data-col="touch"]')).toHaveCount(0);
});

test("D2: marking done in the list writes it, the row leaves, and Undo puts it back", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks");
  await waitUntilLive(page);
  await page.getByRole("button", { name: "Mark done: Plan the offsite" }).click();
  await expect(toasts(page).getByText("Marked done")).toBeVisible();
  await expect(rows(page).filter({ hasText: "Plan the offsite" })).toHaveCount(0);
  const saved = await storedById("tasks", "tasks", "loose");
  expect(saved).toMatchObject({ completed: true });
  expect(typeof saved?.completedAt).toBe("number");
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(rows(page).filter({ hasText: "Plan the offsite" })).toHaveCount(1);
  await expect.poll(async () => (await storedById("tasks", "tasks", "loose"))?.completed).toBe(false);
});

test("W10: finished tasks show most recent first, and an undated finish is under 'any time' (N1)", async ({ page }) => {
  await seedTasks([
    task("a", { task: "Finished yesterday", completed: true, completedAt: Date.now() - 86_400_000 }),
    task("b", { task: "Finished last month", completed: true, completedAt: Date.now() - 20 * 86_400_000 }),
    task("c", { task: "Finished long ago, no date", completed: true }),
    task("d", { task: "Still open" }),
  ]);
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(1); // the page is ready once it shows its tasks
  await page.getByRole("group", { name: "Open or done" }).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/view=done/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Finished yesterday");
  await expect(rows(page)).toContainText("Done yesterday");
  await expect(page.getByText(/1 task finished in the last 7 days/)).toBeVisible();
  await filter(page, /^Finished/).click();
  await page.getByRole("menuitemradio", { name: "In the last 30 days" }).click();
  await expect(rows(page)).toHaveCount(2);
  await filter(page, /^Finished/).click();
  await page.getByRole("menuitemradio", { name: "Any time" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toContainText("Finished yesterday");
  await expect(rows(page).last()).toContainText("Finished long ago, no date");
});

test("W10: marking a finished task not done moves it back to the open tasks", async ({ page }) => {
  await seedTasks([task("a", { task: "Order the chairs", completed: true, completedAt: Date.now() - 86_400_000 })]);
  await page.goto("/tasks?view=done");
  await waitUntilLive(page);
  await page.getByRole("button", { name: "Mark not done: Order the chairs" }).click();
  await expect(toasts(page).getByText("Moved back to open tasks")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  expect(await storedById("tasks", "tasks", "a")).toMatchObject({ completed: false });
});

test("5.7: a long list shows 100 rows, then 100 more", async ({ page }) => {
  await seedTasks(Array.from({ length: 230 }, (_, i) => task(`t${i}`, { task: `Task number ${i}`, endDate: isoDay(i % 50) })));
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(100);
  await expect(page.getByText("Showing 100 of 230")).toBeVisible();
  await page.getByRole("button", { name: "Show 100 more" }).click();
  await expect(rows(page)).toHaveCount(200);
  await page.getByRole("button", { name: "Show 30 more" }).click();
  await expect(rows(page)).toHaveCount(230);
  await expect(page.getByText(/^Showing/)).toHaveCount(0);
});

test("nothing yet: an empty list says how to start, and quick capture adds the first task", async ({ page }) => {
  await page.goto("/tasks");
  await waitUntilLive(page);
  await expect(page.getByRole("heading", { name: "Nothing on the list yet" })).toBeVisible();
  await page.getByRole("textbox", { name: "New task" }).fill("Book the interview room");
  await page.getByRole("textbox", { name: "New task" }).press("Enter");
  await expect(toasts(page).getByText("Task added")).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  const all = await stored("tasks", "tasks");
  expect(all[0]).toMatchObject({ task: "Book the interview room" });
});

test("W11: a task group is made from a name, with a star if wanted, and opens on its own page", async ({ page }) => {
  await page.goto("/tasks?newGroup=1");
  await waitUntilLive(page);
  const dialog = page.getByRole("dialog", { name: "New task group" });
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await dialog.getByRole("button", { name: "Mark as important" }).click();
  await dialog.getByLabel("Name").fill("Office move");
  await dialog.getByLabel("Name").press("Enter");
  await expect(page).toHaveURL(/\/tasks\/groups\//);
  await expect(page.getByRole("heading", { level: 1, name: "Office move" })).toBeVisible();
  await expect(toasts(page).getByText("Group “Office move” created")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing in Office move yet" })).toBeVisible();
  const groups = await stored("tasks", "taskGroups");
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ name: "Office move", starred: true });
});

test("5.5: a group needs a name that isn't taken, ignoring case, and nothing is made until it is", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Hiring", order: 1 }]);
  await page.goto("/tasks?newGroup=1");
  await waitUntilLive(page);
  const dialog = page.getByRole("dialog", { name: "New task group" });
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(dialog.getByText("Give the group a name.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await dialog.getByLabel("Name").fill("  hiring ");
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(dialog.getByText("There's already a group called “hiring”. Pick another name.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByLabel("Name").fill("Hiring plans");
  await expect(dialog.getByText(/already a group/)).toHaveCount(0);
  expect(await stored("tasks", "taskGroups")).toHaveLength(1);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL("/tasks");
});

test("W11: a group's page lists its own tasks, adds new ones to it, and has no kind switch", async ({ page }) => {
  await seedMixed();
  await page.goto("/tasks/groups/g1");
  await waitUntilLive(page);
  await expect(page.getByRole("heading", { level: 1, name: "Hiring" })).toBeVisible();
  await expect(page.getByText("1 open task").first()).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Book interviews");
  await expect(kinds(page)).toHaveCount(0);
  await page.getByRole("textbox", { name: "New task" }).fill("Draft the job post");
  await page.getByRole("textbox", { name: "New task" }).press("Enter");
  await expect(toasts(page).getByText("Task added")).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  const added = (await stored("tasks", "tasks")).find((t) => t.task === "Draft the job post");
  expect(added).toMatchObject({ taskGroup: "Hiring" });
  await expect(search(page)).toHaveAccessibleName("Search this group");
});

test("W11: a group is starred from its header", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Hiring", order: 1 }]);
  await page.goto("/tasks/groups/g1");
  await waitUntilLive(page);
  await page.getByRole("button", { name: "Important" }).click();
  await expect(toasts(page).getByText("Marked as important")).toBeVisible();
  expect(await storedById("tasks", "taskGroups", "g1")).toMatchObject({ starred: true });
  await expect(page.getByRole("button", { name: "Important" })).toHaveAttribute("aria-pressed", "true");
});

test("W11: renaming a group renames it on its tasks too", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Hiring", order: 1 }]);
  await seedTasks([task("a", { task: "Book interviews", taskGroup: "Hiring" }), task("b", { task: "Plan the offsite" })]);
  await page.goto("/tasks/groups/g1");
  await waitUntilLive(page);
  await page.getByRole("button", { name: "Options for Hiring" }).click();
  await page.getByRole("menuitem", { name: "Rename group" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename task group" });
  await expect(dialog.getByLabel("Name")).toHaveValue("Hiring");
  await dialog.getByLabel("Name").fill("Recruiting");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page).getByText("Group renamed")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Recruiting" })).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  expect(await storedById("tasks", "taskGroups", "g1")).toMatchObject({ name: "Recruiting" });
  expect(await storedById("tasks", "tasks", "a")).toMatchObject({ taskGroup: "Recruiting" });
  expect((await storedById("tasks", "tasks", "b"))?.taskGroup).toBeUndefined();
});

test("W11: deleting a group asks first, and its tasks stay, ungrouped", async ({ page }) => {
  await seedGroups([{ id: "g1", name: "Hiring", order: 1 }]);
  await seedTasks([task("a", { task: "Book interviews", taskGroup: "Hiring" }), task("b", { task: "Old interview", taskGroup: "Hiring", completed: true })]);
  await page.goto("/tasks/groups/g1");
  await waitUntilLive(page);
  await page.getByRole("button", { name: "Options for Hiring" }).click();
  await page.getByRole("menuitem", { name: "Delete group" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete “Hiring”?" });
  await expect(confirm).toContainText("Its 2 tasks stay and become ungrouped. You'll find them under Internal.");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(await stored("tasks", "taskGroups")).toHaveLength(1);
  await page.getByRole("button", { name: "Options for Hiring" }).click();
  await page.getByRole("menuitem", { name: "Delete group" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete group" }).click();
  await expect(page).toHaveURL(/\/tasks\?kind=internal/);
  await expect(toasts(page).getByText("Group “Hiring” deleted. Its tasks are now ungrouped.")).toBeVisible();
  expect(await stored("tasks", "taskGroups")).toHaveLength(0);
  expect((await storedById("tasks", "tasks", "a"))?.taskGroup).toBeUndefined();
  expect((await storedById("tasks", "tasks", "b"))?.taskGroup).toBeUndefined();
  await expect(rows(page).filter({ hasText: "Book interviews" })).toHaveCount(1);
});

test("a task group that isn't there any more says so, and points to All tasks (N7)", async ({ page }) => {
  await page.goto("/tasks/groups/nope");
  await expect(page.getByRole("heading", { name: "This task group isn't there any more" })).toBeVisible();
  await page.getByRole("link", { name: "All tasks" }).last().click();
  await expect(page).toHaveURL("/tasks");
});

test("A3: going offline shows the banner over the list, which keeps its tasks", async ({ page, context }) => {
  await seedMixed();
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(4);
  await waitUntilLive(page);
  await context.setOffline(true);
  await expect(page.getByText("No connection.", { exact: false }).first()).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Mark done: Plan the offsite" }).click();
  await expect(toasts(page).getByText("No connection. The task wasn't marked done.")).toBeVisible();
  await expect(rows(page).filter({ hasText: "Plan the offsite" })).toHaveCount(1);
});
