// F2 look check: render data written by the real Node helper, without needing the later MCP route.
import type { Page, TestInfo } from "@playwright/test";
import { terminate } from "firebase/firestore";
import { test, expect } from "./fixtures";
import { FOLLOWUP_COMPANY_FIXTURE as company, SIX_STEP_FOLLOWUP_FIXTURE as plan } from "../fixtures/followupPlan";
import { EMULATOR_HOST, seed } from "../support/emulator";

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // Match the project's compare script: the development server badge is absent in production.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const faults = await page.evaluate(() => {
    const errors: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push("The page overflows horizontally");
    const root = document.querySelector('[role="dialog"]') ?? document.querySelector("main")!;
    const nav = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Main navigation"]')]
      .find((el) => getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().height > 0);
    const scrollEdge = root.tagName === "MAIN" && nav
      ? nav.getBoundingClientRect().top : innerHeight;
    for (const el of root.querySelectorAll<HTMLElement>("button, a, input, textarea, select")) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) continue;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      // Page content continues below the fixed phone navigation; test its reachability after scrolling below.
      if (y >= scrollEdge && document.documentElement.scrollHeight > innerHeight) continue;
      // Controls outside an internal scroll area's visible part are intentionally clipped.
      let clipped = false;
      for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        if (y < bounds.top || y > bounds.bottom) clipped = true;
      }
      if (clipped) continue;
      const top = document.elementFromPoint(x, y);
      if (top && !el.contains(top)) errors.push(`Covered control: ${el.getAttribute("aria-label") ?? el.textContent ?? el.tagName}`);
    }
    return errors;
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled" });
  // Native-pixel crops of frame edges, row bases, sheet overlap and the pinned footer.
  if (name === "parent-list" || name === "subtask-details") {
    const size = page.viewportSize()!;
    await page.screenshot({ path: info.outputPath(`${name}-base-crop.png`),
      clip: { x: 0, y: size.height - 160, width: size.width, height: 160 }, animations: "disabled" });
    await page.screenshot({ path: info.outputPath(`${name}-edge-crop.png`),
      clip: { x: Math.max(0, size.width - 590), y: 0, width: Math.min(590, size.width), height: 200 }, animations: "disabled" });
  }
  expect(faults).toEqual([]);
}

test("F2: Node follow-up writes render on desktop and phone", { tag: "@phone" }, async ({ page, isMobile }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/tasks?kind=prospect");
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(0);
  await capture(page, info, "before-empty");

  // Set the test switch before loading either Firebase instance into the Node worker.
  // A production build is deliberately not used: lib/emulator.ts disables it there.
  process.env.NEXT_PUBLIC_USE_EMULATOR = "1";
  const { USE_EMULATOR } = await import("../../lib/emulator");
  expect(USE_EMULATOR && EMULATOR_HOST === "127.0.0.1:8180").toBe(true);
  const { db } = await import("../../lib/firebase");
  const { clientsDb } = await import("../../lib/firebaseClients");
  const { addFollowupPlan } = await import("../../lib/followupServer");
  await seed("clients", "pipeline", [company], { keepIdField: true });
  let result: Awaited<ReturnType<typeof addFollowupPlan>>;
  try {
    result = await addFollowupPlan(plan);
  } finally {
    await Promise.all([terminate(db), terminate(clientsDb)]);
  }

  const rows = page.getByRole("main").getByRole("article");
  await expect(rows).toHaveCount(7);
  const parent = rows.filter({ has: page.getByRole("link", { name: `${company.company} Follow Up`, exact: true }) });
  await expect(parent).toContainText("0/6 subtasks");
  await expect(page.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: /^Prospects/ })).toHaveAttribute("aria-pressed", "true");
  if (isMobile) expect(page.viewportSize()!.width).toBe(390);
  // Verify the settled, saved view too; a live-arrival toast must not obscure the evidence.
  await page.reload();
  await expect(rows).toHaveCount(7);
  await expect(parent).toContainText("0/6 subtasks");
  await capture(page, info, "parent-list");
  // All rows, including the last one, can be reached above the pinned phone navigation.
  await rows.last().getByRole("link").first().click({ trial: true });
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.goto(`/tasks?kind=prospect&task=${result.subtaskIds[0]}`);
  const sheet = page.getByRole("dialog", { name: "Task", exact: true });
  await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(plan.steps[0].name);
  await expect(sheet.getByRole("link", { name: `${company.company} Follow Up`, exact: true })).toBeVisible();
  await capture(page, info, "subtask-top");
  await expect(sheet.getByLabel(/^Start/)).toHaveValue(plan.steps[0].startDate);
  await expect(sheet.getByLabel(/^Deadline/)).toHaveValue(plan.steps[0].endDate);
  await expect(sheet.getByRole("combobox", { name: /^Responsible/ })).toHaveValue("");
  const points = sheet.getByLabel(/^Key points/);
  for (const label of ["Owner:", "What:", "Why:", "Bring:", "Watch:", "Done when:"]) {
    await expect(points).toHaveValue(new RegExp(label));
  }
  await sheet.getByLabel(/^Start/).scrollIntoViewIfNeeded();
  await capture(page, info, "subtask-details");
  await points.scrollIntoViewIfNeeded();
  await points.evaluate((el: HTMLTextAreaElement) => { el.scrollTop = 0; });
  await capture(page, info, "subtask-points-start");
  await points.evaluate((el: HTMLTextAreaElement) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });
  await capture(page, info, "subtask-points-middle");
  await points.evaluate((el: HTMLTextAreaElement) => { el.scrollTop = el.scrollHeight; });
  await capture(page, info, "subtask-points-end");
  expect(pageErrors).toEqual([]);
});
