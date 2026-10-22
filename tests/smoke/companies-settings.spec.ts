// Fields, options and export (task 3.10, guide 6.5, 5.12, C1 to C3, E1): what the list shows, renaming and own fields,
// options renamed, recoloured and removed (with the companies following), the locked options, and export. Each checks the
// stored data as well as the screen.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { readFields } from "../support/emulator";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, storedById } from "./data";

const row = (page: Page, name: string) => page.getByRole("article", { name });
const cell = (page: Page, name: string, label: RegExp) => row(page, name).getByRole("button", { name: label });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Filter, sort and export" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Fields" });

interface StoredSettings {
  options: Record<string, { name: string; colour: string; role?: string }[]>;
  fields: Record<string, { key: string; label: string; type: string; shown: boolean; own: boolean }[]>;
}
const settings = async () => (await readFields("tasks", "settings/companies")) as StoredSettings | null;
const activeField = async (key: string) => (await settings())?.fields.active.find((f) => f.key === key);

async function seedAll() {
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "Meeting Soon", priority: "High", date: isoDay(-2), notes: "Send the quote" }),
    company(2, { company: "Borneo Retail", status: "Meeting Soon", priority: "Low", date: isoDay(-1) }),
    company(3, { company: "Citra Mart", status: "Drop", date: isoDay(-5) }),
  ]);
}

test("C2: a field switched off leaves the list for everyone, and every field stays listed in the sheet", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await expect(cell(page, "Pelita Foods", /^Priority: High/)).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Fields" }).click();
  await expect(sheet(page).getByText("Always shown, and the only required field")).toBeVisible();
  const priority = sheet(page).getByRole("button", { name: "Show Priority in the Active list" });
  await expect(priority).toHaveAttribute("aria-pressed", "true");
  await priority.click();
  await expect(priority).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await activeField("priority"))?.shown).toBe(false);

  // The sheet is in the address, so a reload keeps it; Done closes it.
  await page.reload();
  await expect(sheet(page).getByRole("button", { name: "Show Priority in the Active list" })).toHaveAttribute("aria-pressed", "false");
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(cell(page, "Pelita Foods", /^Status:/)).toBeVisible();
  await expect(cell(page, "Pelita Foods", /^Priority:/)).toHaveCount(0);
});

