// Companies on the old UI: add in each group, edit a cell, move, follow-up task,
// kept in step with tasks, delete.
import { test, expect } from "./fixtures";
import { acceptDialogs, company, isoDay, seedBaseline, seedCompanies, seedTasks, stored, storedById, task } from "./data";
import { OLD_UI, cell, companyTab, dialog, field, openArea, panel, taskModal } from "./old-ui";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

test.beforeEach(async () => {
  await seedBaseline();
});

async function openCompanies(page: import("@playwright/test").Page) {
  await page.goto(OLD_UI);
  await openArea(page, "Client Pipeline", "Clients");
  await expect(page.getByText("Client Pipeline", { exact: true }).last()).toBeVisible();
}

const companyRow = (page: import("@playwright/test").Page, name: string) => page.locator("tbody tr").filter({ hasText: name });

async function storedCompany(name: string) {
  return (await stored("clients", "pipeline")).find((c) => c.company === name);
}

test("B1 B2: add an active company", async ({ page }) => {
  await openCompanies(page);
  await page.getByRole("button", { name: "+ Add prospect" }).click();
  const modal = dialog(page, "Add prospect");
  await field(modal, "Company name").fill("Pelita Foods");
  await field(modal, "Company PIC").fill("Dewi");
  await field(modal, "Status").selectOption("To Follow Up");
  await field(modal, "Priority").selectOption("High");
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect(companyRow(page, "Pelita Foods")).toBeVisible();
  await expect
    .poll(() => storedCompany("Pelita Foods"))
    .toMatchObject({ pic: "Dewi", status: "To Follow Up", priority: "High", _raw: false, _hold: false });
});

test("B1 B2: add a company whose deal is done", async ({ page }) => {
  await openCompanies(page);
  await page.getByRole("button", { name: "+ Add prospect" }).click();
  const modal = dialog(page, "Add prospect");
  await field(modal, "Company name").fill("Arunika Labs");
  await field(modal, "Status").selectOption("Client / Partner Done Deal");
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect(companyRow(page, "Arunika Labs")).toHaveCount(0);
  await companyTab(page, "Clients & Partners").click();
  await expect(companyRow(page, "Arunika Labs")).toBeVisible();
  await expect.poll(() => storedCompany("Arunika Labs")).toMatchObject({ status: "Client / Partner Done Deal" });
});

test("B3: add a company not contacted yet", async ({ page }) => {
  await openCompanies(page);
  await companyTab(page, "Raw List").click();
  await page.getByRole("button", { name: "+ Add to raw list" }).click();
  const modal = dialog(page, "Add to raw list");
  await field(modal, "Company name").fill("Sinar Retail");
  await field(modal, "Planned reach out date").fill(isoDay(5));
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect(companyRow(page, "Sinar Retail")).toBeVisible();
  await expect.poll(() => storedCompany("Sinar Retail")).toMatchObject({ reach: isoDay(5), _raw: true, _hold: false });
});

test("B4: add a company that said no or not now", async ({ page }) => {
  await openCompanies(page);
  await companyTab(page, "Hold or Reject").click();
  await page.getByRole("button", { name: "+ Add to hold / reject" }).click();
  const modal = dialog(page, "Add to Hold / Reject");
  await field(modal, "Company name").fill("Kopi Nusantara");
  await field(modal, "Reason for Rejection / Hold").fill("Budget frozen until next year");
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect(companyRow(page, "Kopi Nusantara")).toBeVisible();
  await expect
    .poll(() => storedCompany("Kopi Nusantara"))
    .toMatchObject({ reason: "Budget frozen until next year", _raw: false, _hold: true });
});

test("B10: change one detail of a company in place", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", pic: "Dewi", date: isoDay(-3) })]);
  await openCompanies(page);
  await (await cell(page, "Pelita Foods", "PIC")).click();
  const editor = panel(page, "PIC");
  await editor.locator("input").fill("Dewi Lestari");
  await editor.locator("input").press("Enter");

  await expect(await cell(page, "Pelita Foods", "PIC")).toHaveText("Dewi Lestari");
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.pic).toBe("Dewi Lestari");

  await (await cell(page, "Pelita Foods", "Priority")).getByRole("button").click();
  await panel(page, "Priority").getByRole("button", { name: "High" }).click();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.priority).toBe("High");
});

test("B5: move a company to another group, keeping what's known", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", product: "Fleet tracking", date: isoDay(-3) })]);
  await openCompanies(page);
  await companyRow(page, "Pelita Foods").getByTitle("Move to...").click();
  await panel(page, "Move to").getByText("Hold or Reject").click();
  const modal = dialog(page, "Move to Hold / Reject");
  await expect(field(modal, "Product offered")).toHaveValue("Fleet tracking");
  await field(modal, "Reason for Rejection / Hold").fill("Chose another vendor");
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect(companyRow(page, "Pelita Foods")).toHaveCount(0);
  await expect
    .poll(() => storedById("clients", "pipeline", 1))
    .toMatchObject({ company: "Pelita Foods", product: "Fleet tracking", reason: "Chose another vendor", _hold: true });
});

