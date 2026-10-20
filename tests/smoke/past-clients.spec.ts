// Past clients on the old UI: parents, subsidiaries, move, rename, not counted,
// sector spellings, blocked delete.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { acceptDialogs, seedBaseline, stored, storedById } from "./data";
import { OLD_UI, dialog, openArea, panel } from "./old-ui";
import { seed } from "../support/emulator";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

function pastClient(id: string, fields: Record<string, unknown> = {}) {
  return { id, name: `Client ${id}`, parentId: null, sector: null, countHead: true, createdAt: 1, ...fields };
}

const seedPast = (docs: ReturnType<typeof pastClient>[]) => seed("clients", "historicalClients", docs, { keepIdField: true });

test.beforeEach(async () => {
  await seedBaseline();
});

async function openPast(page: Page) {
  await page.goto(OLD_UI);
  await openArea(page, "Clients Historical", "Clients");
}

function stat(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::div[1]");
}

test("R1: add a parent company with its sector", async ({ page }) => {
  await openPast(page);
  await page.getByRole("button", { name: "+ Add client" }).click();
  const modal = dialog(page, "Add client");
  await modal.getByPlaceholder("PT Contoh Indonesia").fill("Bank Mandala");
  await modal.getByPlaceholder("e.g. Retail").fill("Banking");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: "Bank Mandala", exact: true })).toBeVisible();
  await expect
    .poll(async () => (await stored("clients", "historicalClients")).map((c) => [c.name, c.parentId, c.sector, c.countHead]))
    .toEqual([["Bank Mandala", null, "Banking", true]]);
});

test("R2: add a subsidiary under a parent", async ({ page }) => {
  await seedPast([pastClient("p1", { name: "Mandala Group", sector: "Banking" })]);
  await openPast(page);
  await page.getByRole("button", { name: "Add subsidiary to Mandala Group" }).click();
  await dialog(page, "Add subsidiary").getByPlaceholder("Subsidiary name").fill("Mandala Finance");
  await dialog(page, "Add subsidiary").getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: "Mandala Finance", exact: true })).toBeVisible();
  await expect
    .poll(async () => (await stored("clients", "historicalClients")).find((c) => c.name === "Mandala Finance")?.parentId)
    .toBe("p1");
});

test("R2: move a subsidiary to another parent", async ({ page }) => {
  await seedPast([
    pastClient("p1", { name: "Mandala Group" }),
    pastClient("p2", { name: "Sentosa Holdings" }),
    pastClient("s1", { name: "Mandala Finance", parentId: "p1" }),
  ]);
  await openPast(page);
  await page.getByRole("button", { name: "Move Mandala Finance" }).click();
  const modal = dialog(page, "Move subsidiary");
  await modal.locator("select").selectOption({ label: "Sentosa Holdings" });
  await modal.getByRole("button", { name: "Move" }).click();

  await expect.poll(async () => (await storedById("clients", "historicalClients", "s1"))?.parentId).toBe("p2");
});

test("R2: rename a parent company in place", async ({ page }) => {
  await seedPast([pastClient("p1", { name: "Mandala Grp" })]);
  await openPast(page);
  await page.getByRole("button", { name: "Mandala Grp", exact: true }).click();
  const editor = panel(page, "Client name");
  await editor.locator("input").fill("Mandala Group");
  await editor.locator("input").press("Enter");

  await expect.poll(async () => (await storedById("clients", "historicalClients", "p1"))?.name).toBe("Mandala Group");
});

test("R3 R4: an umbrella parent kept on record but not counted", async ({ page }) => {
  await seedPast([
    pastClient("p1", { name: "Mandala Group" }),
    pastClient("s1", { name: "Mandala Finance", parentId: "p1" }),
  ]);
  await openPast(page);
  await expect(stat(page, "Total clients")).toHaveText("2");
  await page.getByRole("checkbox", { name: "Count Mandala Group in total" }).click();

  await expect.poll(async () => (await storedById("clients", "historicalClients", "p1"))?.countHead).toBe(false);
  await expect(stat(page, "Total clients")).toHaveText("1");
  await expect(page.getByText("not counted", { exact: true })).toBeVisible();
});

test("R6: a sector typed in another spelling is saved in the one in use", async ({ page }) => {
  await seedPast([pastClient("p1", { name: "Toko Maju", sector: "Retail" })]);
  await openPast(page);
  await page.getByRole("button", { name: "+ Add client" }).click();
  const modal = dialog(page, "Add client");
  await modal.getByPlaceholder("PT Contoh Indonesia").fill("Pasar Baru");
  await modal.getByPlaceholder("e.g. Retail").fill("  retail ");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(async () => (await stored("clients", "historicalClients")).find((c) => c.name === "Pasar Baru")?.sector)
    .toBe("Retail");
});

test("R8: a parent with subsidiaries can't be deleted", async ({ page }) => {
  acceptDialogs(page);
  await seedPast([
    pastClient("p1", { name: "Mandala Group" }),
    pastClient("s1", { name: "Mandala Finance", parentId: "p1" }),
  ]);
  await openPast(page);
  await page.getByRole("button", { name: "Delete Mandala Group" }).click();

  await expect(page.getByText(/Move or delete the 1 subsidiaries under "Mandala Group" first/)).toBeVisible();
  expect(await stored("clients", "historicalClients")).toHaveLength(2);
});

test("R2 R8: delete a subsidiary after confirming", async ({ page }) => {
  acceptDialogs(page);
  await seedPast([
    pastClient("p1", { name: "Mandala Group" }),
    pastClient("s1", { name: "Mandala Finance", parentId: "p1" }),
  ]);
  await openPast(page);
  await page.getByRole("button", { name: "Delete Mandala Finance" }).click();

  await expect.poll(async () => (await stored("clients", "historicalClients")).map((c) => c.id)).toEqual(["p1"]);
});
