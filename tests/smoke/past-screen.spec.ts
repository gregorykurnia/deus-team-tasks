// Past clients (task 3.12, guide 6.7, 4.16): the totals and the sum, Not counted, Copy these figures, the record with its
// trees, search with highlights, order, sector filter, the By sector panel and the phone switch. Nothing here writes data;
// adding and changing are in task 3.13.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seed } from "../support/emulator";

type Doc = { id: string; name: string; parentId: string | null; sector: string | null; countHead: boolean; createdAt: number };
let at = 1;
function past(id: string, fields: Partial<Doc> = {}): Doc {
  return { id, name: `Client ${id}`, parentId: null, sector: null, countHead: true, createdAt: at++, ...fields };
}
const seedPast = (docs: Doc[]) => seed("clients", "historicalClients", docs, { keepIdField: true });

const search = (page: Page) => page.getByRole("searchbox", { name: "Search past clients" });
const record = (page: Page) => page.getByRole("region", { name: "Past clients" });
const parents = (page: Page) => record(page).getByRole("article");
const parent = (page: Page, name: string) => record(page).getByRole("article", { name });
const names = (page: Page) => parents(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
const sectors = (page: Page) => page.getByRole("region", { name: "Clients by sector" });
const toolbar = (page: Page) => record(page).getByRole("toolbar", { name: "Filter, order and show" });
// Phones show one side at a time.
async function showRecord(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Companies" }).click();
}
async function showSectors(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "By sector" }).click();
}

async function seedAll() {
  await seedPast([
    past("nusa", { name: "Nusa Retail", sector: "Retail" }),
    past("nusa-1", { name: "Nusa Outlet", parentId: "nusa", sector: "retail" }),
    past("nusa-2", { name: "Nusa Online", parentId: "nusa" }),
    past("nusa-3", { name: "Kencana Mart", parentId: "nusa", sector: "Retail" }),
    past("halcyon", { name: "Halcyon Group", countHead: false }),
    past("halcyon-1", { name: "Halcyon Clinic", parentId: "halcyon", sector: "Healthcare" }),
    past("pelita", { name: "Pelita Foods", sector: "Food" }),
    past("zeta", { name: "Zeta Works" }),
  ]);
}

test("R3: the total is the counted parents plus every subsidiary, and the sum shows it", async ({ page }) => {
  await seedAll();
  await page.goto("/past");
  await expect(page.getByRole("heading", { level: 1, name: "Past clients" })).toBeVisible();
  await expect(page.getByText("7 clients served")).toBeVisible();
  const totals = page.getByRole("region", { name: "Client totals" });
  await expect(totals.getByText("Clients we’ve served")).toBeVisible();
  await expect(totals.getByTestId("client-total")).toHaveText("7");
  await expect(totals.getByText("3 parent companies and 4 subsidiaries. 1 umbrella company is kept on record but not counted.")).toBeVisible();
  const sum = totals.getByRole("group", { name: "How the total adds up" });
  await expect(sum.getByText("Parent companies counted").locator("..")).toContainText("3");
  await expect(sum.getByText("Subsidiaries", { exact: true }).locator("..")).toContainText("4");
  await expect(sum.getByText("Clients in total").locator("..")).toContainText("7");
});

test("R4: Not counted shows only the umbrella companies, and Copy these figures copies the sentence", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedAll();
  await page.goto("/past");
  const tile = page.getByRole("button", { name: /^1\s*Not counted/ });
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Showing only these.")).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Halcyon Group"]);
  await expect(parent(page, "Halcyon Group")).toContainText("Not counted");
  await tile.click();
  await expect.poll(() => names(page)).toHaveLength(4);

  await page.getByRole("button", { name: "Copy these figures" }).click();
  await expect(page.getByText("Figures copied, ready to paste")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "We have served 7 clients: 3 parent companies and 4 subsidiaries. 1 umbrella company is on record but not counted. Largest sectors: Retail 4, Food 1, Healthcare 1."
  );
});

