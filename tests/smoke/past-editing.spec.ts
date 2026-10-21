// Changing past clients (task 3.13, guide 6.7, 5.3, 5.4, R1 to R3, R6, R8, R9, E1): adding a parent or a subsidiary with
// the name required, the quick add line, renaming and the sector editor with Undo, moving a subsidiary, not counted with
// Undo, deleting (blocked, a subsidiary, a company), failures with Try again, and the export of the full record. Each
// checks the stored data as well as the screen.
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { settledOnline } from "./data";
import { readAll, seed } from "../support/emulator";

type Doc = { id: string; name: string; parentId: string | null; sector: string | null; countHead: boolean; createdAt: number };
let at = 1;
function past(id: string, fields: Partial<Doc> = {}): Doc {
  return { id, name: `Client ${id}`, parentId: null, sector: null, countHead: true, createdAt: at++, ...fields };
}
const seedPast = (docs: Doc[]) => seed("clients", "historicalClients", docs, { keepIdField: true });
const stored = async () => (await readAll("clients", "historicalClients")) as unknown as Doc[];
const storedNamed = async (name: string) => (await stored()).find((d) => d.name === name);

const record = (page: Page) => page.getByRole("region", { name: "Past clients" });
const parent = (page: Page, name: string) => record(page).getByRole("article", { name });
const sub = (page: Page, name: string) => record(page).getByRole("group", { name, exact: true });
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const total = (page: Page) => page.getByRole("region", { name: "Client totals" }).getByTestId("client-total");
const more = (page: Page, name: string) => page.getByRole("button", { name: `More for ${name}` });
const menuItem = (page: Page, name: string) => page.getByRole("menuitem", { name });
// The header's action, or its round + on phones.
const addButton = (page: Page) => page.getByRole("link", { name: "Add a past client" }).filter({ visible: true }).first();

async function seedAll() {
  await seedPast([
    past("nusa", { name: "Nusa Retail", sector: "Retail" }),
    past("nusa-1", { name: "Nusa Outlet", parentId: "nusa", sector: "Retail" }),
    past("halcyon", { name: "Halcyon Group", countHead: false }),
    past("halcyon-1", { name: "Halcyon Clinic", parentId: "halcyon", sector: "Healthcare" }),
    past("pelita", { name: "Pelita Foods", sector: "Food" }),
  ]);
}
// 2 counted parents + 2 subsidiaries = 4 clients.

