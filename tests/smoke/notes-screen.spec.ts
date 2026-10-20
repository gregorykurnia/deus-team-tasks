// Qualification notes (task 3.11, guide 6.6, 5.3, 5.8): starting notes from a company, writing that saves itself (and
// keeps writing with no connection), a colleague's change that never replaces what's being typed, likelihood, search,
// new notes for someone not tracked yet and linking them, delete and export. Each checks the stored data as well as the
// screen.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, seedCompanies, storedById } from "./data";
import { seed } from "../support/emulator";

const EMPTY = {
  clientNeed: "",
  currentSituation: "",
  painAndBusinessImpact: "",
  solutionFit: "",
  urgencyAndTiming: "",
  stakeholdersAndDecisionProcess: "",
  commercialReadiness: "",
  nextStepAndOwnership: "",
  potentialBlockersAnalysis: "",
  opportunityStatus: "",
  detailedRemarks: "",
};

function notes(id: string, fields: Record<string, unknown> = {}) {
  return { id, prospectName: `Prospect ${id}`, updatedAt: Date.now() - 86_400_000, ...EMPTY, ...fields };
}
const seedNotes = (docs: ReturnType<typeof notes>[]) => seed("clients", "prospectJournal", docs, { keepIdField: true });
const storedNotes = (id: string) => storedById("clients", "prospectJournal", id);
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const doc = (page: Page) => page.locator("article").filter({ has: page.getByRole("radiogroup", { name: "How likely is this opportunity?" }) });
const heading = (page: Page, label: string) => doc(page).getByRole("textbox", { name: label, exact: true });

async function seedAll() {
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "To Follow Up" }),
    company(2, { company: "Borneo Retail", status: "Meeting Soon" }),
  ]);
  await seedNotes([
    notes("pipeline-2", { pipelineEntryId: 2, prospectName: "Borneo Retail", clientNeed: "A single view of stock", nextStepAndOwnership: "Send the budget outline (Rina)", opportunityStatus: "High" }),
    notes("walk-in", { prospectName: "Walk-in at the fair", painAndBusinessImpact: "Budget is tight this year" }),
  ]);
}

test("U5, U4: notes start from a company, and what's written saves itself and stays after a reload", async ({ page }) => {
  await seedAll();
  await page.goto("/notes?company=1");
  await expect(toasts(page).getByText("Notes started for Pelita Foods")).toBeVisible();
  await expect(page).toHaveURL(/\/notes\/pipeline-1/);
  await expect(doc(page).getByRole("heading", { name: "Pelita Foods" })).toBeVisible();
  await expect(heading(page, "Client need")).toBeFocused();
  await expect(doc(page).getByText("0 of 9 headings written")).toBeVisible();

  await heading(page, "Client need").pressSequentially("Faster month-end close");
  await expect(doc(page).getByText("Saving…")).toBeVisible();
  await expect(doc(page).getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedNotes("pipeline-1"))?.clientNeed).toBe("Faster month-end close");
  await expect(doc(page).getByText("1 of 9 headings written")).toBeVisible();
  expect(await storedNotes("pipeline-1")).toMatchObject({ pipelineEntryId: 1, prospectName: "Pelita Foods" });

  await page.reload();
  await expect(heading(page, "Client need")).toHaveValue("Faster month-end close");
});

test("U5: a company that has notes opens them", async ({ page }) => {
  await seedAll();
  await page.goto("/notes?company=2");
  await expect(page).toHaveURL(/\/notes\/pipeline-2/);
  await expect(heading(page, "Client need")).toHaveValue("A single view of stock");
});

test("U4: leaving a field saves at once", async ({ page }) => {
  await seedAll();
  await page.goto("/notes/walk-in");
  await heading(page, "Solution fit").fill("Our planning module");
  await heading(page, "Current situation").focus();
  await expect.poll(async () => (await storedNotes("walk-in"))?.solutionFit, { timeout: 2_000 }).toBe("Our planning module");
});

