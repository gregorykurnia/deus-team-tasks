// R1ec: the page-level empty/offline heading, its actions and the two audit sizes.
import { test, expect } from "./fixtures";

for (const offline of [false, true]) {
  test(`empty flow headings ${offline ? "offline" : "online"}`, { tag: "@phone" }, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (offline) await page.route(/127\.0\.0\.1:8180/, (route) => route.abort());
    await page.goto("/flows");
    const message = page.getByRole("heading", { name: offline ? "No connection" : "No flows yet", exact: true });
    await expect(message).toBeVisible({ timeout: 30_000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    // Verify navigation and save its native-size crop before the full frame.
    const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(navigation).toBeInViewport();
    expect(await navigation.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await navigation.screenshot({ path: info.outputPath(`${offline ? "offline" : "empty"}-navigation.png`) });
    await page.screenshot({ path: info.outputPath(`${offline ? "offline" : "empty"}.png`), animations: "disabled" });
    expect(await message.evaluate((el) => el.tagName)).toBe("H2");
    await expect(message).toBeInViewport();
    const content = message.locator("..");
    if (!offline) {
      const action = content.getByRole("button", { name: "New flow", exact: true });
      await expect(action).toBeInViewport();
      await action.click({ trial: true });
    }
    expect(await content.evaluate((section) => {
      const faults: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth) faults.push("page overflows horizontally");
      for (const el of section.querySelectorAll<HTMLElement>("h2,p,button")) {
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth || box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) faults.push(`clipped ${el.textContent}`);
        if (!el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))) faults.push(`covered ${el.textContent}`);
      }
      return faults;
    })).toEqual([]);
    expect(errors).toEqual([]);
  });
}
