// Companies (task 3.8, guide 6.5, 4.9, 4.10): the four group tiles, where to act on Active, filters, sort, search with
// "found in other groups", and the list with its empty and loading states. Nothing here writes data; editing comes with 3.9.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies } from "./data";

const tile = (page: Page, name: string) => page.getByRole("group", { name: "Groups of companies" }).getByRole("button", { name: new RegExp(`^${name}`) });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Filter and sort" });
const filter = (page: Page, name: string | RegExp) => toolbar(page).getByRole("button", { name });
const search = (page: Page) => page.getByRole("searchbox", { name: "Search companies" });
const panel = (page: Page, name: string) => page.getByRole("region", { name });
const rows = (page: Page) => page.getByRole("article");
const row = (page: Page, name: string) => page.getByRole("article", { name });
// The companies listed, in order.
const names = (page: Page) => rows(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

async function seedAll() {
  await seedCompanies([
    company(1, { company: "Pelita Foods", pic: "Rina", status: "To Follow Up", priority: "High", date: isoDay(-20), target: isoDay(-2), product: "Wifi, CCTV" }),
    company(2, { company: "Borneo Retail", pic: "Dewi", status: "Meeting Soon", priority: "Low", date: isoDay(-1), target: isoDay(10), product: "wifi" }),
    company(3, { company: "Citra Mart", status: "Waiting For Our Actions", date: isoDay(-9), product: "POS" }),
    company(4, { company: "Halcyon Logistics", status: "Client / Partner Done Deal", pic: "Ahmad", date: isoDay(-3) }),
    company(5, { company: "Pelita Hotels", _raw: true, industry: "Hospitality", reach: isoDay(5), priority: "Medium" }),
    company(6, { company: "Delta Works", _hold: true, answer: "Not now", reason: "Budget frozen until Q2", product: "CCTV" }),
  ]);
}

test("B1, B2: the four groups are sized, Active opens first, and a tile switches the list", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();
  await expect(page.getByText("6 companies").first()).toBeVisible();
  await expect(tile(page, "To approach")).toContainText("1");
  await expect(tile(page, "Active")).toContainText("3");
  await expect(tile(page, "Active")).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page, "Active").getByText("3 active prospects")).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Borneo Retail", "Citra Mart", "Pelita Foods"]); // most recent action first

  await tile(page, "Deal done").click();
  await expect(page).toHaveURL("/companies?group=deal-done");
  await expect(panel(page, "Deal done").getByText("1 client", { exact: true })).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Halcyon Logistics"]);
  await expect(page.getByRole("region", { name: "Where to act" })).toHaveCount(0); // Active only
  await expect(page.getByText("Ahmad")).toBeVisible(); // the contact under the name
});

test("B6, B7: where to act counts out of the active prospects and each card is a filter", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  const wta = page.getByRole("region", { name: "Where to act" });
  await expect(wta.getByRole("button", { name: /Gone cold/ })).toContainText("1");
  await expect(wta.getByRole("button", { name: /Gone cold/ })).toContainText("of 3");
  await expect(wta.getByRole("button", { name: /Waiting on our follow-up/ })).toContainText("1");
  await expect(wta.getByRole("button", { name: /High priority/ })).toContainText("1");
  await expect(wta.getByRole("button", { name: /Target date close or missed/ })).toContainText("1");

  await wta.getByRole("button", { name: /Gone cold/ }).click();
  await expect(page).toHaveURL("/companies?act=gone-cold");
  await expect.poll(() => names(page)).toEqual(["Pelita Foods"]);
  await expect(page.getByText(/1 of 3 active prospects match/)).toBeVisible();
  await wta.getByRole("button", { name: /Gone cold/ }).click(); // pressing it again lets go
  await expect(rows(page)).toHaveCount(3);
});

test("B8: Status, Priority and Product narrow the list, show their value, and clear with ×", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await filter(page, "Priority").click();
  await page.getByRole("menuitemradio", { name: "High" }).click();
  await expect(filter(page, /^Priority\s*High/)).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Pelita Foods"]);
  await expect(page).toHaveURL("/companies?priority=High");
  await filter(page, "Clear the priority filter").click();
  await expect(rows(page)).toHaveCount(3);

  // Product spellings are merged: "Wifi" and "wifi" are one product.
  await filter(page, "Product").click();
  await expect(page.getByRole("menuitemradio", { name: "Wifi (2)" })).toBeVisible();
  await page.getByRole("menuitemradio", { name: "Wifi (2)" }).click();
  await expect.poll(() => names(page)).toEqual(["Borneo Retail", "Pelita Foods"]);

  await filter(page, "Clear the product filter").click();
  await filter(page, "Status").click();
  await page.getByRole("menuitemradio", { name: "Meeting Soon" }).click();
  await expect.poll(() => names(page)).toEqual(["Borneo Retail"]);

  // To approach has Priority but no Status or Product.
  await tile(page, "To approach").click();
  await expect(filter(page, "Priority")).toBeVisible();
  await expect(filter(page, "Status")).toHaveCount(0);
  await expect(filter(page, "Product")).toHaveCount(0);
});