test("R4: with every parent counted the tile says so and can't be pressed", async ({ page }) => {
  await seedPast([past("a", { name: "Alpha" }), past("a1", { name: "Alpha Two", parentId: "a" })]);
  await page.goto("/past");
  await expect(page.getByRole("button", { name: /Not counted/ })).toBeDisabled();
  await expect(page.getByText("Every parent company counts.")).toBeVisible();
});

test("R2: parents are cards A to Z; a parent opens its subsidiaries under a branch, and Show all subsidiaries opens every one", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past");
  await showRecord(page, isMobile);
  await expect.poll(() => names(page)).toEqual(["Halcyon Group", "Nusa Retail", "Pelita Foods", "Zeta Works"]);
  await expect(page.getByText("4 parent companies", { exact: false }).first()).toBeVisible();
  await expect(record(page).getByText(", with 4 subsidiaries under them")).toBeVisible();
  await expect(parent(page, "Nusa Retail")).toContainText("3 subsidiaries");
  await expect(parent(page, "Zeta Works")).toContainText("None");
  await expect(parent(page, "Zeta Works").getByRole("button", { name: "No subsidiaries" })).toBeDisabled();

  const nusa = parent(page, "Nusa Retail");
  await nusa.getByRole("button", { name: "Show the subsidiaries of Nusa Retail" }).click();
  const subs = nusa.getByRole("group", { name: "Subsidiaries of Nusa Retail" });
  await expect(subs.getByRole("group").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).resolves.toEqual(["Kencana Mart", "Nusa Online", "Nusa Outlet"]);
  // one sector spelling everywhere, and a subsidiary with none shows its parent's
  await expect(subs.getByRole("group", { name: "Nusa Outlet" })).toContainText("Retail");
  await expect(subs.getByRole("group", { name: "Nusa Online" })).toContainText("Retail");
  await nusa.getByRole("button", { name: "Hide the subsidiaries of Nusa Retail" }).click();
  await expect(subs).toHaveCount(0);

  await toolbar(page).getByRole("button", { name: "Show all subsidiaries" }).click();
  await expect(page.getByRole("group", { name: /^Subsidiaries of / })).toHaveCount(2);
  // the umbrella company explains itself
  await expect(parent(page, "Halcyon Group")).toContainText("Halcyon Group isn’t counted in the totals. Its 1 subsidiary is.");
  await toolbar(page).getByRole("button", { name: "Hide subsidiaries" }).click();
  await expect(page.getByRole("group", { name: /^Subsidiaries of / })).toHaveCount(0);
});

test("R7: search covers names and sectors, highlights, opens the parent that has a match and offers its other subsidiaries", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past");
  await search(page).fill("outlet");
  await showRecord(page, isMobile);
  await expect.poll(() => names(page)).toEqual(["Nusa Retail"]);
  const nusa = parent(page, "Nusa Retail");
  await expect(nusa.getByRole("group", { name: "Nusa Outlet" }).locator("mark")).toHaveText("Outlet");
  await expect(nusa.getByRole("group", { name: "Nusa Online" })).toHaveCount(0);
  await expect(record(page).getByRole("status")).toContainText("1 match: 0 parent companies and 1 subsidiary");
  await nusa.getByRole("button", { name: "Show its other 2 subsidiaries" }).click();
  await expect(nusa.getByRole("group", { name: /^(Kencana Mart|Nusa Online|Nusa Outlet)$/ })).toHaveCount(3);
  expect(new URL(page.url()).searchParams.get("q")).toBe("outlet");

  // a parent that matches lists all of its subsidiaries, and a sector word matches too
  await search(page).fill("nusa");
  await expect.poll(() => names(page)).toEqual(["Nusa Retail"]);
  await expect(parent(page, "Nusa Retail").locator("mark").first()).toHaveText("Nusa");
  await expect(record(page).getByRole("status")).toContainText("3 matches: 1 parent company and 2 subsidiaries");
  await search(page).fill("healthcare");
  await expect.poll(() => names(page)).toEqual(["Halcyon Group"]);
  await expect(parent(page, "Halcyon Group").getByRole("group", { name: "Halcyon Clinic" }).locator("mark")).toHaveText("Healthcare");
});

