// Overlays on the dev gallery (task 2.5, guide 4.3, 4.11, 4.14): keyboard-only use works, focus goes in and comes back,
// Esc closes the top one, and toasts stack, expire and sit above the tab bar.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const opener = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { level: 2, name: /^Overlays/ })).toBeVisible();
});

test.describe("menus", () => {
  test("a menu opens below its button, focuses the chosen item, and moves with the arrow keys", async ({ page }) => {
    const button = opener(page, "Menu: pick one");
    // The overlays sit at the foot of the page, where a menu would flip above; pin this button near the top.
    await button.evaluate((el) => {
      el.style.cssText = "position:fixed;left:40px;top:40px;z-index:5";
    });
    await button.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Due" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Within 3 days" })).toBeFocused();
    const box = (await menu.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);

    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitemradio", { name: "Later" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitemradio", { name: "Overdue" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(page.getByText("Picked: Overdue")).toBeVisible();
  });

  test("Esc closes a menu and gives focus back to its button", async ({ page }) => {
    const button = opener(page, "Menu: pick several");
    await button.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Product" });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Space");
    await expect(menu).toBeVisible(); // picking several keeps it open
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("a menu near the bottom opens above its button and stays 12px inside the window", { tag: "@phone" }, async ({ page }) => {
    const button = opener(page, "Menu: palette");
    // At the right edge, clear of the dev indicator at the bottom left.
    await button.evaluate((el) => {
      el.style.cssText = "position:fixed;right:20px;bottom:10px;z-index:5";
    });
    await button.click();
    const menu = page.getByRole("menu", { name: "Colour" });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(buttonBox.y);
    expect(box.y).toBeGreaterThanOrEqual(12);
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 12);
  });

  test("a click outside closes a menu", async ({ page }) => {
    await opener(page, "Menu: number").click();
    const menu = page.getByRole("menu", { name: "No action for" });
    await expect(menu).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(menu).toBeHidden();
  });
});

test.describe("sheets and dialogs", () => {
  test("a sheet keeps focus inside, locks the page, and Esc closes it and returns focus", async ({ page }) => {
    const button = opener(page, "Sheet");
    await button.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "New task" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Description")).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test("Esc in a name picker inside a sheet closes the names, not the sheet", async ({ page }) => {
    await opener(page, "Sheet").click();
    const sheet = page.getByRole("dialog", { name: "New task" });
    const picker = sheet.getByRole("combobox", { name: "Responsible" });
    await picker.fill("na");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("a click on the scrim closes a sheet", async ({ page }) => {
    await opener(page, "Short sheet").click();
    const sheet = page.getByRole("dialog", { name: "Quick capture" });
    await expect(sheet).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(sheet).toBeHidden();
  });

  test("on a phone a sheet is a bottom sheet, full width", { tag: "@phone" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, "Phones only.");
    await opener(page, "Sheet").click();
    const sheet = page.getByRole("dialog", { name: "New task" });
    const viewport = page.viewportSize()!;
    // It rises into place, so wait for it to settle.
    await expect.poll(async () => {
      const box = (await sheet.boundingBox())!;
      return [box.x, box.width, Math.round(box.y + box.height)];
    }).toEqual([0, viewport.width, viewport.height]);
  });

  test("a confirmation focuses Cancel first, and Esc closes it", async ({ page }) => {
    const button = opener(page, "Confirm");
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Delete this task?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Delete task" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("a confirmation over a sheet closes first, then the sheet", async ({ page }) => {
    await opener(page, "Confirm over a sheet").click();
    const sheet = page.getByRole("dialog", { name: "Task details" });
    await expect(sheet).toBeVisible();
    // By keyboard: on a phone the dev indicator sits over this button's corner.
    await sheet.getByRole("button", { name: "Delete", exact: true }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Delete this task?" });
    await expect(dialog).toBeVisible();
    const sheetZ = await sheet.evaluate((el) => Number(getComputedStyle(el).zIndex));
    const dialogZ = await dialog.evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(dialogZ).toBeGreaterThan(sheetZ);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("confirming runs the action once and closes the dialog", async ({ page }) => {
    await opener(page, "Confirm").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByText("Confirmed: Delete task")).toBeVisible();
  });
});

test.describe("toasts", () => {
  test("a toast confirms, stacks with the next, and has an action that works once", async ({ page }) => {
    await opener(page, "Toast").click();
    await opener(page, "Toast with action").click();
    const status = page.getByRole("status").filter({ hasText: "Marked done" });
    await expect(status.getByText("Saved")).toBeVisible();
    await status.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone: Marked done")).toBeVisible();
    await expect(status.getByRole("button", { name: "Undo" })).toBeHidden();
  });

  test("an error toast says what failed", async ({ page }) => {
    await opener(page, "Error toast").click();
    await expect(page.getByText("No connection. The task wasn’t added.")).toBeVisible();
  });

  test("a toast is gone after about five seconds", async ({ page }) => {
    await opener(page, "Toast").click();
    const toast = page.getByText("Saved");
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 7000 });
  });

  test("on a phone toasts sit above where the tab bar goes", { tag: "@phone" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, "Phones only.");
    await opener(page, "Toast").click();
    const box = (await page.getByText("Saved").boundingBox())!;
    expect(page.viewportSize()!.height - (box.y + box.height)).toBeGreaterThanOrEqual(100);
  });
});

