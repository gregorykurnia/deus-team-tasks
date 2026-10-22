// Changing companies (task 3.9, guide 6.5, 4.9, 5.3, 5.4, 5.10): quick edits from the list with Undo, Deal done through the
// status, the row menu, the record, new company with its name required, moving with what's carried over, the follow-up
// task (and Try again), and deleting with what stays. Each checks the stored data as well as the screen.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, settledOnline, storedById, stored, task } from "./data";

const row = (page: Page, name: string) => page.getByRole("article", { name });
const cell = (page: Page, name: string, label: RegExp) => row(page, name).getByRole("button", { name: label });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const tile = (page: Page, name: string) => page.getByRole("group", { name: "Groups of companies" }).getByRole("button", { name: new RegExp(`^${name}\\s*\\d`) }); // the count follows the name: Active isn't Active clients and partners
const rowMenu = (page: Page, name: string) => page.getByRole("button", { name: `More for ${name}` });

async function seedAll() {
  await seedCompanies([
    company(1, { company: "Pelita Foods", pic: "Rina", status: "To Follow Up", priority: "High", date: isoDay(-20), target: isoDay(-2), notes: "Send the quote" }),
    company(2, { company: "Borneo Retail", status: "Meeting Soon", date: isoDay(-1), target: isoDay(10) }),
    company(5, { company: "Lumen Hotels", _raw: true, status: "", priority: "Medium", type: "Client", industry: "Hospitality", reach: isoDay(3) }),
  ]);
  await seedTasks([task("t1", { task: "Call Rina about the quote", linkedClientId: 1, endDate: isoDay(-2), startDate: isoDay(-5), lastActionDate: isoDay(-20) })]);
}

test("B10: a choice is changed from the list, saves itself, and Undo puts it back", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await cell(page, "Pelita Foods", /^Status: To Follow Up\. Change/).click();
  await page.getByRole("menu", { name: "Status" }).getByRole("menuitemradio", { name: "Meeting Soon" }).click();
  await expect(toasts(page).getByText("Status updated")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.status).toBe("Meeting Soon");
  await expect(cell(page, "Pelita Foods", /^Status: Meeting Soon/)).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.status).toBe("To Follow Up");
});

test("B10, B12: a quick date pick saves, and the company's open tasks keep their own dates", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await cell(page, "Pelita Foods", /^Target date:/).click();
  const menu = page.getByRole("dialog", { name: "Target date" });
  await menu.getByRole("button", { name: "In a week" }).click();
  await expect(toasts(page).getByText("Target date updated", { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.target).toBe(isoDay(7));
  expect(await storedById("tasks", "tasks", "t1")).toMatchObject({ endDate: isoDay(-2), startDate: isoDay(-5) });
});

test("B10: text is changed in place: Enter saves, and Clear empties it", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await cell(page, "Pelita Foods", /^Next actions: Send the quote/).click();
  const box = page.getByRole("dialog", { name: "Next actions" }).getByRole("textbox", { name: "Next actions" });
  await expect(box).toBeFocused();
  await box.fill("Send the revised quote");
  await box.press("Control+Enter");
  await expect(toasts(page).getByText("Next actions updated")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.notes).toBe("Send the revised quote");

  await cell(page, "Pelita Foods", /^Next actions: Send the revised quote/).click();
  await page.getByRole("dialog", { name: "Next actions" }).getByRole("button", { name: "Clear" }).click();
  await expect(toasts(page).getByText("Next actions cleared")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.notes).toBeUndefined();
});

test("5.10: choosing Deal done as the status moves the company to Active clients and partners, with Undo", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await cell(page, "Pelita Foods", /^Status:/).click();
  const menu = page.getByRole("menu", { name: "Status" });
  await expect(menu.getByText("Moves it to Active clients and partners")).toBeVisible();
  await menu.getByRole("menuitemradio", { name: /Client \/ Partner Done Deal/ }).click();
  await expect(toasts(page).getByText("Deal done. Pelita Foods moved to Active clients and partners. Its 1 open task now counts as client work.")).toBeVisible();
  await expect(row(page, "Pelita Foods")).toHaveCount(0); // it left Active
  await expect(tile(page, "Active clients and partners")).toContainText("1");
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.status).toBe("To Follow Up");
});

