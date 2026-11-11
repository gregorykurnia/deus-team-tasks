// R1b.F1: only a confirmed company snapshot can initialize a linked task draft.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { company, isoDay, seedCompanies, seedTasks, settledOnline, storedById, task } from "./data";
import { EMULATOR_HOST, openClientTrackerRules, PROJECTS } from "../support/emulator";

const sheet = (page: Page) => page.getByRole("dialog", { name: "Task", exact: true });
// The development error badge describes the deliberate network failures, not part of the shipped screen.
const screenshot = { animations: "disabled" as const, style: "nextjs-portal { display: none; }" };

async function seedLinkedTask() {
  await seedCompanies([company(1, { company: "Halcyon Logistics", status: "Client / Partner Done Deal", date: isoDay(-8), target: isoDay(18) })]);
  await seedTasks([
    task("linked", { task: "Review company draft", linkedClientId: 1, startDate: isoDay(1), endDate: isoDay(5), lastActionDate: isoDay(-3) }),
    task("other", { task: "Independent company dates", linkedClientId: 1, startDate: isoDay(9), endDate: isoDay(15), lastActionDate: isoDay(-6) }),
  ]);
}

test("R1b.F1: delayed company opens the right draft and reconnect preserves typing, link and dates", { tag: "@phone" }, async ({ page, context }, testInfo) => {
  await seedLinkedTask();
  const before = await storedById("tasks", "tasks", "linked");
  const other = await storedById("tasks", "tasks", "other");
  const companyBefore = await storedById("clients", "pipeline", 1);
  let delayed = true;
  let held = 0;
  await page.route(/127\.0\.0\.1:8180\/.*Listen\/channel/, async (route) => {
    if (delayed && decodeURIComponent(route.request().url()).includes(PROJECTS.clients)) {
      held++;
      await route.abort();
      return;
    }
    await route.continue();
  });
  try {
    await page.goto("/tasks?task=linked");
    await expect.poll(() => held).toBeGreaterThan(0);
    // Firestore emits its empty device snapshot once the company stream is unreachable. Tasks use a separate stream.
    await expect(sheet(page).getByLabel("Description").or(sheet(page).getByText("Loading the company", { exact: true }))).toBeAttached({ timeout: 25_000 });
    await expect(sheet(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("company-waiting.png"), ...screenshot });
    await expect(sheet(page).getByText("Loading the company", { exact: true })).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Save changes" })).toHaveCount(0);
    expect(await storedById("tasks", "tasks", "linked")).toEqual(before);
    await context.setOffline(true);
    await expect(sheet(page).getByText("No connection", { exact: true })).toBeVisible();
    await expect(sheet(page).getByLabel("Description")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("company-offline.png"), ...screenshot });
  } finally {
    delayed = false;
  }
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(sheet(page).getByText("Client work", { exact: true })).toBeVisible();
  await expect(sheet(page).getByText("Halcyon Logistics", { exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Open company" })).toHaveAttribute("href", "/companies?company=1");
  await expect(sheet(page).getByRole("button", { name: "A company", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Back online. Everything is up to date.", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("company-loaded.png"), ...screenshot });
  const description = sheet(page).getByLabel("Description");
  await description.fill("Keep my company draft");
  await context.setOffline(true);
  await sheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("No connection. The task wasn't saved.", { exact: true })).toBeVisible();
  await expect(description).toHaveValue("Keep my company draft");
  expect(await storedById("tasks", "tasks", "linked")).toEqual(before);
  await context.setOffline(false);
  await settledOnline(page);
  await expect(description).toHaveValue("Keep my company draft");
  await expect(sheet(page).getByText("Client work", { exact: true })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(await storedById("tasks", "tasks", "linked")).toEqual({ ...before, task: "Keep my company draft" });
  expect(await storedById("tasks", "tasks", "other")).toEqual(other);
  expect(await storedById("clients", "pipeline", 1)).toEqual(companyBefore);
});

test("R1b.F1: a failed company load cannot open an Internal draft and reload recovers", { tag: "@phone" }, async ({ page, request }, testInfo) => {
  await seedLinkedTask();
  const before = await storedById("tasks", "tasks", "linked");
  expect(EMULATOR_HOST).toBe("127.0.0.1:8180");
  const rules = await request.put(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECTS.clients}:securityRules`, {
    headers: { Authorization: "Bearer owner" },
    data: { rules: { files: [{ name: "clients.rules", content: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{collection}/{document} { allow read, write: if collection != 'pipeline'; } } }" }] } },
  });
  expect(rules.ok()).toBe(true);
  try {
    await page.goto("/tasks?task=linked");
    await expect(sheet(page).getByText("Company couldn't be loaded", { exact: true })).toBeVisible();
    await expect(sheet(page).getByText("“Review company draft” is unchanged. Reload to try again.", { exact: true })).toBeVisible();
    await expect(sheet(page).getByLabel("Description")).toHaveCount(0);
    await expect(sheet(page).getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("company-failed.png"), ...screenshot });
    expect(await storedById("tasks", "tasks", "linked")).toEqual(before);
  } finally {
    await openClientTrackerRules();
  }
  await sheet(page).getByRole("button", { name: "Reload", exact: true }).click();
  await expect(sheet(page).getByText("Client work", { exact: true })).toBeVisible();
  await expect(sheet(page).getByText("Halcyon Logistics", { exact: true })).toBeVisible();
  expect(await storedById("tasks", "tasks", "linked")).toEqual(before);
});

test("R1b.F1: a server-confirmed deleted company still reads as Internal without clearing its stored link", async ({ page }) => {
  await seedTasks([task("deleted-company", { linkedClientId: 99, startDate: isoDay(2), endDate: isoDay(8) })]);
  const before = await storedById("tasks", "tasks", "deleted-company");
  await page.goto("/tasks?task=deleted-company");
  await expect(sheet(page).getByText("Internal", { exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Internal work", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet(page).getByLabel("Description").fill("Keep the deleted-company rule");
  await sheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(await storedById("tasks", "tasks", "deleted-company")).toEqual({ ...before, task: "Keep the deleted-company rule" });
});
