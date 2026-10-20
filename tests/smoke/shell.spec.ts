// The app shell (task 2.3, guide 3 and 5.8): every area one step away on large
// screens and two on phones, the current place marked, and no connection shown.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seedGroups, seedTasks, task } from "./data";

const AREAS = [
  { link: "Today", title: "Today", path: "/" },
  { link: "All tasks", title: "Tasks", path: "/tasks" },
  { link: "Plan", title: "Plan", path: "/plan" },
  { link: "Companies", title: "Companies", path: "/companies" },
  { link: "Qualification notes", title: "Qualification notes", path: "/notes" },
  { link: "Past clients", title: "Past clients", path: "/past" },
  { link: "Flows", title: "Flows", path: "/flows" },
];

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" });
const title = (page: Page) => page.getByRole("heading", { level: 1 });
// A link's name also carries its count, as in "All tasks 12".
const named = (label: string) => new RegExp(`^${label}(\\s+\\d+)?$`);

test.describe("large screens", () => {
  test.skip(({ isMobile }) => isMobile, "The side bar is for screens over 900px.");

  test("A4: every area is one step away in the side bar, and marked as the current place", async ({ page }) => {
    await page.goto("/flows");
    for (const area of AREAS) {
      const link = mainNav(page).getByRole("link", { name: named(area.link) });
      await link.click();
      await expect(page).toHaveURL(area.path);
      await expect(title(page)).toHaveText(area.title);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(mainNav(page).locator("[aria-current]")).toHaveCount(1);
    }
  });

  test("A4: a task group is one step away, with its open tasks counted", async ({ page }) => {
    await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
    await seedTasks([task("t1", { taskGroup: "Office move" }), task("t2", { taskGroup: "Office move", completed: true })]);
    await page.goto("/plan");
    const group = mainNav(page).getByRole("link", { name: /Office move/ });
    await expect(group).toContainText("1");
    await group.click();
    await expect(page).toHaveURL("/tasks/groups/g1");
    await expect(title(page)).toHaveText("Office move");
    await expect(group).toHaveAttribute("aria-current", "page");
    await expect(mainNav(page).getByRole("link", { name: named("All tasks") })).not.toHaveAttribute("aria-current");
  });
});

test.describe("phones", () => {
  test.skip(({ isMobile }) => !isMobile, "The tab bar is for 900px and under.");

  test("A4: Today, Tasks and Companies are one tap away, and the rest two taps through More", async ({ page }) => {
    await page.goto("/plan");
    const tabs = mainNav(page);
    for (const area of [AREAS[0], AREAS[1], AREAS[3]]) {
      const tab = tabs.getByRole("link", { name: area.link === "All tasks" ? "Tasks" : area.link, exact: true });
      await tab.click();
      await expect(page).toHaveURL(area.path);
      await expect(title(page)).toHaveText(area.title);
      await expect(tab).toHaveAttribute("aria-current", "page");
    }
    const more = tabs.getByRole("button", { name: "More" });
    for (const area of [AREAS[2], AREAS[4], AREAS[5], AREAS[6]]) {
      await more.click();
      const sheet = page.getByRole("dialog", { name: "More" });
      await sheet.getByRole("link", { name: new RegExp(`^${area.link}`) }).click();
      await expect(page).toHaveURL(area.path);
      await expect(title(page)).toHaveText(area.title);
      await expect(sheet).toBeHidden();
      await expect(more).toHaveAttribute("aria-current", "page");
    }
  });

  test("A4: More closes with Esc, the back gesture, or Close, and gives focus back", async ({ page }) => {
    await page.goto("/");
    const more = mainNav(page).getByRole("button", { name: "More" });
    const sheet = page.getByRole("dialog", { name: "More" });

    await more.click();
    await expect(sheet.getByRole("link", { name: /^Plan/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL("/");
    await expect(more).toBeFocused();

    await more.click();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL("/");

    await more.click();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL("/");
  });

  test("A1: the + in the tab bar opens a new task over the current screen", async ({ page }) => {
    await page.goto("/companies");
    await mainNav(page).getByRole("link", { name: "New task" }).click();
    await expect(page).toHaveURL("/companies?task=new");
  });
});

test("A3: with no connection a banner says so, and a toast says when it's back", async ({ page, context }) => {
  await page.goto("/tasks");
  await expect(title(page)).toHaveText("Tasks");
  await context.setOffline(true);
  await expect(page.getByText("No connection.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Back online. Everything is up to date.")).toBeVisible();
  await expect(page.getByText("No connection.")).toBeHidden();
});