test("B1, 5.5: a new company needs only its name, and goes in the group chosen", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await expect(row(page, "Pelita Foods")).toBeVisible();
  await page.getByRole("link", { name: "New company" }).click();
  const sheet = page.getByRole("dialog", { name: "New company" });
  await sheet.getByRole("button", { name: "Add company" }).click();
  await expect(sheet.getByText("Add the company’s name. It’s the only thing needed.")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Company name" })).toBeFocused();
  await sheet.getByRole("textbox", { name: "Company name" }).fill("Kasih Pharmacy");
  await expect(sheet.getByText("Add the company’s name.")).toHaveCount(0); // the error clears once it's fixed
  await sheet.getByRole("radio", { name: /To approach/ }).click();
  await sheet.getByRole("textbox", { name: /Industry/ }).fill("Health");
  await sheet.getByRole("button", { name: "Add company" }).click();
  await expect(toasts(page).getByText("Kasih Pharmacy added to To approach")).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await expect(tile(page, "To approach")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "Kasih Pharmacy")).toBeVisible();
  const added = (await stored("clients", "pipeline")).find((c) => c.company === "Kasih Pharmacy");
  expect(added).toMatchObject({ _raw: true, _hold: false, industry: "Health" });
  expect(Number(added!.id)).toBeGreaterThan(5); // never an id already used

  await toasts(page).getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("dialog", { name: "Kasih Pharmacy" })).toBeVisible();
});

test("B5, 5.10: moving carries over what's known and asks for what the new group needs", async ({ page }) => {
  await seedAll();
  await page.goto("/companies?group=to-approach");
  await rowMenu(page, "Lumen Hotels").click();
  await page.getByRole("menuitem", { name: "Move to another group" }).click();
  const dialog = page.getByRole("dialog", { name: "Move Lumen Hotels" });
  await expect(dialog.getByRole("radio", { name: /^Active Prospects/ })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByText("Carried over")).toBeVisible();
  await expect(dialog.getByText("Hospitality")).toBeVisible();
  await expect(dialog.getByText("What Active needs")).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: /Status/ })).toHaveValue("Meeting Soon");
  await dialog.getByRole("textbox", { name: /Next actions/ }).fill("Book a site visit");
  await dialog.getByRole("button", { name: "Move to Active" }).click();
  await expect(toasts(page).getByText("Lumen Hotels moved to Active.")).toBeVisible();
  expect(await storedById("clients", "pipeline", 5)).toMatchObject({
    _raw: false,
    _hold: false,
    status: "Meeting Soon",
    date: isoDay(0),
    notes: "Book a site visit",
    industry: "Hospitality",
  });

  // Choosing No or not now asks for its answer and reason instead.
  await tile(page, "Active").click();
  await rowMenu(page, "Borneo Retail").click();
  await page.getByRole("menuitem", { name: "Move to another group" }).click();
  const hold = page.getByRole("dialog", { name: "Move Borneo Retail" });
  await hold.getByRole("radio", { name: /No or not now/ }).click();
  await expect(hold.getByRole("combobox", { name: /Answer/ })).toHaveValue("Not now");
  await expect(hold.getByRole("textbox", { name: /Reason/ })).toBeVisible();
  await hold.getByRole("button", { name: "Cancel" }).click();
  expect((await storedById("clients", "pipeline", 2))?._hold).toBeFalsy();
});

test("B11: the row menu creates a follow-up task, and Open goes to it", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await rowMenu(page, "Borneo Retail").click();
  await page.getByRole("menuitem", { name: "Create a follow-up task" }).click();
  await expect(toasts(page).getByText("Follow-up task created for Borneo Retail")).toBeVisible();
  const made = (await stored("tasks", "tasks")).find((t) => t.task === "Follow up with Borneo Retail");
  expect(made).toMatchObject({ linkedClientId: 2, endDate: isoDay(10), lastActionDate: isoDay(-1) });
  await toasts(page).getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`task=${made!.id}`));
});

