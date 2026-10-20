// Tasks on the old UI: capture, edit, mark done, delete, kinds of work.
import { test, expect } from "./fixtures";
import { acceptDialogs, company, isoDay, seedBaseline, seedCompanies, seedTasks, storedById, stored, task } from "./data";
import { OLD_UI, addPerson, field, openArea, taskModal, taskRow } from "./old-ui";
import { clearAll, readFields } from "../support/emulator";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

test.beforeEach(async () => {
  await seedBaseline();
});

test("W1 W2 W3: capture a task with its details, owner and informed people", async ({ page }) => {
  await page.goto(OLD_UI);
  await page.getByRole("button", { name: "+ Add task", exact: true }).click();
  const modal = taskModal(page, "New Task");
  await modal.getByPlaceholder("Describe the task…").fill("Send the trial summary");
  await field(modal, "Priority").selectOption("High");
  await field(modal, "Task type").selectOption("Send Proposal/Quote");
  await field(modal, "Touch Point").fill("Email");
  await field(modal, "Start date").fill(isoDay(1));
  await field(modal, "End date").fill(isoDay(4));
  await addPerson(field(modal, "Responsible"), "Ana");
  await addPerson(field(modal, "Informed"), "Ben (backup)");
  await field(modal, "Key points").fill("Attach the pricing sheet");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(taskRow(page, "Send the trial summary")).toBeVisible();
  await expect
    .poll(async () => (await stored("tasks", "tasks")).find((t) => t.task === "Send the trial summary"))
    .toMatchObject({
      priority: "High",
      taskType: "Send Proposal/Quote",
      touchPoint: "Email",
      startDate: isoDay(1),
      endDate: isoDay(4),
      responsible: ["Ana"],
      informed: [{ name: "Ben", note: "backup" }],
      keyPoints: "Attach the pricing sheet",
    });
});

test("W1: a task needs a description", async ({ page }) => {
  const alerts: string[] = [];
  page.on("dialog", (d) => {
    alerts.push(d.message());
    void d.accept();
  });
  await page.goto(OLD_UI);
  await page.getByRole("button", { name: "+ Add task", exact: true }).click();
  await taskModal(page, "New Task").getByRole("button", { name: "Save" }).click();
  expect(alerts).toEqual(["Task description is required."]);
  expect(await stored("tasks", "tasks")).toHaveLength(1); // only the baseline
});

test("W7: edit a task's details", async ({ page }) => {
  await seedTasks([task("t1", { task: "Draft the agenda", responsible: ["Ana"] })]);
  await page.goto(OLD_UI);
  await taskRow(page, "Draft the agenda").click();
  const modal = taskModal(page, "Edit Task");
  await modal.getByPlaceholder("Describe the task…").fill("Draft the workshop agenda");
  await field(modal, "End date").fill(isoDay(2));
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(taskRow(page, "Draft the workshop agenda")).toBeVisible();
  await expect
    .poll(() => storedById("tasks", "tasks", "t1"))
    .toMatchObject({ task: "Draft the workshop agenda", endDate: isoDay(2), responsible: ["Ana"] });
});

test("W5 W6: mark a task done, find it among finished tasks, mark it not done", async ({ page }) => {
  await seedTasks([task("t1", { task: "Book the room" })]);
  await page.goto(OLD_UI);
  await taskRow(page, "Book the room").getByRole("checkbox").click();

  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(true);
  await expect(taskRow(page, "Book the room")).toHaveCount(0);
  await page.getByRole("button", { name: /Show completed\s*\(1\)/ }).click();
  await expect(taskRow(page, "Book the room")).toBeVisible();

  await taskRow(page, "Book the room").getByRole("checkbox").click();
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.completed).toBe(false);
});

test("W7: delete a task after confirming", async ({ page }) => {
  acceptDialogs(page);
  await seedTasks([task("t1", { task: "Old reminder" })]);
  await page.goto(OLD_UI);
  await taskRow(page, "Old reminder").getByTitle("Delete").click();

  await expect(taskRow(page, "Old reminder")).toHaveCount(0);
  await expect.poll(() => storedById("tasks", "tasks", "t1")).toBeUndefined();
});

