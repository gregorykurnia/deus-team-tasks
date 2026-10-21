// Companies (the 1.3 job stories, on the new UI since 4.3): a company added in each group with what that group asks for,
// found by its contact person, a change in its record that keeps the company's own fields, ids never reused, and the delete
// cascade (tasks become internal, notes become not tracked yet, R1). The other 1.3 stories are guarded in
// companies-editing.spec (a cell changed in place, moving, the follow-up task, the last action reaching the tasks,
// delete) and task-sheet.spec (a task's dates reaching its company, the task's link to its company).
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, storedById, stored, task } from "./data";
import { seed } from "../support/emulator";

const waitUntilLive = (page: Page) => expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
const row = (page: Page, name: string) => page.getByRole("article", { name });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const newSheet = (page: Page) => page.getByRole("dialog", { name: "New company" });
const storedCompany = async (name: string) => (await stored("clients", "pipeline")).find((c) => c.company === name);

async function deleteFromRow(page: Page, name: string) {
  await page.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Delete company" }).click();
  await page.getByRole("alertdialog", { name: "Delete this company?" }).getByRole("button", { name: "Delete company" }).click();
  await expect(toasts(page).getByText(`${name} deleted`)).toBeVisible();
}

test("B1 to B4: a company is added in each group with what that group asks for", async ({ page }) => {
  await page.goto("/companies?newCompany=1");
  await waitUntilLive(page);
  const sheet = newSheet(page);

  // Active, the group Companies opens on: status, priority and the contact person.
  await sheet.getByRole("textbox", { name: "Company name" }).fill("Pelita Foods");
  await sheet.getByRole("combobox", { name: /^Status/ }).selectOption("To Follow Up");
  await sheet.getByRole("combobox", { name: /^Priority/ }).selectOption("High");
  await sheet.getByRole("textbox", { name: /^Contact person/ }).fill("Dewi");
  await sheet.getByRole("button", { name: "Add company" }).click();
  await expect(toasts(page).getByText("Pelita Foods added to Active")).toBeVisible();
  expect(await storedCompany("Pelita Foods")).toMatchObject({ pic: "Dewi", status: "To Follow Up", priority: "High", _raw: false, _hold: false });

  // Deal done: the status says so.
  await page.goto("/companies?newCompany=1");
  await sheet.getByRole("textbox", { name: "Company name" }).fill("Arunika Labs");
  await sheet.getByRole("radio", { name: /Deal done/ }).click();
  await sheet.getByRole("button", { name: "Add company" }).click();
  await expect(toasts(page).getByText("Arunika Labs added to Deal done")).toBeVisible();
  expect(await storedCompany("Arunika Labs")).toMatchObject({ status: "Client / Partner Done Deal", _raw: false, _hold: false });

  // To approach: when outreach is planned.
  await page.goto("/companies?newCompany=1");
  await sheet.getByRole("textbox", { name: "Company name" }).fill("Sinar Retail");
  await sheet.getByRole("radio", { name: /To approach/ }).click();
  await sheet.getByLabel(/^Planned outreach/).fill(isoDay(5));
  await sheet.getByRole("button", { name: "Add company" }).click();
  await expect(toasts(page).getByText("Sinar Retail added to To approach")).toBeVisible();
  expect(await storedCompany("Sinar Retail")).toMatchObject({ reach: isoDay(5), _raw: true, _hold: false });

  // No or not now: the answer and the reason.
  await page.goto("/companies?newCompany=1");
  await sheet.getByRole("textbox", { name: "Company name" }).fill("Kopi Nusantara");
  await sheet.getByRole("radio", { name: /No or not now/ }).click();
  await sheet.getByRole("combobox", { name: /^Answer/ }).selectOption("Not now");
  await sheet.getByRole("textbox", { name: /^Reason/ }).fill("Budget frozen until next year");
  await sheet.getByRole("button", { name: "Add company" }).click();
  await expect(toasts(page).getByText("Kopi Nusantara added to No or not now")).toBeVisible();
  await expect(row(page, "Kopi Nusantara")).toBeVisible();
  expect(await storedCompany("Kopi Nusantara")).toMatchObject({ answer: "Not now", reason: "Budget frozen until next year", _raw: false, _hold: true });
});