test("B11, 5.8: a follow-up task that can't be created says so, and Try again makes it", async ({ page, context }) => {
  await seedAll();
  await page.goto("/companies");
  await expect(row(page, "Borneo Retail")).toBeVisible();
  await context.setOffline(true);
  await rowMenu(page, "Borneo Retail").click();
  await page.getByRole("menuitem", { name: "Create a follow-up task" }).click();
  await expect(toasts(page).getByText("Couldn’t create the follow-up task. Check your connection and try again.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("status").getByText(/Back online/)).toBeVisible();
  await settledOnline(page);
  await toasts(page).getByRole("button", { name: "Try again" }).click();
  await expect(toasts(page).getByText("Follow-up task created for Borneo Retail")).toBeVisible();
  expect((await stored("tasks", "tasks")).filter((t) => t.task === "Follow up with Borneo Retail")).toHaveLength(1);
});

test("B14, 5.4: deleting asks first and says what stays; the tasks become internal", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await rowMenu(page, "Pelita Foods").click();
  await page.getByRole("menuitem", { name: "Delete company" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this company?" });
  await expect(confirm.getByText("Its 1 task stays, as internal work.")).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete company" }).click();
  await expect(toasts(page).getByText("Pelita Foods deleted")).toBeVisible();
  await expect(row(page, "Pelita Foods")).toHaveCount(0);
  await expect.poll(async () => await storedById("clients", "pipeline", 1)).toBeUndefined();
  expect((await storedById("tasks", "tasks", "t1"))?.linkedClientId).toBeUndefined();
});

test("B1, B10, B12: the record shows what's urgent, edits in place, and lists its tasks, which keep their own dates", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await row(page, "Pelita Foods").getByRole("link", { name: "Pelita Foods" }).click();
  const record = page.getByRole("dialog", { name: "Pelita Foods" });
  await expect(page).toHaveURL(/company=1/);
  await expect(record.getByText("Gone cold.")).toBeVisible();
  await expect(record.getByText("Target date missed 2 days ago.")).toBeVisible();
  await expect(record.getByText("Rina", { exact: true }).first()).toBeVisible(); // the contact, under the name
  await expect(record.getByText("Changes save as you make them, for everyone.")).toBeVisible();
  await expect(record.getByText(/The task keeps its own dates/)).toBeVisible();
  await expect(record.getByRole("link", { name: "Call Rina about the quote" })).toBeVisible();
  await expect(record.getByRole("button", { name: "Save" })).toHaveCount(0); // no Save anywhere

  await record.getByRole("button", { name: /^Priority: High\. Change/ }).click();
  await page.getByRole("menu", { name: "Priority" }).getByRole("menuitemradio", { name: "Low" }).click();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.priority).toBe("Low");
  await expect(record.getByRole("button", { name: /^Priority: Low\. Change/ })).toBeVisible();

  await record.getByRole("button", { name: "Last action: today" }).click();
  await expect(toasts(page).getByText("Last action updated", { exact: true })).toBeVisible();
  expect(await storedById("tasks", "tasks", "t1")).toMatchObject({ lastActionDate: isoDay(-20) });
  await expect(record.getByText("Gone cold.")).toHaveCount(0);

  // Rename, from ⋯: the name is required.
  await record.getByRole("button", { name: "More for Pelita Foods" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = page.getByRole("dialog", { name: "Company name" }).getByRole("textbox", { name: "Company name" });
  await name.fill(" ");
  await name.press("Enter");
  await expect(page.getByText("A company needs a name.")).toBeVisible();
  await name.fill("Pelita Foods Group");
  await name.press("Enter");
  await expect(toasts(page).getByText("Company renamed")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Pelita Foods Group" })).toBeVisible();

  await page.getByRole("dialog", { name: "Pelita Foods Group" }).getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/company=/);
});

test("B13: a link to a company opens its record on its own group's list, and a missing one says so", async ({ page }) => {
  await seedAll();
  await page.goto("/companies?company=5");
  await expect(page.getByRole("dialog", { name: "Lumen Hotels" })).toBeVisible();
  await expect(tile(page, "To approach")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog", { name: "Lumen Hotels" }).getByText(/Outreach was planned/)).toHaveCount(0); // still ahead

  await page.goto("/companies?company=404");
  await expect(toasts(page).getByText("This company isn't there any more. Someone may have deleted it.")).toBeVisible();
  await expect(page).not.toHaveURL(/company=/);
});

test("5.8: offline, the record can be read but a change is refused with what wasn't saved", async ({ page, context }) => {
  await seedAll();
  await page.goto("/companies?company=2");
  const record = page.getByRole("dialog", { name: "Borneo Retail" });
  await expect(record).toBeVisible();
  await context.setOffline(true);
  await expect(record.getByText("Offline. Changes can’t be saved.")).toBeVisible();
  await record.getByRole("button", { name: /^Status: Meeting Soon\. Change/ }).click();
  await page.getByRole("menu", { name: "Status" }).getByRole("menuitemradio", { name: "Drop" }).click();
  await expect(toasts(page).getByText("No connection. The change wasn't saved.")).toBeVisible();
  await context.setOffline(false);
  expect((await storedById("clients", "pipeline", 2))?.status).toBe("Meeting Soon");
});

test("4.9, 5.8: offline, a quick editor keeps what was typed, and Delete company says it needs a connection", async ({ page, context }) => {
  await seedAll();
  await page.goto("/companies?company=2");
  const record = page.getByRole("dialog", { name: "Borneo Retail" });
  await expect(record).toBeVisible();
  await context.setOffline(true);
  await expect(record.getByText("Offline. Changes can’t be saved.")).toBeVisible();
  await record.getByRole("button", { name: "Products: empty. Add" }).click();
  const editor = page.getByRole("dialog", { name: "Products" });
  await editor.getByRole("textbox", { name: "Products" }).fill("Point of sale");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page).getByText("No connection. The change wasn't saved.")).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Products" })).toHaveValue("Point of sale"); // still open
  await editor.getByRole("button", { name: "Cancel" }).click();
  await record.getByRole("button", { name: "More for Borneo Retail" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete company" })).toBeDisabled();
  await expect(page.getByText("Deleting needs a connection.")).toBeVisible();
  await context.setOffline(false);
  expect((await storedById("clients", "pipeline", 2))?.product).toBeUndefined();
});
