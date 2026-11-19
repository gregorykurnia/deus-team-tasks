// Fields, options and export (task 3.10, guide 6.5, 5.12, C1 to C3, E1): what the list shows, renaming and own fields,
// options renamed, recoloured, reordered and removed, the locked options, and export. Each checks the stored data as
// well as the screen.
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { readFields, seed } from "../support/emulator";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, storedById } from "./data";

const row = (page: Page, name: string) => page.getByRole("article", { name });
const cell = (page: Page, name: string, label: RegExp) => row(page, name).getByRole("button", { name: label });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Filter, sort and export" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Fields" });
const moveHandle = (scope: Locator, name: string) => scope.getByRole("button", { name: `Move ${name}`, exact: true });

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

async function editStatusOptions(page: Page) {
  await cell(page, "Pelita Foods", /^Status: Meeting Soon/).click();
  await page.getByRole("menu", { name: "Status", exact: true }).getByRole("menuitem", { name: "Edit options", exact: true }).click();
  return page.getByRole("dialog", { name: "Status options", exact: true });
}

async function reorderShot(page: Page, name: string) {
  if (!process.env.REORDER_SHOTS) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${process.env.REORDER_SHOTS}/${name}.png`,
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
  });
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
  const dialog = await editStatusOptions(page);

  // The locked ones say why, and can't be renamed or removed.
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

test("C3: drag and arrow keys reorder Status options for the menu, filter and sort", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "Meeting Soon" }),
    company(2, { company: "Borneo Retail", status: "Waiting For Our Actions" }),
  ]);
  await page.goto("/companies?sort=status&dir=asc");
  const companies = page.getByRole("article");
  const companyNames = () => companies.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  await expect.poll(companyNames).toEqual(["Borneo Retail", "Pelita Foods"]);

  const dialog = await editStatusOptions(page);
  const meeting = moveHandle(dialog, "Meeting Soon");
  const waiting = moveHandle(dialog, "Waiting For Our Actions");
  const announcement = dialog.locator('[aria-live="polite"]');
  await expect(meeting).toHaveAccessibleDescription("Drag, or use the up and down arrow keys");
  await reorderShot(page, "desktop-rest");
  const start = (await meeting.boundingBox())!;
  const target = (await waiting.boundingBox())!;
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = target.y + target.height / 2 - 12;

  await meeting.click(); // Dropping on the same row doesn't create settings.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, endY, { steps: 8 });
  await expect(moveHandle(dialog.locator("[data-lifted]"), "Meeting Soon")).toBeVisible();
  await reorderShot(page, "desktop-drag");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-lifted]")).toHaveCount(0);
  expect(await settings()).toBeNull();

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, endY, { steps: 8 });
  await page.mouse.up();
  await expect(announcement).toHaveText("Meeting Soon moved to 3 of 7");

  const first = ["Client / Partner Done Deal", "To Follow Up", "Meeting Soon"];
  const last = ["Raw List", "Drop"];
  const storedOrder = async () => (await settings())?.options.status.map((o) => o.name);
  await expect.poll(storedOrder).toEqual([...first, "Waiting For Our Actions", "Scheduling In Progress", ...last]);
  await reorderShot(page, "desktop-after");

  await waiting.press("ArrowDown");
  await expect(waiting).toBeFocused();
  await expect(announcement).toHaveText("Waiting For Our Actions moved to 5 of 7");
  const expected = [...first, "Scheduling In Progress", "Waiting For Our Actions", ...last];
  await expect.poll(storedOrder).toEqual(expected);

  // A failed save puts the last saved order back.
  await context.setOffline(true);
  await waiting.press("ArrowUp");
  await expect(toasts(page).getByText("No connection. The order wasn't changed.")).toBeVisible();
  const shownOrder = () => dialog.getByRole("button", { name: /^Move / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  await expect.poll(shownOrder).toEqual(expected.map((name) => `Move ${name}`));
  await expect(waiting).toBeFocused();
  await context.setOffline(false);

  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(companyNames).toEqual(["Pelita Foods", "Borneo Retail"]);
  const menu = page.getByRole("menu", { name: "Status", exact: true });
  await cell(page, "Pelita Foods", /^Status: Meeting Soon/).click();
  await expect(menu.getByRole("menuitemradio")).toHaveText([/Client \/ Partner Done Deal/, ...expected.slice(1)]);
  await page.keyboard.press("Escape");
  await toolbar(page).getByRole("button", { name: "Status", exact: true }).click();
  await expect(menu.getByRole("menuitemradio")).toHaveText(["Any status", ...expected, "None"]);
});

test("C3: a colleague's edit doesn't drop a drag, and quick arrow presses never jump back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedAll();
  await page.goto("/companies");
  const dialog = await editStatusOptions(page);
  const storedOrder = async () => (await settings())?.options.status.map((o) => o.name);
  const meeting = moveHandle(dialog, "Meeting Soon");
  await meeting.press("ArrowDown"); // stores the settings, for the colleague to change
  await expect.poll(storedOrder).toEqual([
    "Client / Partner Done Deal", "To Follow Up", "Waiting For Our Actions", "Scheduling In Progress", "Raw List", "Meeting Soon", "Drop",
  ]);

  // Mid-drag, a colleague recolours Drop: the row stays lifted and the drop still saves.
  const raw = moveHandle(dialog, "Raw List");
  const box = (await raw.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 2.5 * box.height, { steps: 6 });
  await expect(moveHandle(dialog.locator("[data-lifted]"), "Raw List")).toBeVisible();
  const stored = (await settings())!;
  stored.options.status = stored.options.status.map((o) => (o.name === "Drop" ? { ...o, colour: "violet" } : o));
  await seed("tasks", "settings", [{ id: "companies", ...stored }]);
  await expect(dialog.getByRole("button", { name: "Colour of Drop: Violet. Change", exact: true })).toBeVisible();
  await expect(moveHandle(dialog.locator("[data-lifted]"), "Raw List")).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await storedOrder())?.indexOf("Raw List")).toBeLessThan(4);

  // Quick presses save their moves in turn, and the list never shows Meeting Soon lower than it was.
  await page.evaluate(() => {
    const list = document.querySelector('[aria-label="Move Meeting Soon"]')!.closest("[class*=options]")!;
    const seen: number[] = [];
    (window as unknown as { seen: number[] }).seen = seen;
    const read = () => seen.push([...list.querySelectorAll("[aria-label^='Move ']")].findIndex((b) => b.getAttribute("aria-label") === "Move Meeting Soon"));
    read();
    new MutationObserver(read).observe(list, { childList: true, subtree: true });
  });
  const startAt = (await storedOrder())!.indexOf("Meeting Soon");
  const presses = Math.min(3, startAt);
  expect(presses).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < presses; i++) await meeting.press("ArrowUp");
  await expect.poll(async () => (await storedOrder())?.indexOf("Meeting Soon")).toBe(startAt - presses);
  await expect(meeting).toBeFocused();
  const seen = await page.evaluate(() => (window as unknown as { seen: number[] }).seen);
  for (let i = 1; i < seen.length; i++) expect(seen[i], `shown positions ${seen.join(", ")}`).toBeLessThanOrEqual(seen[i - 1]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: number[] }).seen.at(-1))).toBe(startAt - presses);
});

test("C3: drag a Status option by touch on a phone", { tag: "@phone" }, async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "Uses touch input on the phone project.");
  await seedAll();
  await page.goto("/companies");
  const dialog = await editStatusOptions(page);
  const waiting = moveHandle(dialog, "Waiting For Our Actions");
  const scheduling = moveHandle(dialog, "Scheduling In Progress");
  await expect(waiting).toBeVisible();
  await reorderShot(page, "phone-rest");
  const start = (await waiting.boundingBox())!;
  const target = (await scheduling.boundingBox())!;
  expect(start.width).toBeGreaterThanOrEqual(36);
  expect(start.height).toBeGreaterThanOrEqual(36);
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = target.y + target.height / 2 + 12;
  const touch = await context.newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (endY - y) * step / 8 }] });
  }
  await expect(moveHandle(dialog.locator("[data-lifted]"), "Waiting For Our Actions")).toBeVisible();
  await reorderShot(page, "phone-drag");
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touch.detach();
  await expect(dialog.locator('[aria-live="polite"]')).toHaveText("Waiting For Our Actions moved to 4 of 7");
  await expect.poll(async () => (await settings())?.options.status.slice(2, 4).map((o) => o.name)).toEqual([
    "Scheduling In Progress",
    "Waiting For Our Actions",
  ]);
});

test("E1: export downloads the companies shown with the fields the list shows, and says when there's nothing to export", async ({ page }) => {
  await seedAll();
  await page.goto("/companies?q=pelita");
  await toolbar(page).getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export Active" });
  await expect(dialog.getByText(/^1 active prospect/)).toBeVisible();
  await expect(dialog.getByText(", as filtered now, in the current order, with the 8 fields the list shows:")).toBeVisible();
  const file = `companies-active-${isoDay(0)}.csv`;
  await expect(dialog.getByText(file)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe(file);
  const lines = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(lines[0]).toBe('"Company","Status","Priority","Last action","Target date","Products","GBA trials","Next actions"');
  expect(lines.slice(1)).toEqual([`"Pelita Foods","Meeting Soon","High","${isoDay(-2)}","","","","Send the quote"`]);
  await expect(toasts(page).getByText(`Downloaded ${file}`)).toBeVisible();

  await page.goto("/companies?q=nothing-like-this");
  await toolbar(page).getByRole("button", { name: "Export" }).click();
  const empty = page.getByRole("dialog", { name: "Export Active" });
  await expect(empty.getByText("No companies are shown right now, so there’s nothing to export.", { exact: false })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Download" })).toBeDisabled();
});