test("W12: a company task is prospect work, and client work once the deal is done", async ({ page }) => {
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "To Follow Up" }),
    company(2, { company: "Arunika Labs", status: "Client / Partner Done Deal" }),
  ]);
  await seedTasks([
    task("p", { task: "Call Pelita about the trial", linkedClientId: 1 }),
    task("c", { task: "Renewal for Arunika", linkedClientId: 2 }),
    task("i", { task: "Tidy the shared drive" }),
  ]);
  await page.goto(OLD_UI);
  await expect(taskRow(page, "Tidy the shared drive")).toBeVisible();
  await expect(taskRow(page, "Call Pelita about the trial")).toHaveCount(0);

  await openArea(page, "Prospects");
  await expect(taskRow(page, "Call Pelita about the trial")).toBeVisible();
  await expect(taskRow(page, "Renewal for Arunika")).toHaveCount(0);

  await openArea(page, "Clients");
  await expect(taskRow(page, "Renewal for Arunika")).toBeVisible();
  await expect(taskRow(page, "Tidy the shared drive")).toHaveCount(0);
});

test("W14: prospect work comes latest deadline first, undated last, and narrows by days without action", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods" })]);
  await seedTasks([
    task("a", { task: "Early deadline", linkedClientId: 1, endDate: isoDay(1), lastActionDate: isoDay(-2) }),
    task("b", { task: "Undated follow-up", linkedClientId: 1, lastActionDate: isoDay(-20) }),
    task("c", { task: "Late deadline", linkedClientId: 1, endDate: isoDay(9), lastActionDate: isoDay(-15) }),
  ]);
  await page.goto(OLD_UI);
  await openArea(page, "Prospects");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveText([/Late deadline/, /Early deadline/, /Undated follow-up/]);

  await page.getByRole("spinbutton").fill("14");
  await expect(rows).toHaveText([/Late deadline/, /Undated follow-up/]);
});

test("D11: a task edited from another view is saved", async ({ page }) => {
  await seedTasks([task("t1", { task: "Prepare the demo", startDate: isoDay(0), endDate: isoDay(0), responsible: ["Ana"] })]);
  await page.goto(OLD_UI);
  await openArea(page, "Daily View", "Views");
  await page.getByText("Prepare the demo").click();
  const modal = taskModal(page, "Edit Task");
  await field(modal, "Key points").fill("Use the new deck");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.keyPoints).toBe("Use the new deck");
});

test("D11: editing from another view writes no stray id field", async ({ page }) => {
  await seedTasks([task("t1", { task: "Prepare the demo", startDate: isoDay(0), endDate: isoDay(0) })]);
  await page.goto(OLD_UI);
  await openArea(page, "Daily View", "Views");
  await page.getByText("Prepare the demo").click();
  const modal = taskModal(page, "Edit Task");
  await field(modal, "Key points").fill("Use the new deck");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.keyPoints).toBe("Use the new deck");
  expect(await readFields("tasks", "tasks/t1")).not.toHaveProperty("id");
});

test("W7: clearing a task's type clears it", async ({ page }) => {
  await seedTasks([task("t1", { task: "Draft the agenda", taskType: "Follow Up" })]);
  await page.goto(OLD_UI);
  await taskRow(page, "Draft the agenda").click();
  const modal = taskModal(page, "Edit Task");
  await field(modal, "Task type").selectOption("");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect.poll(async () => readFields("tasks", "tasks/t1")).not.toHaveProperty("taskType");
});

test.describe("on empty data", () => {
  test("Q7: the app opens without adding sample data", async ({ page }) => {
    await clearAll();
    await page.goto(OLD_UI);
    await expect(page.getByText("No tasks yet. Add your first one.")).toBeVisible();
    await page.waitForTimeout(1500); // the old app added its samples as soon as it saw nothing
    expect(await stored("tasks", "tasks")).toEqual([]);
    expect(await stored("clients", "pipeline")).toEqual([]);
  });
});

test("A3: with no connection a new task is refused, and nothing is stored", async ({ page, context }) => {
  await page.goto(OLD_UI);
  await expect(taskRow(page, "Baseline task")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "+ Add task", exact: true }).click();
  const modal = taskModal(page, "New Task");
  await modal.getByPlaceholder("Describe the task…").fill("Written offline");
  const refusal = page.waitForEvent("dialog");
  await modal.getByRole("button", { name: "Save" }).click();
  const dialog = await refusal;
  expect(dialog.message()).toBe("No connection. The task wasn't added.");
  await dialog.dismiss();
  // Refused before reaching Firestore, so nothing is queued to arrive later.
  await context.setOffline(false);
  expect((await stored("tasks", "tasks")).map((t) => t.task)).toEqual(["Baseline task"]);
});