test("R7: nothing matches says what was searched and Clear search brings the record back", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past?q=zzz");
  await showRecord(page, isMobile);
  await expect(record(page).getByRole("heading", { name: "No past client matches “zzz”" })).toBeVisible();
  await expect(record(page).getByText("Search looks at the names of parent companies and subsidiaries, and at sectors.")).toBeVisible();
  await record(page).getByRole("button", { name: "Clear search" }).click();
  await expect.poll(() => names(page)).toHaveLength(4);
  await expect(search(page)).toHaveValue("");
});

test("R7: the order menu orders the parents, and companies without a sector always go last", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past");
  await showRecord(page, isMobile);
  await toolbar(page).getByRole("button", { name: /Order/ }).click();
  await page.getByRole("menuitemradio", { name: "Most subsidiaries first" }).click();
  await expect.poll(() => names(page)).toEqual(["Nusa Retail", "Halcyon Group", "Pelita Foods", "Zeta Works"]);
  expect(new URL(page.url()).searchParams.get("sort")).toBe("subs-desc");
  await toolbar(page).getByRole("button", { name: /Order/ }).click();
  await page.getByRole("menuitemradio", { name: "Sector, Z to A" }).click();
  await expect.poll(() => names(page)).toEqual(["Nusa Retail", "Pelita Foods", "Halcyon Group", "Zeta Works"]);
  await toolbar(page).getByRole("button", { name: /Order/ }).click();
  await page.getByRole("menuitemradio", { name: "Not counted first" }).click();
  await expect.poll(() => names(page)).toEqual(["Halcyon Group", "Nusa Retail", "Pelita Foods", "Zeta Works"]);
});

test("R5: By sector counts every counted company once, with No sector and a total that equals the client total", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past");
  await showSectors(page, isMobile);
  const panel = sectors(page);
  await expect(panel.getByText("3 sectors, largest first")).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Retail/ })).toContainText("4");
  await expect(panel.getByRole("button", { name: /^Retail/ })).toContainText("57%");
  await expect(panel.getByRole("button", { name: /^Food/ })).toContainText("14%");
  await expect(panel.getByRole("button", { name: /^Healthcare/ })).toContainText("1");
  await expect(panel.getByRole("button", { name: /^No sector/ })).toContainText("1"); // Zeta Works: the umbrella isn't counted
  await expect(panel.getByTestId("sector-total")).toHaveText("7");
  await expect(page.getByTestId("client-total")).toHaveText("7");
});

test("R5: pressing a sector shows its companies in the record (on a phone, the record), pressing it again lets go", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past");
  await showSectors(page, isMobile);
  await sectors(page).getByRole("button", { name: /^Retail/ }).click();
  await expect(page.getByRole("region", { name: "Past clients" })).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Nusa Retail"]);
  await expect(toolbar(page).getByRole("button", { name: /Sector/ })).toContainText("Retail");
  await expect(record(page).getByRole("status")).toContainText("4 matches: 1 parent company and 3 subsidiaries");
  expect(new URL(page.url()).searchParams.get("sec")).toBe("retail");
  await toolbar(page).getByRole("button", { name: "Clear the sector filter" }).click();
  await expect.poll(() => names(page)).toHaveLength(4);

  await toolbar(page).getByRole("button", { name: /Sector/ }).click();
  await page.getByRole("menuitemradio", { name: "No sector" }).click();
  await expect.poll(() => names(page)).toEqual(["Halcyon Group", "Zeta Works"]);
});