test("D-014: with no connection writing carries on, is kept on the device, and saves once back online", async ({ page, context }) => {
  await seedAll();
  await page.goto("/notes/walk-in");
  await expect(heading(page, "Client need")).toBeVisible();
  await expect(doc(page).getByText("Saved", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(doc(page).getByText("Kept on this device. Saves when you’re back online.")).toBeVisible();
  await expect(doc(page).getByText("Keep writing: what you type stays on this device")).toBeVisible();
  await heading(page, "Client need").fill("Written with no signal");
  await heading(page, "Solution fit").focus();
  await expect(heading(page, "Client need")).toHaveValue("Written with no signal");
  expect((await storedNotes("walk-in"))?.clientNeed).toBe("");
  await context.setOffline(false);
  await expect.poll(async () => (await storedNotes("walk-in"))?.clientNeed, { timeout: 30_000 }).toBe("Written with no signal");
  await expect(doc(page).getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
});

test("A1, 5.8: a colleague's change to the heading being written never replaces the text, and says so", async ({ page }) => {
  await seedAll();
  await page.goto("/notes/walk-in");
  const box = heading(page, "Next step and ownership");
  await box.fill("My own next step");
  // A colleague writes in the same heading and in another one.
  await seedNotes([notes("walk-in", { prospectName: "Walk-in at the fair", painAndBusinessImpact: "Budget is tight this year", nextStepAndOwnership: "Their next step", solutionFit: "Their fit" })]);
  await expect(doc(page).getByText("Changed just now").first()).toBeVisible();
  await expect(box).toHaveValue("My own next step");
  await expect(heading(page, "Solution fit")).toHaveValue("Their fit");
  await heading(page, "Solution fit").focus();
  await expect.poll(async () => (await storedNotes("walk-in"))?.nextStepAndOwnership).toBe("My own next step");
});

test("U2, U7: likelihood is picked and cleared; How likely and search narrow the list", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/notes/walk-in");
  await doc(page).getByRole("radio", { name: "Medium" }).click();
  await expect.poll(async () => (await storedNotes("walk-in"))?.opportunityStatus).toBe("Medium");
  await expect(doc(page).getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
  await doc(page).getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(async () => (await storedNotes("walk-in"))?.opportunityStatus).toBe("");

  await page.goto("/notes");
  if (!isMobile) await expect(page).toHaveURL(/\/notes\/pipeline-2|\/notes\/walk-in/);
  const list = page.getByRole("region", { name: "Prospects" });
  await page.getByRole("group", { name: "Show one likelihood" }).getByRole("button", { name: /^High/ }).click();
  await expect(list.getByText("of 2 prospects")).toBeVisible();
  await expect(list.getByRole("link", { name: /Borneo Retail/ })).toBeVisible();
  await expect(list.getByRole("link", { name: /Walk-in/ })).toHaveCount(0);
  await list.getByRole("button", { name: "Clear", exact: true }).click();

  await page.getByRole("searchbox", { name: "Search all notes" }).fill("budget");
  await expect(list.getByText("2 of 2 prospects mention “budget”")).toBeVisible();
  await expect(list.getByRole("link", { name: /Walk-in/ }).getByText("Pain and business impact")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search all notes" }).fill("nothing like this");
  await expect(list.getByText("No notes mention “nothing like this”")).toBeVisible();
});

test("U6: new notes for someone not tracked yet need a name, then link to a tracked company with Undo", async ({ page }) => {
  await seedAll();
  await page.goto("/notes?newNotes=1");
  const dialog = page.getByRole("dialog", { name: "New qualification notes" });
  await dialog.getByRole("button", { name: "Not tracked yet" }).click();
  await dialog.getByRole("button", { name: "Start notes" }).click();
  await expect(dialog.getByText("Give the prospect a name so the team can find these notes.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Prospect name" }).fill("Nusa Agro");
  await dialog.getByRole("button", { name: "Start notes" }).click();
  await expect(dialog).toBeHidden();
  await expect(heading(page, "Client need")).toBeFocused();
  await expect(doc(page).getByRole("textbox", { name: "Prospect name" })).toHaveValue("Nusa Agro");
  const id = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
  expect(await storedNotes(id)).toMatchObject({ prospectName: "Nusa Agro" });

  await doc(page).getByRole("button", { name: "Link to a tracked company" }).click();
  const menu = page.getByRole("menu", { name: "Link to a tracked company" });
  await expect(menu.getByRole("menuitem", { name: /Borneo Retail.*Has notes/ })).toBeDisabled();
  await menu.getByRole("textbox", { name: "Search companies" }).fill("pelita");
  await menu.getByRole("menuitem", { name: /Pelita Foods/ }).click();
  await expect(toasts(page).getByText("Linked to Pelita Foods. The notes now open from the company too.")).toBeVisible();
  await expect.poll(async () => (await storedNotes(id))?.pipelineEntryId).toBe(1);
  await expect(doc(page).getByRole("heading", { name: "Pelita Foods" })).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await storedNotes(id))?.pipelineEntryId).toBeUndefined();
  await expect(doc(page).getByRole("textbox", { name: "Prospect name" })).toHaveValue("Nusa Agro");
});

test("U8: deleting asks first, says what goes, and the company stays", async ({ page }) => {
  await seedAll();
  await page.goto("/notes/pipeline-2");
  await doc(page).getByRole("button", { name: "More for these notes" }).click();
  await page.getByRole("menuitem", { name: "Delete these notes" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete the notes for Borneo Retail?" });
  await expect(confirm.getByText("All nine headings and the remarks go, for everyone on the team. The company itself stays.")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete notes" }).click();
  await expect(toasts(page).getByText("Notes for Borneo Retail deleted")).toBeVisible();
  await expect.poll(() => storedNotes("pipeline-2")).toBeUndefined();
  expect(await storedById("clients", "pipeline", 2)).toBeTruthy();
});

test("E1: export says what's in the file, then downloads it", async ({ page }) => {
  await seedAll();
  await page.goto("/notes/walk-in");
  if ((page.viewportSize()?.width ?? 0) <= 900) await doc(page).getByRole("button", { name: "All notes" }).click();
  await page.getByRole("region", { name: "Prospects" }).getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export qualification notes" });
  await expect(dialog.getByText("2 prospects")).toBeVisible();
  await expect(dialog.getByText("Pain and business impact")).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/^qualification-notes-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("N10: notes that are gone say so and the list shows", async ({ page }) => {
  await seedAll();
  await page.goto("/notes/no-such-notes");
  await expect(toasts(page).getByText("These notes aren’t there any more. Someone may have deleted them.")).toBeVisible();
  await expect(page).not.toHaveURL(/no-such-notes/);
});