test("C1: a field is renamed, and an own choice field is added with its options, then removed after a confirmation", async ({ page }) => {
  await seedAll();
  await page.goto("/companies?fields=active");
  await sheet(page).getByRole("button", { name: "Rename Next actions" }).click();
  const name = sheet(page).getByRole("textbox", { name: "New name for Next actions" });
  await name.fill("status");
  await name.press("Enter");
  await expect(sheet(page).getByText("There’s already a field called “status”.")).toBeVisible();
  await name.fill("Next steps");
  await name.press("Enter");
  await expect(toasts(page).getByText("Renamed to “Next steps” in Active")).toBeVisible();
  await expect.poll(async () => (await activeField("notes"))?.label).toBe("Next steps");

  await sheet(page).getByRole("button", { name: "Add a field" }).click();
  await sheet(page).getByRole("button", { name: "Add field" }).click();
  await expect(sheet(page).getByText("Give the field a name.")).toBeVisible();
  await expect(sheet(page).getByRole("textbox", { name: "Field name" })).toBeFocused();
  await sheet(page).getByRole("textbox", { name: "Field name" }).fill("Region");
  await sheet(page).getByRole("button", { name: "Choice" }).click();
  const option = sheet(page).getByRole("textbox", { name: "New option" });
  await option.fill("Java");
  await option.press("Enter");
  await option.fill("Bali");
  await option.press("Enter");
  await sheet(page).getByRole("button", { name: "Add field" }).click();
  await expect(toasts(page).getByText("“Region” added to Active, and shown in its list")).toBeVisible();
  const stored = await settings();
  const region = stored!.fields.active.find((f) => f.label === "Region")!;
  expect(region).toMatchObject({ type: "choice", shown: true, own: true });
  expect(stored!.options[region.key].map((o) => o.name)).toEqual(["Java", "Bali"]);
  await expect(sheet(page).getByText("Own", { exact: true })).toBeVisible();

  await sheet(page).getByRole("button", { name: "Remove Region" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove “Region”?" });
  await expect(confirm.getByText("It disappears from Active, its list and its records. No company has a value in it yet.")).toBeVisible();
  await confirm.getByRole("button", { name: "Remove field" }).click();
  await expect(toasts(page).getByText("“Region” removed from Active")).toBeVisible();
  await expect.poll(async () => (await settings())?.fields.active.some((f) => f.label === "Region")).toBe(false);
});

test("C3: renaming an option changes every company using it, and a filter on it follows; removing clears it after a confirmation", async ({ page }) => {
  await seedAll();
  await page.goto("/companies?status=Meeting+Soon");
  await cell(page, "Pelita Foods", /^Status: Meeting Soon/).click();
  await page.getByRole("menu", { name: "Status" }).getByRole("menuitem", { name: "Edit options" }).click();
  const dialog = page.getByRole("dialog", { name: "Status options" });

  // The locked ones say why, and only their colour changes.
  await expect(dialog.getByText("Moves the company to Active clients and partners")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Rename To Follow Up" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Remove To Follow Up" })).toHaveCount(0);

  const rename = dialog.getByRole("textbox", { name: "Rename Meeting Soon" });
  await rename.fill("Meeting booked");
  await rename.press("Enter");
  await expect(toasts(page).getByText("Renamed. 2 companies now show “Meeting booked”")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 1))?.status).toBe("Meeting booked");
  expect((await storedById("clients", "pipeline", 2))?.status).toBe("Meeting booked");
  expect(new URL(page.url()).searchParams.get("status")).toBe("Meeting booked");

  await dialog.getByRole("button", { name: /^Colour of Raw List/ }).click();
  await page.getByRole("menu", { name: "Colour" }).getByRole("menuitemradio", { name: "Pink" }).click();
  await expect.poll(async () => (await settings())?.options.status.find((o) => o.name === "Raw List")?.colour).toBe("pink");

  await expect(dialog.getByText("1 company", { exact: true })).toBeVisible(); // Drop
  await dialog.getByRole("button", { name: "Remove Drop" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove “Drop”?" });
  await expect(confirm.getByText("It will be cleared from the 1 company that uses it.")).toBeVisible();
  await confirm.getByRole("button", { name: "Remove option" }).click();
  await expect(toasts(page).getByText("“Drop” removed and cleared from 1 company")).toBeVisible();
  await expect.poll(async () => (await storedById("clients", "pipeline", 3))?.status).toBeUndefined();
  await expect(dialog.getByRole("textbox", { name: "Rename Drop" })).toHaveCount(0);

  await dialog.getByRole("textbox", { name: "New option" }).fill("Proposal sent");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(toasts(page).getByText("“Proposal sent” added")).toBeVisible();
  await expect.poll(async () => (await settings())?.options.status.some((o) => o.name === "Proposal sent")).toBe(true);
});

test("E1: export downloads the companies shown with the fields the list shows, and says when there's nothing to export", async ({ page }) => {
  await seedAll();
  await page.goto("/companies?q=pelita");
  await toolbar(page).getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export Active" });
  await expect(dialog.getByText(/^1 active prospect/)).toBeVisible();
  await expect(dialog.getByText(", as filtered now, in the current order, with the 7 fields the list shows:")).toBeVisible();
  const file = `companies-active-${isoDay(0)}.csv`;
  await expect(dialog.getByText(file)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe(file);
  const lines = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(lines[0]).toBe('"Company","Status","Priority","Last action","Target date","Products","Next actions"');
  expect(lines.slice(1)).toEqual([`"Pelita Foods","Meeting Soon","High","${isoDay(-2)}","","","Send the quote"`]);
  await expect(toasts(page).getByText(`Downloaded ${file}`)).toBeVisible();

  await page.goto("/companies?q=nothing-like-this");
  await toolbar(page).getByRole("button", { name: "Export" }).click();
  const empty = page.getByRole("dialog", { name: "Export Active" });
  await expect(empty.getByText("No companies are shown right now, so there’s nothing to export.", { exact: false })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Download" })).toBeDisabled();
});
