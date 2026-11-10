// F5: follow the real MCP result in a browser, using only the smoke run's local servers.
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

export const shapes = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

export async function capture(page, directory, name, crops = false) {
  await page.evaluate(() => document.fonts.ready);
  // As in the existing screenshot checks, omit the development-only Next.js badge.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: "disabled" });
  if (crops) {
    const { width, height } = page.viewportSize();
    for (const [part, clip] of [
      ["base", { x: 0, y: height - 160, width, height: 160 }],
      ["edge", { x: Math.max(0, width - 590), y: 0, width: Math.min(590, width), height: 200 }],
    ]) await page.screenshot({ path: path.join(directory, `${name}-${part}-crop.png`), clip, animations: "disabled" });
  }
  const faults = await page.evaluate(() => {
    const errors = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push("Horizontal page overflow");
    const root = document.querySelector('[role="dialog"]') ?? document.querySelector("main");
    for (const el of root.querySelectorAll("button, a, input, textarea, select")) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) continue;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      let clipped = false;
      for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        if (y < bounds.top || y > bounds.bottom) clipped = true;
      }
      if (clipped) continue;
      // Rows can continue behind the phone's pinned navigation; they are checked after scrolling below.
      const top = document.elementFromPoint(x, y);
      if (root.tagName === "MAIN" && top?.closest('nav[aria-label="Main navigation"]')) continue;
      if (top && !el.contains(top)) errors.push(`Covered control: ${el.getAttribute("aria-label") ?? el.textContent ?? el.tagName}`);
    }
    for (const img of root.querySelectorAll("img")) {
      if (!img.complete || !img.naturalWidth) errors.push(`Unloaded image: ${img.getAttribute("src")}`);
    }
    for (const el of root.querySelectorAll("p, h1, h2, label, button, a, small")) {
      const box = el.getBoundingClientRect();
      if (!el.textContent.trim() || box.width <= 1 || box.height <= 1) continue;
      // Ellipsized company badges are intentional; ordinary labels and controls must fit.
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis") {
        errors.push(`Overflowing text: ${el.textContent}`);
      }
    }
    for (const el of root.querySelectorAll("textarea")) {
      if (el.scrollHeight > el.clientHeight + 1) errors.push("Task text is hidden inside a textarea");
      if (getComputedStyle(el).resize !== "none") errors.push("Task textarea has a native resize grip");
    }
    const canvas = document.createElement("canvas").getContext("2d");
    for (const el of root.querySelectorAll('input[type="date"]')) {
      const style = getComputedStyle(el);
      canvas.font = style.font;
      const text = el.value ? `${el.value.slice(5, 7)}/${el.value.slice(8)}/${el.value.slice(0, 4)}` : "mm/dd/yyyy";
      // Chromium does not expose the native date control's internal boxes; reserve the picker and a visible gap.
      const space = canvas.measureText(text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        + 22;
      if (el.clientWidth + 1 < space) errors.push(`Date text and calendar do not fit: ${el.clientWidth}px available, ${Math.ceil(space)}px needed`);
    }
    for (const row of document.querySelectorAll('[data-sub="true"]')) {
      const title = row.querySelector("a[data-row-link]")?.closest("p");
      const marker = title && getComputedStyle(title, "::before");
      const baseline = marker && parseFloat(marker.top) + parseFloat(marker.height);
      if (!title || !baseline || baseline > parseFloat(getComputedStyle(title).lineHeight)) {
        errors.push("Child marker does not align with the first title line");
      }
    }
    if (innerWidth <= 640 && root.getAttribute("role") === "dialog") {
      const save = [...root.querySelectorAll("button")].find((el) => el.textContent.trim() === "Save changes");
      if (save && save.getBoundingClientRect().width < root.clientWidth - 40) errors.push("Phone Save button leaves its row empty");
      for (const option of root.querySelectorAll('[role="group"][aria-label="Priority"] button')) {
        canvas.font = getComputedStyle(option).font;
        if (option.clientWidth - canvas.measureText(option.textContent).width < 16) errors.push("Priority choices are cramped");
      }
    }
    return errors;
  });
  assert.deepEqual(faults, [], `${name}: layout audit`);
}

export async function emptyResponsible(sheet) {
  await expect(sheet.getByRole("combobox", { name: /^Responsible/ })).toHaveValue("");
  // An empty typing input alone does not rule out already-selected person chips.
  await expect(sheet.getByRole("button", { name: /^Remove / })).toHaveCount(0);
}