test("B9: the sort menu and the column heads order the list, empty values last either way round", async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/companies");
  await expect(filter(page, /^Sort\s*Last action, most recent first/)).toBeVisible();
  await filter(page, /^Sort/).click();
  await page.getByRole("menuitemradio", { name: "Target date" }).click();
  await expect(filter(page, /^Sort\s*Target date, earliest first/)).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Pelita Foods", "Borneo Retail", "Citra Mart"]); // no target date goes last
  await filter(page, /^Sort/).click();
  await page.getByRole("menuitemradio", { name: "Latest first" }).click();
  await expect.poll(() => names(page)).toEqual(["Borneo Retail", "Pelita Foods", "Citra Mart"]);
  await expect(page).toHaveURL("/companies?sort=target&dir=desc");

  if (isMobile) return; // phones have no column heads: the Sort menu is all there is
  await page.getByRole("button", { name: "Company", exact: true }).click(); // a column head
  await expect.poll(() => names(page)).toEqual(["Borneo Retail", "Citra Mart", "Pelita Foods"]);
  await page.getByRole("button", { name: /^Company\s*, sorted ascending/ }).click();
  await expect.poll(() => names(page)).toEqual(["Pelita Foods", "Citra Mart", "Borneo Retail"]);
});

test("B8: search covers the group, highlights what matched, and says where else it found something", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  await expect(rows(page)).toHaveCount(3); // typing before the page is ready would be lost
  await search(page).fill("pelita");
  await expect.poll(() => names(page)).toEqual(["Pelita Foods"]);
  await expect(page.locator("mark")).toHaveText("Pelita");
  await expect(page).toHaveURL("/companies?q=pelita");

  await tile(page, "Deal done").click(); // the search carries over
  await expect(page.getByRole("heading", { name: "No clients match" })).toBeVisible();
  await expect(page.getByText("Nothing in Deal done matches “pelita”.")).toBeVisible();
  const elsewhere = page.getByText("Found in other groups:").locator("..");
  await expect(elsewhere.getByRole("button", { name: /^1\s*To approach/ })).toBeVisible();
  await expect(elsewhere.getByRole("button", { name: /^1\s*Active/ })).toBeVisible();
  await elsewhere.getByRole("button", { name: /To approach/ }).click();
  await expect.poll(() => names(page)).toEqual(["Pelita Hotels"]);
  await expect(search(page)).toHaveValue("pelita");

  await search(page).fill("Budget frozen"); // the reason is searched in No or not now only
  await expect(page.getByRole("heading", { name: "No companies to approach match" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect.poll(() => names(page)).toEqual(["Pelita Hotels"]);
});

test("B3: the cells say what they are: a chip, a date in words, a missed target in red", async ({ page }) => {
  await seedAll();
  await page.goto("/companies");
  const pelita = row(page, "Pelita Foods");
  await expect(pelita.getByText("To Follow Up")).toBeVisible();
  await expect(pelita.getByText("20 days ago")).toBeVisible();
  await expect(pelita.getByText("Missed by 2 days")).toBeVisible();
  await expect(pelita.getByText("Status", { exact: true })).toBeAttached(); // the label, for screen readers
  await expect(row(page, "Citra Mart").getByText("empty").first()).toBeAttached(); // an empty value is a dash
});

test("B2: a group with nobody in it, and no companies at all, say so", async ({ page }) => {
  await seedCompanies([company(1, { company: "Pelita Foods" })]);
  await page.goto("/companies?group=deal-done");
  await expect(page.getByRole("heading", { name: "No deals done yet" })).toBeVisible();
  await expect(tile(page, "Deal done")).toContainText("0");
});

test("B1: with no companies, Companies says nothing is recorded yet", async ({ page }) => {
  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "No companies yet" })).toBeVisible();
  await expect(page.getByText("Only the name is needed.")).toBeVisible();
});

test("5.7: the list shows 100 rows, then 'Show 100 more'", async ({ page }) => {
  await seedCompanies(Array.from({ length: 130 }, (_, i) => company(i + 1, { company: `Firm ${String(i + 1).padStart(3, "0")}`, date: isoDay(-(i % 5)) })));
  await page.goto("/companies?sort=company");
  await expect(rows(page)).toHaveCount(100);
  await expect(page.getByText("Showing 100 of 130")).toBeVisible();
  await page.getByRole("button", { name: "Show 30 more" }).click();
  await expect(rows(page)).toHaveCount(130);
  await expect(page.getByText(/^Showing/)).toHaveCount(0);
});

test("5.13: on a phone the tiles go two by two and each company is a card with labelled details", async ({ page, isMobile }) => {
  test.skip(isMobile, "Sets its own phone width; the desktop project runs it.");
  await seedAll();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/companies");
  const a = await tile(page, "To approach").boundingBox();
  const b = await tile(page, "Active").boundingBox();
  const c = await tile(page, "Deal done").boundingBox();
  expect(a!.y).toBe(b!.y); // two across
  expect(c!.y).toBeGreaterThan(a!.y);
  await expect(search(page)).toBeVisible(); // under the title
  const card = row(page, "Pelita Foods");
  await expect(card.getByText("Last action", { exact: true })).toBeVisible(); // the label shows
  await expect(card.getByText("Missed by 2 days")).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
});