test("R1, 5.5: adding needs only a name; an umbrella company is added not counted", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await expect(total(page)).toHaveText("4");
  await addButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add a past client" });
  await dialog.getByRole("button", { name: "Add past client" }).click();
  await expect(dialog.getByText("Add the company’s name. It’s the only thing needed.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused();

  await dialog.getByRole("textbox", { name: "Name" }).fill("Meridian Holdings");
  await dialog.getByRole("combobox", { name: "Sector" }).fill(" retail");
  await expect(dialog.getByText("Same sector as “Retail”, so it’s saved that way.")).toBeVisible();
  await dialog.getByRole("button", { name: "Count it in the totals" }).click();
  await expect(dialog.getByText(/^Kept on record as an umbrella company\./)).toBeVisible();
  await dialog.getByRole("button", { name: "Add past client" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toasts(page).getByText("Meridian Holdings added")).toBeVisible();
  await expect.poll(() => storedNamed("Meridian Holdings")).toMatchObject({ parentId: null, sector: "Retail", countHead: false });
  await expect(parent(page, "Meridian Holdings")).toContainText("Not counted");
  await expect(total(page)).toHaveText("4");
  await expect(page).not.toHaveURL(/add=1/);
});

test("R1, R2: a subsidiary of a chosen parent takes its sector, and the search that hid it is cleared", async ({ page }) => {
  await seedAll();
  await page.goto("/past?q=pelita");
  await addButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add a past client" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Nusa Mart");
  await dialog.getByRole("button", { name: "A subsidiary of…" }).click();
  await dialog.getByRole("button", { name: "Add past client" }).click();
  await expect(dialog.getByText("Choose its parent company first.")).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Search parent companies" }).fill("nusa");
  await dialog.getByRole("button", { name: /^Nusa Retail/ }).click();
  await expect(dialog.getByRole("combobox", { name: "Sector" })).toHaveValue("Retail");
  await expect(dialog.getByText("Subsidiaries always count, even when their parent company doesn’t.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add past client" }).click();
  await expect(toasts(page).getByText("Nusa Mart added under Nusa Retail")).toBeVisible();
  await expect.poll(() => storedNamed("Nusa Mart")).toMatchObject({ parentId: "nusa", sector: "Retail", countHead: true });
  await expect(sub(page, "Nusa Mart")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();
  await expect(total(page)).toHaveText("5");
});

test("R2: Add a subsidiary from a parent's menu, by name and Enter; Undo takes it off again", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await more(page, "Pelita Foods").click();
  await menuItem(page, "Add a subsidiary").click();
  const line = parent(page, "Pelita Foods").getByRole("textbox", { name: "New subsidiary of Pelita Foods" });
  await expect(line).toBeFocused();
  await line.fill("Pelita Bakery");
  await line.press("Enter");
  await expect(toasts(page).getByText("Pelita Bakery added under Pelita Foods")).toBeVisible();
  await expect(line).toHaveValue("");
  await expect(line).toBeFocused();
  await expect.poll(() => storedNamed("Pelita Bakery")).toMatchObject({ parentId: "pelita", sector: "Food" });
  await expect(parent(page, "Pelita Foods")).toContainText("1 subsidiary");
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => storedNamed("Pelita Bakery")).toBeUndefined();
});

test("R2: a name is changed in place with Undo, and can't be emptied", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await parent(page, "Pelita Foods").getByRole("button", { name: "Rename Pelita Foods" }).click();
  const editor = page.getByRole("dialog", { name: "Company name" });
  const box = editor.getByRole("textbox", { name: "Company name" });
  await expect(box).toBeFocused();
  await box.fill("");
  await box.press("Enter");
  await expect(editor.getByText("A past client needs a name.")).toBeVisible();
  await box.fill("Pelita Foods Group");
  await box.press("Enter");
  await expect(toasts(page).getByText("Renamed")).toBeVisible();
  await expect.poll(async () => (await stored()).find((d) => d.id === "pelita")?.name).toBe("Pelita Foods Group");
  await expect(parent(page, "Pelita Foods Group")).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored()).find((d) => d.id === "pelita")?.name).toBe("Pelita Foods");
});

test("R6: the sector editor offers the sectors in use and saves another spelling the way it's used", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await parent(page, "Halcyon Group").getByRole("button", { name: "Add sector: Halcyon Group" }).click();
  const editor = page.getByRole("dialog", { name: "Sector of Halcyon Group" });
  await expect(editor.getByRole("menuitemradio", { name: /Retail\s*2 companies/ })).toBeVisible();
  await editor.getByRole("textbox", { name: "Sector" }).fill("RETAIL");
  await expect(editor.getByText("Same sector as “Retail”, so it’s saved that way.")).toBeVisible();
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page).getByText("Sector set to Retail")).toBeVisible();
  await expect.poll(async () => (await stored()).find((d) => d.id === "halcyon")?.sector).toBe("Retail");

  await parent(page, "Halcyon Group").getByRole("button", { name: /^Sector Retail\. Change the sector of Halcyon Group/ }).click();
  await page.getByRole("dialog", { name: "Sector of Halcyon Group" }).getByRole("button", { name: "Clear" }).click();
  await expect(toasts(page).getByText("Sector cleared")).toBeVisible();
  await expect.poll(async () => (await stored()).find((d) => d.id === "halcyon")?.sector).toBeNull();
});

