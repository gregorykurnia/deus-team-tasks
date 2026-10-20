// Qualification notes on the old UI: start from a company, write, rate, save,
// notes for someone not tracked yet, delete.
import { test, expect } from "./fixtures";
import { acceptDialogs, company, seedBaseline, seedCompanies, stored, storedById } from "./data";
import { openArea } from "./old-ui";
import { seed } from "../support/emulator";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

const EMPTY_NOTES = {
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
  return { id, prospectName: `Prospect ${id}`, updatedAt: 1, ...EMPTY_NOTES, ...fields };
}

const seedNotes = (docs: ReturnType<typeof notes>[]) => seed("clients", "prospectJournal", docs, { keepIdField: true });

test.beforeEach(async () => {
  await seedBaseline();
});

async function openNotes(page: import("@playwright/test").Page) {
  await page.goto("/");
  await openArea(page, "Prospect Journal", "Clients");
}

test("U5: start qualification notes from a company", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods" })]);
  await page.goto("/");
  await openArea(page, "Client Pipeline", "Clients");
  await page.getByRole("button", { name: "Add Pelita Foods to prospect journal" }).click();

  await expect(page.getByRole("heading", { name: "Prospect Journal" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Prospect name" })).toHaveValue("Pelita Foods");
  await expect
    .poll(() => storedById("clients", "prospectJournal", "pipeline-1"))
    .toMatchObject({ pipelineEntryId: 1, prospectName: "Pelita Foods" });
});

test("U1 U4: write under a heading; it saves on leaving and is there after a reload", async ({ page }) => {
  await seedNotes([notes("n1", { prospectName: "Pelita Foods" })]);
  await openNotes(page);
  const need = page.getByRole("textbox", { name: "Client Need for Pelita Foods" });
  await need.fill("Real-time fleet visibility");
  await need.blur();

  await expect.poll(async () => (await storedById("clients", "prospectJournal", "n1"))?.clientNeed).toBe(
    "Real-time fleet visibility"
  );
  await page.reload();
  await openArea(page, "Prospect Journal", "Clients"); // the old UI always reopens on its first area
  await expect(page.getByRole("textbox", { name: "Client Need for Pelita Foods" })).toHaveValue(
    "Real-time fleet visibility"
  );
});

test("U2: rate how likely the opportunity is", async ({ page }) => {
  await seedNotes([notes("n1", { prospectName: "Pelita Foods" })]);
  await openNotes(page);
  await page.getByRole("combobox", { name: "Opportunity Status for Pelita Foods" }).selectOption("High");

  await expect.poll(async () => (await storedById("clients", "prospectJournal", "n1"))?.opportunityStatus).toBe("High");
});

test("U3: write long remarks", async ({ page }) => {
  await seedNotes([notes("n1", { prospectName: "Pelita Foods" })]);
  await openNotes(page);
  await page.getByRole("button", { name: "Add detailed remarks for Pelita Foods" }).click();
  const remarks = page.getByRole("textbox", { name: "Detailed remarks for Pelita Foods" });
  await remarks.fill("Met the COO twice.\nThey want a pilot in two depots.");
  await remarks.blur();

  await expect.poll(async () => (await storedById("clients", "prospectJournal", "n1"))?.detailedRemarks).toBe(
    "Met the COO twice.\nThey want a pilot in two depots."
  );
});

test("U6: notes for a prospect not tracked yet", async ({ page }) => {
  await openNotes(page);
  await page.getByRole("button", { name: "+ Add first prospect" }).click();
  const name = page.getByRole("textbox", { name: "Prospect name" });
  await name.fill("Warung Digital");
  await name.blur();

  await expect
    .poll(async () => (await stored("clients", "prospectJournal")).map((n) => [n.prospectName, n.pipelineEntryId ?? null]))
    .toEqual([["Warung Digital", null]]);
});

test("U7: search across everything written", async ({ page }) => {
  await seedNotes([
    notes("n1", { prospectName: "Pelita Foods", potentialBlockersAnalysis: "Budget approval is slow" }),
    notes("n2", { prospectName: "Arunika Labs", clientNeed: "Better reporting" }),
  ]);
  await openNotes(page);
  await page.getByPlaceholder("Search prospects…").fill("budget");
  await expect(page.getByRole("textbox", { name: "Prospect name" })).toHaveValue("Pelita Foods");
});

test("U8: delete notes after confirming", async ({ page }) => {
  acceptDialogs(page);
  await seedNotes([notes("n1", { prospectName: "Pelita Foods" })]);
  await openNotes(page);
  await page.getByRole("button", { name: "Delete Pelita Foods" }).click();

  await expect.poll(() => stored("clients", "prospectJournal")).toEqual([]);
});