export async function checkFollowupUI({ root, origin, added, company, plan }) {
  assert.equal(new URL(added.url).origin, origin);
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  const output = path.join(root, "test-results", "mcp-smoke");
  await rm(output, { recursive: true, force: true });
  const browser = await chromium.launch();
  try {
    for (const { name, ...options } of shapes) {
      const directory = path.join(output, name);
      await mkdir(directory, { recursive: true });
      const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      // Never allow a browser request to a live data service or the team calendar.
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin || url.origin === "http://127.0.0.1:8180") return route.continue();
        errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        return route.abort();
      });
      try {
        await page.goto(added.url);
        const sheet = page.getByRole("dialog", { name: "Task", exact: true });
        await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(`${company.company} Follow Up`);
        await expect(sheet.getByText("Prospect work", { exact: true })).toBeVisible();
        const subtasks = sheet.getByRole("group", { name: "Subtasks", exact: true });
        await expect(subtasks.getByRole("article")).toHaveCount(6);
        await emptyResponsible(sheet);
        await sheet.getByRole("button", { name: "Close", exact: true }).click();

        const prospects = page.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: /^Prospects/ });
        await prospects.click();
        await expect(prospects).toHaveAttribute("aria-pressed", "true");
        const rows = page.getByRole("main").getByRole("article");
        await expect(rows).toHaveCount(7);
        const parent = rows.filter({ has: page.getByRole("link", { name: `${company.company} Follow Up`, exact: true }) });
        await expect(parent).toContainText("0/6 subtasks");
        await expect(parent).toHaveAttribute("data-kind", "prospect");
        await capture(page, directory, "parent-list", true);
        await rows.last().getByRole("link").first().click({ trial: true });

        // Capture the sheet opened from this same Prospects list, keeping its filter and order behind it.
        await parent.getByRole("link", { name: `${company.company} Follow Up`, exact: true }).click();
        await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(`${company.company} Follow Up`);
        await capture(page, directory, "parent-open");
        await subtasks.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await capture(page, directory, "parent-subtasks");
        await subtasks.getByRole("textbox", { name: "Add a subtask" }).click({ trial: true });
        await sheet.getByRole("combobox", { name: /^Responsible/ }).scrollIntoViewIfNeeded();
        await capture(page, directory, "parent-responsible");
        // Reach the child through the parent, rather than constructing its link ourselves.
        await subtasks.getByRole("link", { name: plan.steps[0].name, exact: true }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("task")).toBe(added.subtaskIds[0]);
        await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(plan.steps[0].name);
        await expect(sheet.getByRole("link", { name: `${company.company} Follow Up`, exact: true })).toBeVisible();
        await emptyResponsible(sheet);
        await capture(page, directory, "subtask-open");
        await sheet.getByRole("group", { name: "Touch point", exact: true }).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await expect(sheet.getByRole("button", { name: "Visit", exact: true })).toBeInViewport();
        await capture(page, directory, "subtask-touch-points");
        const start = sheet.getByLabel(/^Start/);
        await expect(start).toHaveValue(plan.steps[0].startDate);
        await expect(sheet.getByLabel(/^Deadline/)).toHaveValue(plan.steps[0].endDate);
        await start.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await capture(page, directory, "subtask-dates", true);
        const points = sheet.getByLabel(/^Key points/);
        await expect(points).toHaveValue([
          ["Owner", plan.steps[0].owners], ["What", plan.steps[0].what], ["Why", plan.steps[0].why],
          ["Bring", plan.steps[0].bring], ["Watch", plan.steps[0].watch], ["Done when", plan.steps[0].doneWhen],
        ].map(([label, value]) => `${label}: ${value}`).join("\n\n"));
        await points.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await expect(points).toBeInViewport({ ratio: 1 });
        await capture(page, directory, "subtask-points");
        const originalPoints = await points.inputValue();
        // Growing after typing matters too; rendering an initially long value is not sufficient.
        await points.fill(`${originalPoints}\n\n${"More fictional detail. ".repeat(60)}`);
        await expect.poll(() => points.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
        await points.fill(originalPoints);
        assert.deepEqual(errors, [], `${name}: browser errors`);
        console.log(`MCP UI smoke passed: ${name}; screenshots in ${path.relative(root, directory)}.`);
      } catch (error) {
        await page.screenshot({ path: path.join(directory, "failure.png"), animations: "disabled" }).catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