test.describe("busy, placement and timing (R2.1)", () => {
  test("a busy confirmation can't be closed, keeps focus on its button, and closes when the action is done", async ({ page }) => {
    await opener(page, "Confirm, slow").click();
    const dialog = page.getByRole("alertdialog", { name: "Delete this task group?" });
    const confirm = dialog.getByRole("button", { name: "Delete group" });
    await confirm.focus();
    await page.keyboard.press("Enter");
    const busy = dialog.getByRole("button", { name: "Deleting…" });
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).toBeFocused(); // a disabled button would have sent focus to the page
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Enter"); // pressed again while busy: ignored
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Confirmed after a moment: Delete group")).toHaveCount(1);
  });

  test("a menu too tall for either side opens on the roomier one and scrolls, never over its button", { tag: "@phone" }, async ({ page }) => {
    const button = opener(page, "Menu: pick several");
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 260 });
    await button.evaluate((el) => {
      el.style.cssText = "position:fixed;left:40px;top:150px;z-index:5";
    });
    await button.click();
    const menu = page.getByRole("menu", { name: "Product" });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(buttonBox.y); // above: 142px there, 62px below
    expect(box.y).toBeGreaterThanOrEqual(12);
  });

  test("a menu stays with its button when the window changes size", { tag: "@phone" }, async ({ page }) => {
    const button = opener(page, "Menu: pick one");
    await button.evaluate((el) => {
      el.style.cssText = "position:fixed;right:40px;top:40px;z-index:5";
    });
    await button.click();
    const menu = page.getByRole("menu", { name: "Due" });
    await expect(menu).toBeVisible();
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: width - 100, height });
    await expect.poll(async () => {
      const m = (await menu.boundingBox())!;
      const b = (await button.boundingBox())!;
      return Math.round(m.y - (b.y + b.height));
    }).toBe(8);
    const m = (await menu.boundingBox())!;
    const inner = await page.evaluate(() => window.innerWidth); // on a phone the page can be wider than the window set
    expect(m.x + m.width).toBeLessThanOrEqual(inner - 12);
  });

  test("a toast waits while the pointer is over it", async ({ page }) => {
    await opener(page, "Toast with action").click();
    const toast = page.getByText("Marked done");
    await expect(toast).toBeVisible();
    await toast.hover();
    await page.waitForTimeout(6000); // past its 5.2 seconds
    await expect(toast).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(toast).toBeHidden({ timeout: 7000 });
  });
});
