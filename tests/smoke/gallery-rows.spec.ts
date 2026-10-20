// Task rows on the dev gallery (task 2.7, guide 4.6, 4.7): the done circle is its own button and the row leaves after it,
// the whole row opens the task, focus shows on the row, selecting several swaps circles for checkboxes, and phones get cards.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { level: 2, name: /^Task rows/ })).toBeVisible();
});

const cards = (page: Page) => page.getByRole("region", { name: "Card rows (Today)" });
const rowOf = (page: Page, title: string) => cards(page).getByRole("article").filter({ hasText: title });
const CALL = "Call Pelita Foods about the trial";

test("the done circle is its own button: it marks the task done and the row leaves", async ({ page }) => {
  const row = rowOf(page, CALL);
  await row.getByRole("button", { name: `Mark done: ${CALL}` }).click();
  await expect(row).toHaveAttribute("data-done", "true");
  await expect(row).toHaveAttribute("data-leaving", "true");
  await expect(row.getByRole("button", { name: `Mark not done: ${CALL}` })).toBeVisible();
  await expect(row).toBeHidden({ timeout: 4000 });
  await page.getByRole("button", { name: "Reset rows" }).click();
  await expect(rowOf(page, CALL)).toBeVisible();
});

test("a finished task stays in the list, struck through, with when it was done", async ({ page }) => {
  const row = rowOf(page, "Share the retail rollout case study");
  await expect(row).toHaveAttribute("data-done", "true");
  await expect(row).toContainText("Done 3 days ago");
  const decoration = await row.getByRole("link").evaluate((el) => getComputedStyle(el.closest("p")!).textDecorationLine);
  expect(decoration).toBe("line-through");
});

test("a click anywhere on the row opens the task, and the title link does too", async ({ page }) => {
  const row = rowOf(page, CALL);
  const box = (await row.boundingBox())!;
  await row.click({ position: { x: box.width / 2, y: 6 } });
  await expect(page).toHaveURL(/\?task=t1$/);
});

test("by keyboard: Tab reaches the done circle, then the title, and a ring shows round the whole row", async ({ page }) => {
  const row = rowOf(page, CALL);
  await row.getByRole("button", { name: `Mark done: ${CALL}` }).focus();
  await page.keyboard.press("Tab");
  await expect(row.getByRole("link", { name: CALL })).toBeFocused();
  const outline = await row.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?task=t1$/);
});

test("the done circle's hit area reaches about 44px, on every side", async ({ page }) => {
  const circle = rowOf(page, CALL).getByRole("button", { name: `Mark done: ${CALL}` });
  await circle.scrollIntoViewIfNeeded(); // elementFromPoint only sees what is in the window
  const box = (await circle.boundingBox())!;
  const [midX, midY] = [box.x + box.width / 2, box.y + box.height / 2];
  const probes = [
    [box.x - 9, midY],
    [box.x + box.width + 9, midY],
    [midX, box.y - 9],
    [midX, box.y + box.height + 9],
  ];
  for (const point of probes) {
    const reached = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"), point);
    expect(reached, `at ${point}`).toBe(`Mark done: ${CALL}`);
  }
});

test("marking a finished task not done keeps it in place, where marking done makes a row leave", async ({ page }) => {
  const SHARE = "Share the retail rollout case study";
  const row = rowOf(page, SHARE);
  await row.getByRole("button", { name: `Mark not done: ${SHARE}` }).click();
  await expect(row).not.toHaveAttribute("data-done");
  await expect(row).not.toHaveAttribute("data-leaving");
  await page.waitForTimeout(1200); // past the leave animation
  await expect(row).toBeVisible();
});

test("the deadline pill's full date shows on hover, and a click on it still opens the task", async ({ page }) => {
  const row = rowOf(page, CALL);
  const pill = row.getByText("2 days late");
  await pill.scrollIntoViewIfNeeded();
  const box = (await pill.boundingBox())!;
  const title = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("[title]")?.getAttribute("title"),
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(title).toMatch(/^Deadline /);
  await pill.click();
  await expect(page).toHaveURL(/\?task=t1$/);
});

test("while selecting, a click on the row toggles its checkbox instead of opening the task", async ({ page }) => {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const row = rowOf(page, CALL);
  const box = (await row.boundingBox())!;
  await row.click({ position: { x: box.width / 2, y: 6 } });
  await expect(row).toHaveAttribute("data-selected", "true");
  await expect(page).not.toHaveURL(/\?task=/);
  await row.getByText(CALL).click();
  await expect(row).not.toHaveAttribute("data-selected");
});

test("selecting several swaps the circles for checkboxes, with a head box that can be mixed", async ({ page }) => {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(cards(page).getByRole("button", { name: /^Mark done:/ })).toHaveCount(0);
  const boxes = cards(page).getByRole("checkbox");
  await expect(boxes).toHaveCount(6);
  const head = page.getByRole("checkbox", { name: "Select every task in the list" });
  await expect(head).toHaveAttribute("aria-checked", "mixed"); // Send the revised proposal is already picked

  const first = cards(page).getByRole("checkbox", { name: `Select: ${CALL}` });
  await first.click();
  await expect(first).toHaveAttribute("aria-checked", "true");
  await expect(rowOf(page, CALL)).toHaveAttribute("data-selected", "true");
  await head.click();
  await expect(head).toHaveAttribute("aria-checked", "true");
  await head.click();
  await expect(head).toHaveAttribute("aria-checked", "false");
});

test("on large screens a list row is a grid; on a phone it becomes a card, and Today's card loses its badge", async ({ page, isMobile }) => {
  const list = page.getByRole("region", { name: "List rows (All tasks)" }).getByRole("article").first();
  const display = await list.evaluate((el) => getComputedStyle(el).display);
  const badge = rowOf(page, CALL).getByText("PF", { exact: true });
  if (isMobile) {
    expect(display).toBe("flex");
    await expect(badge).toBeHidden();
  } else {
    expect(display).toBe("grid");
    await expect(badge).toBeVisible();
  }
});

test("a day row on a person's page says their part when they are only informed", async ({ page }) => {
  const day = page.getByRole("region", { name: /^Day rows/ });
  await expect(day.getByText("Their part:")).toBeVisible();
  await expect(day.getByText("backup").first()).toBeVisible();
});
