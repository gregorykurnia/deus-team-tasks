// R1e: regression checks for the task-cell names and portalled menu landmarks.
// Run at the two audit sizes; --output keeps before/after captures separate.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, task } from "./data";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await seedCompanies([company(1, { company: "Cedar Studio" })]);
  await seedTasks([
    task("undated", { task: "Arrange the project call", linkedClientId: 1, lastActionDate: isoDay(-2) }),
    task("started", { task: "Prepare the agenda", linkedClientId: 1, startDate: isoDay(-1), lastActionDate: isoDay(-9) }),
    task("late", { task: "Review the draft", linkedClientId: 1, endDate: isoDay(-2), lastActionDate: isoDay(-15) }),
  ]);
  await page.goto("/tasks");
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
  await expect(page.getByRole("link", { name: "Arrange the project call", exact: true })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  const faults = await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push("page wider than viewport");
    for (const el of document.querySelectorAll<HTMLElement>("button[data-col]")) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.bottom > innerHeight || box.top < 0) continue;
      if (el.scrollWidth > el.clientWidth) issues.push(`clipped ${el.getAttribute("aria-label")}`);
      if (!el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))) issues.push(`covered ${el.getAttribute("aria-label")}`);
    }
    if ([...document.images].some((image) => image.getClientRects().length && (!image.complete || !image.naturalWidth))) issues.push("unloaded visible image");
    return issues;
  });
  expect(faults).toEqual([]);
});

test("task dates keep their visible words in their accessible names", { tag: "@phone" }, async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath("task-dates.png"), animations: "disabled" });
  const result = await new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]).analyze();
  expect(result.violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await expect(page.getByRole("button", { name: "Deadline: No dates. Change", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deadline: No deadline. Change", exact: true })).toBeVisible();
});

test("portalled Details menu has a landmark and keeps keyboard focus and placement", { tag: "@phone" }, async ({ page }, info) => {
  const trigger = page.getByRole("button", { name: /Details shown/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Details shown", exact: true });
  await expect(menu).toBeVisible();
  await page.screenshot({ path: info.outputPath("details-menu.png"), animations: "disabled" });
  const result = await new AxeBuilder({ page }).withRules(["region"]).analyze();
  expect(result.violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  const box = await menu.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.y).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 12);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 12);
  await page.keyboard.press("ArrowDown");
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("End");
  const lastItem = menu.getByRole("menuitem").last();
  await expect(lastItem).toBeFocused();
  await expect(lastItem).toBeInViewport();
  expect(await lastItem.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  await page.screenshot({ path: info.outputPath("details-menu-bottom.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