test("R2, R9: a subsidiary moves to a parent found by search, with Undo; with no other parent the dialog says so", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await parent(page, "Nusa Retail").getByRole("button", { name: "Show the subsidiaries of Nusa Retail" }).click();
  await more(page, "Nusa Outlet").click();
  await menuItem(page, "Move to another parent company").click();
  const dialog = page.getByRole("dialog", { name: "Move Nusa Outlet" });
  await expect(dialog.getByText("Now under Nusa Retail.", { exact: false })).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Search parent companies" }).fill("pel");
  await expect(dialog.getByRole("button", { name: /Nusa Retail/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Pelita Foods/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toasts(page).getByText("Nusa Outlet moved to Pelita Foods")).toBeVisible();
  await expect.poll(async () => (await stored()).find((d) => d.id === "nusa-1")?.parentId).toBe("pelita");
  await expect(parent(page, "Pelita Foods").getByRole("group", { name: "Nusa Outlet" })).toBeVisible();
  await expect(total(page)).toHaveText("4");
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored()).find((d) => d.id === "nusa-1")?.parentId).toBe("nusa");
});

test("R2: moving with no other parent company offers to add one", async ({ page }) => {
  await seedPast([past("a", { name: "Alpha" }), past("a1", { name: "Alpha Two", parentId: "a" })]);
  await page.goto("/past");
  await parent(page, "Alpha").getByRole("button", { name: "Show the subsidiaries of Alpha" }).click();
  await more(page, "Alpha Two").click();
  await menuItem(page, "Move to another parent company").click();
  const dialog = page.getByRole("dialog", { name: "Move Alpha Two" });
  await expect(dialog.getByText("There’s no other parent company to move it to.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Add a parent company" }).click();
  await expect(page.getByRole("dialog", { name: "Add a past client" })).toBeVisible();
});

test("R3: not counted from the menu says how the total changes, with Undo; the tag counts it again", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await more(page, "Pelita Foods").click();
  await menuItem(page, "Stop counting it in the totals").click();
  await expect(toasts(page).getByText("Pelita Foods no longer counted. Clients: 4 → 3")).toBeVisible();
  await expect.poll(async () => (await stored()).find((d) => d.id === "pelita")?.countHead).toBe(false);
  await expect(total(page)).toHaveText("3");
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored()).find((d) => d.id === "pelita")?.countHead).toBe(true);

  await parent(page, "Halcyon Group").getByRole("button", { name: "Not counted" }).click();
  await expect(toasts(page).getByText("Halcyon Group counted again. Clients: 4 → 5")).toBeVisible();
  await expect.poll(async () => (await stored()).find((d) => d.id === "halcyon")?.countHead).toBe(true);
});

test("R8, 5.4: a parent with subsidiaries can't be deleted; a subsidiary and a company ask first and say how the total changes", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await more(page, "Nusa Retail").click();
  await menuItem(page, "Delete company").click();
  const blocked = page.getByRole("alertdialog", { name: "Move or delete its subsidiaries first" });
  await expect(blocked.getByText("Nusa Retail still has 1 subsidiary.", { exact: false })).toBeVisible();
  await blocked.getByRole("button", { name: "Show its subsidiaries" }).click();
  await expect(parent(page, "Nusa Retail").getByRole("group", { name: "Nusa Outlet" })).toBeVisible();

  await more(page, "Nusa Outlet").click();
  await menuItem(page, "Delete subsidiary").click();
  const confirm = page.getByRole("alertdialog", { name: "Delete Nusa Outlet?" });
  await expect(confirm.getByText("The client total goes from 4 to 3.", { exact: false })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete subsidiary" }).click();
  await expect(toasts(page).getByText("Nusa Outlet deleted")).toBeVisible();
  await expect.poll(async () => (await stored()).some((d) => d.id === "nusa-1")).toBe(false);
  await expect(total(page)).toHaveText("3");
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored()).find((d) => d.id === "nusa-1")).toMatchObject({ name: "Nusa Outlet", parentId: "nusa" });

  await more(page, "Pelita Foods").click();
  await menuItem(page, "Delete company").click();
  await page.getByRole("alertdialog", { name: "Delete Pelita Foods?" }).getByRole("button", { name: "Delete company" }).click();
  await expect.poll(async () => (await stored()).some((d) => d.id === "pelita")).toBe(false);
});

