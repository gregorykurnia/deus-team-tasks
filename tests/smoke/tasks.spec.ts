// Tasks (the 1.2 job stories, on the new UI since 4.3): the kinds of work, editing a task from its details and from
// another screen, clearing a value, and opening on empty data without sample tasks. The other 1.2 stories are guarded
// where the new screens are tested: capture with every detail, a description needed, delete, and adding refused offline
// in task-sheet.spec; done, finished tasks and not done in tasks-screen.spec; quick capture in today.spec; days without
// action and sorting with empty values last in tasks-screen.spec.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, stored, task } from "./data";
import { readFields } from "../support/emulator";
import { shortDate, weekdayDate } from "../../lib/dates";

// Writes are refused until the app has reached the server. The live status sits in the side bar (hidden on phones).
const waitUntilLive = (page: Page) => expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
const sheet = (page: Page) => page.getByRole("dialog", { name: "Task" });
const rows = (page: Page) => page.getByRole("article");
const kind = (page: Page, name: string) => page.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: new RegExp(`^${name}`) });

test("W12: a company task is prospect work, client work once the deal is done, and anything else is internal", async ({ page }) => {
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "To Follow Up" }),
    company(2, { company: "Arunika Labs", status: "Client / Partner Done Deal" }),
  ]);
  await seedTasks([
    task("p", { task: "Call Pelita about the trial", linkedClientId: 1 }),
    task("c", { task: "Renewal for Arunika", linkedClientId: 2 }),
    task("i", { task: "Tidy the shared drive" }),
  ]);
  await page.goto("/tasks");
  await expect(rows(page)).toHaveCount(3);
  for (const [name, title] of [
    ["Prospects", "Call Pelita about the trial"],
    ["Clients", "Renewal for Arunika"],
    ["Internal", "Tidy the shared drive"],
  ]) {
    await kind(page, name).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(title);
  }
});

test("W7: a task's details are changed and saved, keeping what wasn't touched", async ({ page }) => {
  await seedTasks([task("t1", { task: "Draft the agenda", responsible: ["Ana"] })]);
  await page.goto("/tasks?task=t1");
  await waitUntilLive(page);
  await sheet(page).getByLabel("Description").fill("Draft the workshop agenda");
  await sheet(page).getByLabel("Deadline").fill(isoDay(2));
  await sheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(rows(page).filter({ hasText: "Draft the workshop agenda" })).toHaveCount(1);
  expect(await storedById("tasks", "tasks", "t1")).toMatchObject({ task: "Draft the workshop agenda", endDate: isoDay(2), responsible: ["Ana"] });
});

test("D11: a task changed from the Plan's day is saved, with no stray id field", async ({ page }) => {
  await seedTasks([task("t1", { task: "Prepare the demo", startDate: isoDay(0), endDate: isoDay(0), responsible: ["Ana"] })]);
  await page.goto(`/plan?view=day&date=${isoDay(0)}`);
  await page.getByRole("region", { name: "Tasks" }).getByRole("link", { name: "Prepare the demo" }).click();
  await expect(page).toHaveURL(/\/plan\?.*task=t1/);
  await waitUntilLive(page);
  await sheet(page).getByLabel("Key points").fill("Use the new deck");
  await sheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.keyPoints).toBe("Use the new deck");
  const fields = await readFields("tasks", "tasks/t1");
  expect(fields).not.toHaveProperty("id");
  expect(fields).toMatchObject({ responsible: ["Ana"], endDate: isoDay(0) });
});

test("W7: clearing a task's type removes it from the stored task", async ({ page }) => {
  await seedTasks([task("t1", { task: "Draft the agenda", taskType: "Follow Up" })]);
  await page.goto("/tasks?task=t1");
  await waitUntilLive(page);
  await expect(sheet(page).getByLabel("Task type")).toHaveValue("Follow Up");
  await sheet(page).getByLabel("Task type").selectOption("");
  await sheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => readFields("tasks", "tasks/t1")).not.toHaveProperty("taskType");
});

test("Q7: the app opens on empty data without adding sample data", async ({ page }) => {
  await page.goto("/");
  await waitUntilLive(page);
  await expect(page.getByRole("region", { name: "Today at a glance" }).getByRole("heading", { level: 2 })).toHaveText("Nothing on the list yet");
  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "No companies yet" })).toBeVisible();
  await page.goto("/flows");
  await waitUntilLive(page);
  await page.waitForTimeout(1500); // the old app added its samples as soon as it saw nothing
  expect(await stored("tasks", "tasks")).toEqual([]);
  expect(await stored("tasks", "flows")).toEqual([]);
  expect(await stored("clients", "pipeline")).toEqual([]);
});

test("5.1: deadline pills name the date and count whole days from today, wherever the team is", async ({ page }) => {
  await seedTasks([
    task("late", { task: "Chase the invoice", endDate: isoDay(-2) }),
    task("today", { task: "Send the quote", endDate: isoDay(0) }),
    task("tomorrow", { task: "Book the room", endDate: isoDay(1) }),
    task("later", { task: "Plan the offsite", endDate: isoDay(12) }),
  ]);
  await page.goto("/tasks");
  const pill = (title: string) => rows(page).filter({ hasText: title });
  // The cell shows the date in the pill and the word under it; its name says both (N31). Another year's date has no weekday.
  const date = (iso: string) => (iso.slice(0, 4) === isoDay(0).slice(0, 4) ? weekdayDate(iso) : shortDate(iso));
  const cell = (title: string, words: string) => pill(title).getByRole("button", { name: `Deadline: ${words}. Change` });
  await expect(cell("Chase the invoice", `${date(isoDay(-2))} · 2 days late`)).toBeVisible();
  await expect(cell("Send the quote", `${date(isoDay(0))} · Today`)).toBeVisible();
  await expect(cell("Book the room", `${date(isoDay(1))} · Tomorrow`)).toBeVisible();
  await expect(cell("Plan the offsite", date(isoDay(12)))).toBeVisible();
  await expect(pill("Plan the offsite")).not.toContainText("In 12 days");
});