test("R5: the breakdown shows the top 8 sectors, and all of them on request", async ({ page, isMobile }) => {
  await seedPast(Array.from({ length: 11 }, (_, i) => past(`s${i}`, { name: `Company ${i}`, sector: `Sector ${String.fromCharCode(65 + i)}` })));
  await page.goto("/past");
  await showSectors(page, isMobile);
  const panel = sectors(page);
  await expect(panel.getByRole("button", { name: /^Sector / })).toHaveCount(8);
  await panel.getByRole("button", { name: "Show all 11 sectors" }).click();
  await expect(panel.getByRole("button", { name: /^Sector / })).toHaveCount(11);
  await panel.getByRole("button", { name: "Show the top 8" }).click();
  await expect(panel.getByRole("button", { name: /^Sector / })).toHaveCount(8);
});

test("A phone has a switch between Companies and By sector; a desktop shows both", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past");
  const switcher = page.getByRole("group", { name: "Show" });
  if (!isMobile) {
    await expect(switcher).toBeHidden();
    await expect(record(page)).toBeVisible();
    await expect(sectors(page)).toBeVisible();
    return;
  }
  await expect(record(page)).toBeVisible();
  await expect(sectors(page)).toBeHidden();
  await switcher.getByRole("button", { name: "By sector" }).click();
  await expect(sectors(page)).toBeVisible();
  await expect(record(page)).toBeHidden();
  expect(new URL(page.url()).searchParams.get("view")).toBe("sectors");
});

test("R7: 130 parents show 100 at a time, and 60 subsidiaries 50 at a time", async ({ page, isMobile }) => {
  await seedPast([
    ...Array.from({ length: 130 }, (_, i) => past(`p${i}`, { name: `Parent ${String(i).padStart(3, "0")}` })),
    ...Array.from({ length: 60 }, (_, i) => past(`k${i}`, { name: `Kid ${String(i).padStart(3, "0")}`, parentId: "p0" })),
  ]);
  await page.goto("/past");
  await showRecord(page, isMobile);
  await expect(parents(page)).toHaveCount(100);
  await expect(record(page).getByText("Showing 100 of 130 parent companies")).toBeVisible();
  await record(page).getByRole("button", { name: "Show 30 more" }).click();
  await expect(parents(page)).toHaveCount(130);

  const first = parent(page, "Parent 000");
  await first.getByRole("button", { name: "Show the subsidiaries of Parent 000" }).click();
  const subs = first.getByRole("group", { name: "Subsidiaries of Parent 000" });
  await expect(subs.getByRole("group")).toHaveCount(50);
  await expect(subs.getByText("Showing 50 of 60")).toBeVisible();
  await subs.getByRole("button", { name: "Show 10 more" }).click();
  await expect(subs.getByRole("group")).toHaveCount(60);
});

test("R1: with nothing on record, the screen says what the record is for", async ({ page }) => {
  await page.goto("/past");
  await expect(page.getByRole("heading", { name: "No past clients yet" })).toBeVisible();
  await expect(page.getByText("so the team can quote how many clients we’ve had")).toBeVisible();
});

test("R3: nothing counted yet (only an umbrella company) says so, and the breakdown explains", async ({ page, isMobile }) => {
  await seedPast([past("u", { name: "Umbrella Holdings", countHead: false })]);
  await page.goto("/past");
  await expect(page.getByTestId("client-total")).toHaveText("0");
  await expect(page.getByText("Nothing is counted yet. 1 umbrella company is kept on record but not counted.")).toBeVisible();
  await showSectors(page, isMobile);
  await expect(sectors(page).getByRole("heading", { name: "No counted companies yet" })).toBeVisible();
  await expect(sectors(page).getByText("Everything on record now is an umbrella company that isn’t counted.")).toBeVisible();
});

test("The view lives in the address: a link lands on the same search, sector and order", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/past?q=nusa&sort=name-desc&view=list");
  await expect(search(page)).toHaveValue("nusa");
  await showRecord(page, isMobile);
  await expect.poll(() => names(page)).toEqual(["Nusa Retail"]);
  await page.reload();
  await expect(search(page)).toHaveValue("nusa");
  await expect(toolbar(page).getByRole("button", { name: /Order/ })).toContainText("Name, Z to A");
});