test("B11: create a follow-up task for a company", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", date: isoDay(-3), target: isoDay(2) })]);
  await openCompanies(page);
  await companyRow(page, "Pelita Foods").getByTitle("Follow up (create task)").click();
  const modal = taskModal(page, "New Task");
  await expect(modal.getByPlaceholder("Describe the task…")).toHaveValue("Follow up: Pelita Foods");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(/Follow-up task created for Pelita Foods/)).toBeVisible();
  await expect
    .poll(async () => (await stored("tasks", "tasks")).find((t) => t.linkedClientId === 1))
    .toMatchObject({ task: "Follow up: Pelita Foods", taskType: "Follow Up", endDate: isoDay(2), lastActionDate: isoDay(-3) });
});

test("B12: a company's new last action date reaches its tasks", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", date: isoDay(-9) })]);
  await seedTasks([task("t1", { task: "Call Pelita", linkedClientId: 1, lastActionDate: isoDay(-9) })]);
  await openCompanies(page);
  await (await cell(page, "Pelita Foods", "Last Action")).click();
  const editor = panel(page, "Last Action Date");
  await editor.locator('input[type="date"]').fill(isoDay(0));
  await editor.getByRole("button", { name: "✓ Set" }).click();

  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.date).toBe(isoDay(0));
  await expect.poll(async () => (await storedById("tasks", "tasks", "t1"))?.lastActionDate).toBe(isoDay(0));
});

test("B12: a task's new dates reach its company", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", date: isoDay(-9), target: isoDay(3) })]);
  await seedTasks([
    task("t1", { task: "Call Pelita", linkedClientId: 1, lastActionDate: isoDay(-9), endDate: isoDay(3) }),
  ]);
  await page.goto(OLD_UI);
  await openArea(page, "Prospects");
  await page.getByText("Call Pelita", { exact: true }).click();
  const modal = taskModal(page, "Edit Task");
  await field(modal, "Last action date").fill(isoDay(-1));
  await field(modal, "End date").fill(isoDay(6));
  await modal.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => storedById("clients", "pipeline", 1)).toMatchObject({ date: isoDay(-1), target: isoDay(6) });
});

test("B13: open a company's record from its task", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods" })]);
  await seedTasks([task("t1", { task: "Call Pelita", linkedClientId: 1 })]);
  await page.goto(OLD_UI);
  await openArea(page, "Prospects");
  await page.locator("tbody tr").filter({ hasText: "Call Pelita" }).getByRole("button", { name: /Pelita Foods/ }).click();
  await expect(field(dialog(page, "Edit entry"), "Company name")).toHaveValue("Pelita Foods");
});

test("B8: find a company by its contact person", async ({ page }) => {
  await seedCompanies([
    company(1, { company: "Pelita Foods", pic: "Dewi" }),
    company(2, { company: "Arunika Labs", pic: "Bayu" }),
  ]);
  await openCompanies(page);
  await page.getByPlaceholder("Search company, PIC...").fill("bayu");
  await expect(companyRow(page, "Arunika Labs")).toBeVisible();
  await expect(companyRow(page, "Pelita Foods")).toHaveCount(0);
});

test("B14: delete a company after confirming", async ({ page }) => {
  acceptDialogs(page);
  await seedCompanies([company(1, { company: "Pelita Foods" })]);
  await openCompanies(page);
  await companyRow(page, "Pelita Foods").getByTitle("Delete").click();

  await expect(companyRow(page, "Pelita Foods")).toHaveCount(0);
  await expect.poll(() => storedById("clients", "pipeline", 1)).toBeUndefined();
});

test("B10 C1: editing a company keeps the values of its own fields", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods", cx_region: "North" })]);
  await openCompanies(page);
  await companyRow(page, "Pelita Foods").getByTitle("Edit").click();
  const modal = dialog(page, "Edit entry");
  await field(modal, "Company PIC").fill("Dewi");
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.pic).toBe("Dewi");
  expect((await storedById("clients", "pipeline", 1))?.cx_region).toBe("North");
});

test("B1 B14: a new company never takes a deleted company's id", async ({ page }) => {
  acceptDialogs(page);
  // The baseline company is 900, so 950 is the highest id, and 949 is the next one down.
  await seedCompanies([company(949, { company: "Pelita Foods" }), company(950, { company: "Gone Corp" })]);
  await seedTasks([task("t1", { task: "Old task for Gone Corp", linkedClientId: 950 })]);
  await openCompanies(page);
  await companyRow(page, "Gone Corp").getByTitle("Delete").click();
  await expect.poll(() => storedById("clients", "pipeline", 950)).toBeUndefined();

  await page.getByRole("button", { name: "+ Add prospect" }).click();
  const modal = dialog(page, "Add prospect");
  await field(modal, "Company name").fill("Fresh Start");
  await modal.getByRole("button", { name: "✓ Save entry" }).click();

  await expect.poll(() => storedCompany("Fresh Start")).toBeDefined();
  expect((await storedCompany("Fresh Start"))?.id).not.toBe("950");
});