test("B8: a company is found by its contact person", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", pic: "Dewi" }), company(2, { company: "Arunika Labs", pic: "Bayu" })]);
  await page.goto("/companies");
  await expect(page.getByRole("article")).toHaveCount(2); // typing before the page is ready would be lost
  await page.getByRole("searchbox", { name: "Search companies" }).fill("bayu");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(row(page, "Arunika Labs")).toBeVisible();
});

test("B10, C1: a change in the record keeps the values of the company's own fields", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", cx_region: "North" })]);
  await page.goto("/companies?company=1");
  await waitUntilLive(page);
  await page.getByRole("dialog", { name: "Pelita Foods" }).getByRole("button", { name: "Products: empty. Change" }).click();
  const box = page.getByRole("menu", { name: "Products" }).getByRole("textbox", { name: "Products" });
  await box.fill("Fleet tracking");
  await box.press("Enter");
  await expect(toasts(page).getByText("Products updated")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.product).toBe("Fleet tracking");
  expect(await storedById("clients", "pipeline", 1)).toMatchObject({ cx_region: "North", company: "Pelita Foods" });
});

test("B1, B14: a new company never takes a deleted company's id", async ({ page }) => {
  await seedCompanies([company(949, { company: "Pelita Foods" }), company(950, { company: "Gone Corp" })]);
  await page.goto("/companies");
  await waitUntilLive(page);
  await deleteFromRow(page, "Gone Corp");
  await expect.poll(() => storedById("clients", "pipeline", 950)).toBeUndefined();

  await page.getByRole("link", { name: "New company" }).first().click();
  await newSheet(page).getByRole("textbox", { name: "Company name" }).fill("Fresh Start");
  await newSheet(page).getByRole("button", { name: "Add company" }).click();
  await expect(toasts(page).getByText("Fresh Start added to Active")).toBeVisible();
  const added = await storedCompany("Fresh Start");
  expect(Number(added?.id)).toBeGreaterThan(950);
});

test("B14, D-012: deleting a company turns its tasks into internal work and its notes into notes not tracked yet", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", status: "To Follow Up" }), company(2, { company: "Borneo Retail" })]);
  await seedTasks([
    task("t1", { task: "Call Pelita about the trial", linkedClientId: 1, endDate: isoDay(3) }),
    task("t2", { task: "Send Pelita the quote", linkedClientId: 1, completed: true }),
    task("t3", { task: "Visit Borneo", linkedClientId: 2 }),
  ]);
  await seed("clients", "prospectJournal", [{ id: "pipeline-1", pipelineEntryId: 1, prospectName: "Pelita Foods", clientNeed: "Fleet visibility", updatedAt: 1 }], { keepIdField: true });
  await page.goto("/companies");
  await waitUntilLive(page);
  await page.getByRole("button", { name: "More for Pelita Foods" }).click();
  await page.getByRole("menuitem", { name: "Delete company" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this company?" });
  await expect(confirm.getByText("Its 2 tasks (1 open) stay, as internal work. Its qualification notes stay too, without a company.", { exact: false })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete company" }).click();
  await expect(toasts(page).getByText("Pelita Foods deleted")).toBeVisible();

  await expect.poll(() => storedById("clients", "pipeline", 1)).toBeUndefined();
  expect((await storedById("tasks", "tasks", "t1"))?.linkedClientId).toBeUndefined();
  expect((await storedById("tasks", "tasks", "t2"))?.linkedClientId).toBeUndefined();
  expect((await storedById("tasks", "tasks", "t3"))?.linkedClientId).toBe(2);
  const notes = await storedById("clients", "prospectJournal", "pipeline-1");
  expect(notes).toMatchObject({ prospectName: "Pelita Foods", clientNeed: "Fleet visibility" });
  expect(notes?.pipelineEntryId).toBeUndefined();

  // The screens agree: the task is internal work, and the notes are listed as not tracked yet.
  await page.goto("/tasks?kind=internal");
  await expect(page.getByRole("article").filter({ hasText: "Call Pelita about the trial" })).toHaveCount(1);
  await page.goto("/notes/pipeline-1");
  await expect(page.getByText("Not tracked yet").filter({ visible: true }).first()).toBeVisible();
});
