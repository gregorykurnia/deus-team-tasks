// GBA trials (N22): the Discover GBA modules a prospect has trialled, ticked on its record, shown as chips in the Active
// list, and a filter that finds who trialled a module.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, seedCompanies, storedById } from "./data";

const row = (page: Page, name: string) => page.getByRole("article", { name });

test("N22: ticking modules on a record stores them in order, shows them in the list, and GBA trials filters by one", async ({ page }) => {
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "Meeting Soon" }),
    company(2, { company: "Borneo Retail", status: "To Follow Up", gbaTrials: "Personality" }),
  ]);
  await page.goto("/companies?company=1");
  const record = page.getByRole("dialog", { name: "Pelita Foods" });
  await record.getByRole("button", { name: "GBA trials: empty. Add" }).click();
  const editor = page.getByRole("menu", { name: "GBA trials" });
  await editor.getByRole("menuitemcheckbox", { name: "Simulation" }).click();
  await editor.getByRole("menuitemcheckbox", { name: "Cognitive" }).click(); // the menu stays open for the next one
  await expect(editor.getByRole("menuitemcheckbox", { name: "Cognitive" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.gbaTrials).toBe("Cognitive, Simulation");
  await page.keyboard.press("Escape");
  await record.getByRole("button", { name: "Close" }).click();

  await expect(row(page, "Pelita Foods")).toContainText("Cognitive");
  await expect(row(page, "Pelita Foods")).toContainText("Simulation");
  await page.getByRole("toolbar", { name: "Filter, sort and export" }).getByRole("button", { name: "GBA trials", exact: true }).click();
  await page.getByRole("menu", { name: "GBA trials" }).getByRole("menuitemradio", { name: "Personality" }).click();
  await expect(page).toHaveURL(/trial=Personality/);
  await expect(row(page, "Borneo Retail")).toBeVisible();
  await expect(row(page, "Pelita Foods")).toHaveCount(0);
});
