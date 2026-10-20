// Task details (task 3.1, guide 6.3): adding quickly or with every detail, changing a task with its company kept in
// step, marking it done, deleting it after a confirmation, and refusing to save with no connection.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, stored, task } from "./data";

// Writes are refused until the app has reached the server. The live status sits in the side bar (hidden on phones).
async function waitUntilLive(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
}

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });

test("W1: a task is captured in a sentence, and Enter saves it as internal work", async ({ page }) => {
  await page.goto("/?task=new");
  await waitUntilLive(page);
  const s = sheet(page, "New task");
  await expect(s.getByLabel("Description")).toBeFocused();
  await s.getByLabel("Description").fill("Book the interview room");
  await s.getByLabel("Description").press("Enter");
  await expect(s).toHaveCount(0);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Task added")).toBeVisible();
  const all = await stored("tasks", "tasks");
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ task: "Book the interview room", responsible: [], informed: [] });
  expect(all[0].linkedClientId).toBeUndefined();
});

test("5.5: a task needs a description, and the error clears once there is one", async ({ page }) => {
  await page.goto("/tasks?task=new");
  await waitUntilLive(page);
  const s = sheet(page, "New task");
  await s.getByRole("button", { name: "Add task" }).click();
  const message = s.getByText("Add a short description so the team knows what this is.");
  await expect(message).toBeVisible();
  await expect(s.getByLabel("Description")).toBeFocused();
  await expect(s.getByLabel("Description")).toHaveAttribute("aria-invalid", "true");
  await s.getByLabel("Description").fill("Order the new chairs");
  await expect(message).toHaveCount(0);
  expect(await stored("tasks", "tasks")).toHaveLength(0);
});

test("W2, W3, W4: every detail is added, with a new name and someone kept informed", async ({ page }) => {
  await seedTasks([task("other", { responsible: ["Maya Chen"] })]);
  await page.goto("/tasks?task=new");
  await waitUntilLive(page);
  const s = sheet(page, "New task");
  await s.getByLabel("Description").fill("Plan the office move");
  await s.getByRole("button", { name: /Add details/ }).click();
  await expect(s.getByLabel("Task type")).toBeFocused();
  await s.getByLabel("Task type").selectOption("Our Action");
  await s.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" }).click();
  await s.getByRole("group", { name: "Touch point" }).getByRole("button", { name: "Meeting" }).click();
  await s.getByLabel("Deadline").fill(isoDay(7));
  await s.getByLabel("Responsible").fill("Nadia");
  await expect(s.getByText("Add “Nadia” as a new name")).toBeVisible();
  await s.getByLabel("Responsible").press("Enter");
  await s.getByLabel("Add someone to keep informed").fill("Maya");
  await expect(s.getByText("Names already in use")).toBeVisible();
  await s.getByLabel("Add someone to keep informed").press("Enter");
  await s.getByLabel("Their part for Maya Chen").fill("backup");
  await s.getByLabel("Key points").fill("The lease ends in March.");
  await s.getByRole("button", { name: "Add task" }).click();
  await expect(s).toHaveCount(0);
  const added = (await stored("tasks", "tasks")).find((t) => t.id !== "other");
  expect(added).toMatchObject({
    task: "Plan the office move",
    taskType: "Our Action",
    priority: "High",
    touchPoint: "Meeting",
    endDate: isoDay(7),
    responsible: ["Nadia"],
    informed: [{ name: "Maya Chen", note: "backup" }],
    keyPoints: "The lease ends in March.",
  });
});

test("W7, B12: changing a company task's deadline brings the company and its other open tasks in step", async ({ page }) => {
  await seedCompanies([company(1, { company: "Halcyon Logistics", date: isoDay(-6), target: isoDay(10) })]);
  await seedTasks([
    task("t1", { task: "Send the revised proposal", linkedClientId: 1, lastActionDate: isoDay(-6), endDate: isoDay(10) }),
    task("t2", { task: "Book the demo", linkedClientId: 1, lastActionDate: isoDay(-6), endDate: isoDay(10) }),
  ]);
  await page.goto("/tasks?task=t1");
  const s = sheet(page, "Task");
  await expect(s.getByText("Halcyon Logistics", { exact: true })).toBeVisible();
  await expect(s.getByRole("link", { name: "Open company" })).toHaveAttribute("href", "/companies?company=1");
  await expect(s.getByText("The deadline and last action stay in step with Halcyon Logistics.", { exact: false })).toBeVisible();
  await s.getByLabel("Deadline").fill(isoDay(3));
  await s.getByRole("button", { name: "Save changes" }).click();
  await expect(s).toHaveCount(0);
  await expect(page.getByText("Changes saved. Halcyon Logistics and 1 other task now match.")).toBeVisible();
  expect(await storedById("tasks", "tasks", "t1")).toMatchObject({ endDate: isoDay(3), task: "Send the revised proposal" });
  expect(await storedById("tasks", "tasks", "t2")).toMatchObject({ endDate: isoDay(3) });
  expect(await storedById("clients", "pipeline", 1)).toMatchObject({ target: isoDay(3), date: isoDay(-6) });
});

test("W5: a task is marked done from its details, with Undo", async ({ page }) => {
  await seedTasks([task("t1", { task: "Order the new chairs" })]);
  await page.goto("/tasks?task=t1");
  await sheet(page, "Task").getByRole("button", { name: "Mark done" }).click();
  await expect(sheet(page, "Task")).toHaveCount(0);
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(true);
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(false);
});

test("a finished task says so, and can be marked not done", async ({ page }) => {
  await seedTasks([task("t1", { task: "Order the new chairs", completed: true, completedAt: Date.now() - 3 * 86_400_000 })]);
  await page.goto("/tasks?task=t1");
  const s = sheet(page, "Finished task");
  await expect(s.getByText("Finished 3 days ago.")).toBeVisible();
  await s.getByRole("button", { name: "Mark not done" }).click();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(false);
  await expect(page.getByText("Moved back to open tasks")).toBeVisible();
});

test("W7: deleting a task asks first, then removes it for everyone", async ({ page }) => {
  await seedTasks([task("t1", { task: "Order the new chairs" }), task("t2")]);
  await page.goto("/tasks?task=t1");
  await sheet(page, "Task").getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this task?" });
  await expect(confirm.getByText("Order the new chairs")).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete task" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(sheet(page, "Task")).toHaveCount(0);
  await expect(page.getByText("Task deleted")).toBeVisible();
  expect((await stored("tasks", "tasks")).map((t) => t.id)).toEqual(["t2"]);
});

test("A3: with no connection, adding is refused and the sheet keeps what was typed", async ({ page, context }) => {
  await page.goto("/?task=new");
  await waitUntilLive(page);
  const s = sheet(page, "New task");
  await s.getByLabel("Description").fill("Written offline");
  await context.setOffline(true);
  await s.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("No connection. The task wasn't added.")).toBeVisible();
  await expect(s.getByLabel("Description")).toHaveValue("Written offline");
  await context.setOffline(false);
  expect(await stored("tasks", "tasks")).toHaveLength(0);
});

test("a task that isn't there any more says so instead of opening", async ({ page }) => {
  await seedTasks([task("t1")]);
  await page.goto("/tasks?task=gone");
  await expect(page.getByText("This task isn't there any more. Someone may have deleted it.")).toBeVisible();
  await expect(page).toHaveURL("/tasks");
});