test("R8, 5.4: Undo never brings a subsidiary back under a parent company that's gone since (R3 review)", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await parent(page, "Nusa Retail").getByRole("button", { name: "Show the subsidiaries of Nusa Retail" }).click();
  await more(page, "Nusa Outlet").click();
  await menuItem(page, "Delete subsidiary").click();
  await page.getByRole("alertdialog", { name: "Delete Nusa Outlet?" }).getByRole("button", { name: "Delete subsidiary" }).click();
  await expect(toasts(page).getByText("Nusa Outlet deleted")).toBeVisible();
  await more(page, "Nusa Retail").click();
  await menuItem(page, "Delete company").click();
  await page.getByRole("alertdialog", { name: "Delete Nusa Retail?" }).getByRole("button", { name: "Delete company" }).click();
  await expect.poll(async () => (await stored()).some((d) => d.id === "nusa")).toBe(false);
  // Both deletes still have their toast, the older one first: its Undo is the first.
  await toasts(page).getByRole("button", { name: "Undo" }).first().click();
  await expect(page.getByText("Nusa Outlet can’t come back: Nusa Retail isn’t there any more.")).toBeVisible();
  expect((await stored()).some((d) => d.id === "nusa-1")).toBe(false);
});

test("R9: offline, adding keeps what was typed and says so, and Try again adds it once back; a change in place offers Try again", async ({ page, context }) => {
  await seedAll();
  await page.goto("/past");
  await expect(parent(page, "Pelita Foods")).toBeVisible();
  await addButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add a past client" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Borneo Agro");
  await context.setOffline(true);
  await dialog.getByRole("button", { name: "Add past client" }).click();
  await expect(dialog.getByText("Couldn’t save Borneo Agro.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Borneo Agro");

  await context.setOffline(false);
  await expect(page.getByRole("status").getByText(/Back online/)).toBeVisible();
  await settledOnline(page);
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(toasts(page).getByText("Borneo Agro added")).toBeVisible();
  await expect.poll(() => storedNamed("Borneo Agro")).toBeTruthy();

  await context.setOffline(true);
  await parent(page, "Pelita Foods").getByRole("button", { name: "Rename Pelita Foods" }).click();
  const box = page.getByRole("dialog", { name: "Company name" }).getByRole("textbox", { name: "Company name" });
  await box.fill("Pelita Group");
  await box.press("Enter");
  await expect(toasts(page).getByText("No connection. The change wasn't saved.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("status").getByText(/Back online/)).toBeVisible();
  await settledOnline(page);
  await toasts(page).getByRole("button", { name: "Try again" }).click();
  await expect.poll(async () => (await stored()).find((d) => d.id === "pelita")?.name).toBe("Pelita Group");
});

test("E1: export is always the full record, each subsidiary after its parent, whatever the search shows", async ({ page }) => {
  await seedAll();
  await page.goto("/past?q=pelita");
  await record(page).getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export past clients" });
  await expect(dialog).toContainText("The full record: 3 parent companies and 2 subsidiaries, one row each, whatever the search and filters show.");
  await expect(dialog.getByText(/^past-clients-\d{4}-\d{2}-\d{2}\.csv$/)).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  // Every cell is quoted in the file; the quotes are left out here.
  const file = await readFile((await (await download).path())!, "utf8");
  expect(file.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((line) => line.replaceAll('"', ""))).toEqual([
    "Name,Parent or subsidiary,Parent company,Sector,Counted",
    "Halcyon Group,Parent company,,,No",
    "Halcyon Clinic,Subsidiary,Halcyon Group,Healthcare,Yes",
    "Nusa Retail,Parent company,,Retail,Yes",
    "Nusa Outlet,Subsidiary,Nusa Retail,Retail,Yes",
    "Pelita Foods,Parent company,,Food,Yes",
  ]);
  await expect(toasts(page).getByText(/^Downloaded past-clients-/)).toBeVisible();
});
