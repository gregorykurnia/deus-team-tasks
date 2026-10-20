import { test, expect } from "./fixtures";

test("the app opens against the emulator", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
