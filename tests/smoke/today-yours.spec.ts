// Your tasks and Mine on Today (N36, provisional): what the signed-in person sees of their own work.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { isoDay, seedTasks, task } from "./data";
import { readAll, seed } from "../support/emulator";

const EMAIL = "audrey.wijaya@deushcs.com";
const OWNER = { Authorization: "Bearer owner" };

const yours = (page: Page) => page.getByRole("region", { name: "Your tasks" });
const needs = (page: Page) => page.getByRole("region", { name: "Needs attention" });

async function signIn(page: Page) {
  await page.goto("/sign-in?next=%2F");
  await page.getByRole("textbox", { name: "Work email" }).fill(EMAIL);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Digit 1", exact: true })).toBeEnabled();
  const mail = (await readAll("tasks", "_fakeMail")).find((m) => m.to === EMAIL);
  await page.getByRole("textbox", { name: "Digit 1", exact: true }).evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, String(mail?.code ?? ""));
  await expect(page).toHaveURL("/");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" }));
  await expect(async () => {
    expect((await fetch("http://127.0.0.1:9199/emulator/v1/projects/demo-deus/accounts", { method: "DELETE", headers: OWNER })).ok).toBe(true);
  }).toPass({ timeout: 15_000 });
  await seed("tasks", "people", [{ id: EMAIL, email: EMAIL, name: "Audrey", active: true }]);
});

async function seedTeam() {
  await seedTasks([
    task("a-late", { task: "Send the proposal", responsible: ["Audrey"], endDate: isoDay(-2) }),
    task("a-today", { task: "Prepare the monthly report", responsible: ["Audrey"], endDate: isoDay(0) }),
    task("a-later", { task: "Plan the offsite", responsible: ["Audrey"], endDate: isoDay(20) }),
    task("b-late", { task: "Chase the invoice", responsible: ["Bayu"], endDate: isoDay(-3) }),
    task("b-soon", { task: "Book the venue", responsible: ["Bayu"], endDate: isoDay(1) }),
  ]);
}

test("N36: signed out, Today has no Your tasks and no Mine", async ({ page }) => {
  await seedTeam();
  await page.goto("/");
  await expect(needs(page).getByText("Chase the invoice")).toBeVisible();
  await expect(yours(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mine" })).toHaveCount(0);
});

test("N36: the signed-in person sees their own due work first, and Mine narrows Needs attention", { tag: "@phone" }, async ({ page }) => {
  await seedTeam();
  await signIn(page);
  const panel = yours(page);
  await expect(panel.getByText("1 overdue · 1 due today")).toBeVisible();
  await expect(panel.getByText("Send the proposal")).toBeVisible();
  await expect(panel.getByText("Prepare the monthly report")).toBeVisible();
  await expect(panel.getByText("Chase the invoice")).toHaveCount(0);
  await expect(panel.getByText("Plan the offsite")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "See all your tasks" })).toHaveAttribute("href", "/plan?view=people&person=Audrey");

  const list = needs(page);
  const mine = list.getByRole("button", { name: "Mine" });
  await expect(mine).toHaveAttribute("aria-pressed", "false");
  await expect(list.getByText("Chase the invoice")).toBeVisible();
  await mine.click();
  await expect(mine).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByText("Chase the invoice")).toHaveCount(0);
  await expect(list.getByText("Send the proposal")).toBeVisible();
  await expect(list.getByRole("link", { name: "See all your tasks" })).toHaveAttribute("href", "/plan?view=people&person=Audrey");
  await expect(list.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: /^All\s*2$/ })).toBeVisible();

  await list.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: /^Prospects/ }).click();
  await expect(list.getByRole("heading", { name: "None of your prospect tasks need attention" })).toBeVisible();
  await list.getByRole("button", { name: "Show everyone’s" }).click();
  await expect(mine).toHaveAttribute("aria-pressed", "false");
});

test("N36: Your tasks says so when nothing of theirs is due", async ({ page }) => {
  await seedTasks([task("a-later", { task: "Plan the offsite", responsible: ["Audrey"], endDate: isoDay(20) })]);
  await signIn(page);
  await expect(yours(page).getByText("Nothing of yours is overdue or due in the next three days.")).toBeVisible();
});
