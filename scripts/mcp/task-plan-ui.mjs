// G08: actual MCP saves opened in the app; the shared harness owns all servers/secrets.
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { payload } from "./legacy-smoke.mjs";
import { capture, emptyResponsible, shapes } from "./ui-smoke.mjs";

const labels = { prospect: "Prospects", client: "Clients", internal: "Internal" };
const tags = { prospect: "Prospect work", client: "Client work", internal: "Internal" };
const sortRecords = (records) => records.sort((a, b) => a.id.localeCompare(b.id));

async function prepare({ client, jiti, readAll, seed, clearAll, origin }) {
  const f = await jiti.import("../../tests/fixtures/taskPlan.ts");
  await clearAll();
  await seed("clients", "pipeline", [f.TASK_PLAN_PROSPECT, f.TASK_PLAN_CLIENT], { keepIdField: true });
  const parents = [f.TASK_PLAN_PROSPECT_PARENT, f.TASK_PLAN_CLIENT_PARENT, f.TASK_PLAN_INTERNAL_PARENT];
  const oldChildren = parents.map((parent) => ({
    ...parent, id: `${parent.id}-old-child`, parentId: parent.id, task: "Existing completed fictional step",
    completed: true, completedAt: Date.UTC(2026, 11, 10), startDate: "2026-12-08", endDate: "2026-12-10",
    order: parent.order + 1,
  }));
  await seed("tasks", "tasks", [...parents, ...oldChildren]);
  const original = await readAll("tasks", "tasks");
  const scenarios = [];
  const call = async (name, args) => payload(await client.callTool({ name, arguments: args }));
  for (const [i, base] of [f.TASK_PLAN_PROSPECT_NEW, f.TASK_PLAN_CLIENT_NEW, f.TASK_PLAN_INTERNAL_NEW].entries()) {
    for (const mode of ["new", "append"]) {
      const plan = {
        kind: base.kind, ...(base.companyId !== undefined && { companyId: base.companyId }),
        ...(mode === "new" ? { newParent: { ...base.newParent,
          sourceUrl: base.newParent.sourceUrl ?? `https://example.com/fictional-${base.kind}` } }
          : { existingParentId: parents[i].id }),
        steps: base.steps.map((step) => ({ ...step, name: `${labels[base.kind]} ${mode}: ${step.name}` })),
      };
      const shown = await call("preview_task_plan", { plan });
      assert.equal(shown.canWrite, true);
      const added = await call("add_task_plan", { plan, previewToken: shown.previewToken,
        acknowledgedWarnings: shown.warnings.map((warning) => warning.id) });
      assert.equal(added.url, `${origin}/tasks?task=${added.parentId}`);
      const stored = await readAll("tasks", "tasks");
      for (const old of original) assert.deepEqual(stored.find((task) => task.id === old.id), old);
      const parent = stored.find((task) => task.id === added.parentId);
      const children = added.subtaskIds.map((id) => stored.find((task) => task.id === id));
      for (const child of children) {
        assert.deepEqual(child.responsible, []);
        assert.deepEqual(child.informed, []);
        assert.equal(child.linkedClientId ?? null, parent.linkedClientId ?? null);
        assert.equal(child.taskGroup, parent.taskGroup);
      }
      scenarios.push({ kind: base.kind, mode, plan, added, parent, children,
        ...(mode === "append" && { oldChild: oldChildren[i] }) });
    }
  }
  return scenarios;
}

async function verifyChild(page, scenario, index = 0) {
  const sheet = page.getByRole("dialog", { name: "Task", exact: true });
  const child = scenario.children[index];
  await expect.poll(() => new URL(page.url()).searchParams.get("task")).toBe(child.id);
  await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(child.task);
  await expect(sheet.getByRole("link", { name: scenario.parent.task, exact: true })).toBeVisible();
  await expect(sheet.getByText(tags[scenario.kind], { exact: true })).toBeVisible();
  await expect(sheet.getByLabel(/^Start/)).toHaveValue(child.startDate);
  await expect(sheet.getByLabel(/^Deadline/)).toHaveValue(child.endDate);
  await expect(sheet.getByLabel(/^Key points/)).toHaveValue(child.keyPoints);
  await emptyResponsible(sheet);
  return sheet;
}

// Scroll the sheet, not the textarea: the saved long notes must expand and remain readable.
async function scrollNotes(points, position) {
  await points.evaluate((el, position) => {
    let scroller = el.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) throw new Error("Task sheet has no notes scroller");
    const offset = position === "start" ? 0 : position === "end" ? el.offsetHeight - scroller.clientHeight + 100 : el.offsetHeight / 2;
    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 30 + offset;
  }, position);
}

// G09 fresh-eyes findings: prove that phone scroll boundaries and compact labels do not hide content permanently.
async function checkReachability(page, scenarios, companies, shoot, origin) {
  const sheet = page.getByRole("dialog", { name: "Task", exact: true });
  for (const kind of ["prospect", "client", "internal"]) {
    await page.goto(`${origin}/tasks?kind=${kind}`);
    const rows = page.getByRole("main").getByRole("article");
    await expect(rows).toHaveCount(6);
    const last = rows.last();
    await last.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const rowBox = await last.boundingBox();
    const navBox = await page.getByRole("navigation", { name: "Main navigation" }).boundingBox();
    assert.ok(rowBox.y >= 0 && rowBox.y + rowBox.height <= navBox.y,
      `${kind}: final task row must scroll completely above navigation`);
    await last.getByRole("link").first().click({ trial: true });
    await shoot(`${kind}-list-scrolled`, true);

    if (kind !== "client") {
      await page.evaluate(() => scrollTo(0, 0));
      const toolbar = page.getByRole("toolbar", { name: "Filter and sort" });
      const filter = toolbar.getByRole("button", { name: kind === "internal" ? /^Sort/ : /^No action for/ });
      await filter.evaluate((el) => el.scrollIntoView({ inline: "center", block: "nearest" }));
      const box = await filter.boundingBox(), bounds = await toolbar.boundingBox();
      assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width,
        `${kind}: clipped filter must scroll fully into view`);
      await filter.click({ trial: true });
      await shoot(`${kind}-filters-scrolled`);
    }

    const scenario = scenarios.find((item) => item.kind === kind && item.mode === "new");
    await page.goto(scenario.added.url);
    await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(scenario.parent.task);
    if (kind !== "internal") {
      const company = companies.find((item) => item.id === String(scenario.parent.linkedClientId));
      await sheet.getByRole("link", { name: "Open company", exact: true }).click();
      const heading = page.getByRole("dialog", { name: company.company, exact: true })
        .getByRole("heading", { name: company.company, exact: true });
      await expect(heading).toBeVisible();
      assert.ok(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth + 1
        && el.scrollHeight <= el.clientHeight + 1), "Full company name must fit in its record heading");
      await shoot(`${kind}-company-open`);
    } else {
      const type = sheet.getByLabel(/^Task type/);
      await type.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await type.click({ trial: true });
      await shoot("internal-task-type", true);
    }
  }

  const prospect = scenarios.find((item) => item.kind === "prospect" && item.mode === "append");
  await page.goto(`${origin}/tasks?task=${prospect.children[1].id}`);
  await verifyChild(page, prospect, 1);
  await shoot("prospect-full-subtask-title");
  // The source/end captures were at the very end of an 80-paragraph expanded field. Move those boundary
  // paragraphs into the body; no field is edited and no save action is invoked.
  for (const [target, note, name] of [
    [prospect.children[0], 48, "prospect-note-48"],
    [scenarios[0].parent, 74, "prospect-source-note-74"],
  ]) {
    await page.goto(`${origin}/tasks?task=${target.id}`);
    const points = sheet.getByLabel(/^Key points/);
    await expect(points).toHaveValue(target.keyPoints);
    await points.evaluate((el, note) => {
      let body = el.parentElement;
      while (body && !/(auto|scroll)/.test(getComputedStyle(body).overflowY)) body = body.parentElement;
      if (!body) throw new Error("Missing sheet scroll body");
      body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top
        + el.clientHeight * (note - 1) / 80 - 80;
    }, note);
    await shoot(name);
  }
}

export async function checkTaskPlanUI(context) {
  const { root, origin, emulatorHost, readAll, planOnly = false, reachabilityOnly = false } = context;
  // Check before any fixture write; inherited URLs must never redirect these helpers to live data.
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  assert.equal(emulatorHost, "127.0.0.1:8180");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, emulatorHost);
  const scenarios = await prepare(context);
  const output = path.join(root, "test-results", "task-plan-connector",
    ...(reachabilityOnly ? ["reachability"] : planOnly ? ["g09"] : []));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const before = sortRecords(await readAll("tasks", "tasks"));
  const companiesBefore = sortRecords(await readAll("clients", "pipeline"));
  const manifest = { viewports: shapes, scenarios, captures: [], checks: [] };
  const browser = await chromium.launch();
  try {
    for (const { name, ...options } of shapes.filter((shape) => !reachabilityOnly || shape.name === "phone")) {
      const directory = path.join(output, name);
      await mkdir(directory, { recursive: true });
      const browserContext = await browser.newContext({ ...options, reducedMotion: "reduce" });
      const errors = [];
      const page = await browserContext.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await browserContext.route("**/*", (route) => {
        const url = new URL(route.request().url());
        // Fulfil locally before the app can read any connected team calendar.
        if (url.origin === origin && url.pathname === "/api/calendar") {
          return route.fulfill({ json: { status: "off", events: [], error: "Google Calendar not configured" } });
        }
        if (url.origin === origin || url.origin === `http://${emulatorHost}`) return route.continue();
        errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        return route.abort();
      });
      const shoot = async (id, crops = false) => {
        await capture(page, directory, id, crops);
        manifest.captures.push(`${name}/${id}.png`);
      };
      try {
        if (reachabilityOnly) {
          await checkReachability(page, scenarios, companiesBefore, shoot, origin);
          assert.deepEqual(errors, [], "Phone reachability: console/page/network errors");
          manifest.checks.push("phone: last rows clear navigation; filters scroll fully into view; full company names and task title readable; Task type reachable; boundary notes readable; no console/network/layout faults");
          console.log("Task-plan phone reachability passed; all fresh-eyes boundary/ellipsis findings checked.");
          continue;
        }
        for (const scenario of planOnly ? [] : scenarios) {
          const { kind, mode, parent, added, plan, oldChild } = scenario;
          await page.goto(added.url);
          const sheet = page.getByRole("dialog", { name: "Task", exact: true });
          await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(parent.task);
          await expect(sheet.getByText(tags[kind], { exact: true })).toBeVisible();
          const subtasks = sheet.getByRole("group", { name: "Subtasks", exact: true });
          await expect(subtasks.getByRole("article")).toHaveCount(mode === "new" ? 2 : 3);
          await expect(sheet.getByLabel(/^Start/)).toHaveValue(parent.startDate);
          await expect(sheet.getByLabel(/^Deadline/)).toHaveValue(parent.endDate);
          await expect(sheet.getByLabel(/^Key points/)).toHaveValue(parent.keyPoints);
          if (mode === "new") {
            await emptyResponsible(sheet);
            assert.ok(parent.keyPoints.endsWith(`Source: ${plan.newParent.sourceUrl}`));
          } else {
            const oldRow = subtasks.getByRole("article").filter({ has: page.getByRole("link", { name: oldChild.task, exact: true }) });
            await expect(oldRow.getByRole("button", { name: /Mark not done/ })).toBeAttached();
          }
          // Enter from the main navigation as well as the exact connector URL.
          await sheet.getByRole("button", { name: "Close", exact: true }).click();
          await page.goto(origin);
          await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: /^(All tasks|Tasks)/ }).click();
          await expect(page).toHaveURL(`${origin}/tasks`);
          await expect(page.getByRole("heading", { name: "Tasks", level: 1, exact: true })).toBeVisible();
          const category = page.getByRole("group", { name: "Kind of work" }).getByRole("button", { name: new RegExp(`^${labels[kind]}`) });
          await category.click();
          await expect.poll(() => new URL(page.url()).searchParams.get("kind")).toBe(kind);
          await expect(category).toHaveAttribute("aria-pressed", "true");
          const rows = page.getByRole("main").getByRole("article");
          await expect(rows).toHaveCount(6);
          const parentRow = rows.filter({ has: page.getByRole("link", { name: parent.task, exact: true }) });
          await expect(parentRow).toHaveAttribute("data-kind", kind);
          await expect(parentRow).toContainText(mode === "new" ? "0/2 subtasks" : "1/3 subtasks");
          if (mode === "new") await shoot(`${kind}-destination-list`, true);
          await rows.last().getByRole("link").first().click({ trial: true });
          await parentRow.getByRole("link", { name: parent.task, exact: true }).click();
          await expect(sheet.getByLabel("Description", { exact: true })).toHaveValue(parent.task);
          await expect(subtasks.getByRole("article")).toHaveCount(mode === "new" ? 2 : 3);
          if (mode === "new") await shoot(`${kind}-main-open`);
          await subtasks.evaluate((el) => el.scrollIntoView({ block: "center" }));
          if (kind === "internal" && mode === "append") await shoot("internal-appended-subtasks");
          if (kind === "prospect" && mode === "new") {
            const points = sheet.getByLabel(/^Key points/);
            await scrollNotes(points, "end");
            await shoot("prospect-main-source");
          }
          await subtasks.getByRole("link", { name: plan.steps[0].name, exact: true }).click();
          await verifyChild(page, scenario);
          // A fresh document must show the same saved child, rather than only a live in-memory arrival.
          await page.reload();
          await verifyChild(page, scenario);
          if (kind === "prospect" && mode === "new") {
            await sheet.getByLabel(/^Start/).evaluate((el) => el.scrollIntoView({ block: "center" }));
            await shoot("prospect-subtask-dates", true);
            const points = sheet.getByLabel(/^Key points/);
            for (const position of ["start", "middle", "end"]) {
              await scrollNotes(points, position);
              await shoot(`prospect-subtask-notes-${position}`);
            }
          }
          // The second selected action keeps its separate one-day date and empty notes.
          await sheet.getByRole("link", { name: parent.task, exact: true }).click();
          await subtasks.getByRole("link", { name: plan.steps[1].name, exact: true }).click();
          await verifyChild(page, scenario, 1);
          if (oldChild) {
            await sheet.getByRole("link", { name: parent.task, exact: true }).click();
            await subtasks.getByRole("link", { name: oldChild.task, exact: true }).click();
            const finished = page.getByRole("dialog", { name: "Finished task", exact: true });
            await expect(finished.getByLabel("Description", { exact: true })).toHaveValue(oldChild.task);
            await expect(finished.getByLabel(/^Start/)).toHaveValue(oldChild.startDate);
            await expect(finished.getByLabel(/^Deadline/)).toHaveValue(oldChild.endDate);
            await expect(finished.getByLabel(/^Key points/)).toHaveValue(oldChild.keyPoints);
            await expect(finished.getByRole("button", { name: /Remove Fictional existing owner/ })).toBeAttached();
          }
          manifest.checks.push(`${name}/${kind}/${mode}: returned link, main navigation, category, count, exact notes/dates, empty new assignments, reload, preserved old state`);
          console.log(`Task-plan UI scenario passed: ${name}/${kind}/${mode}.`);
        }
        // The existing Day view identifies the child by its parent while retaining its own date range.
        const scenario = scenarios[0];
        await page.goto(`${origin}/plan?view=day&date=${scenario.children[0].startDate}&kind=prospect&show=tasks`);
        const tasks = page.getByRole("region", { name: "Tasks", exact: true });
        const childRow = tasks.getByRole("article").filter({ has: page.getByRole("link", { name: scenario.children[0].task, exact: true }) });
        await expect(childRow).toContainText(scenario.parent.task);
        await childRow.scrollIntoViewIfNeeded();
        await shoot("plan-parent-and-subtask", true);
        // A clamped text box with vertical padding exposes the next line underneath its ellipsis.
        // Measure the actual rendered box, so the G08 fourth-line fault fails before the repair.
        const previews = await tasks.evaluate((el) => [...el.querySelectorAll("*")].flatMap((node) => {
          const style = getComputedStyle(node);
          if (style.webkitLineClamp !== "3") return [];
          return [{ height: node.getBoundingClientRect().height, maxHeight: 3 * parseFloat(style.lineHeight) }];
        }));
        assert.equal(previews.length, 2, "Both long-note previews must be checked");
        for (const preview of previews) assert.ok(preview.height <= preview.maxHeight + 1,
          `${name}: Key points preview exposes text below three lines (${preview.height}px > ${preview.maxHeight}px)`);
        if (planOnly) await childRow.locator("p").filter({ hasText: "Note 1:" }).screenshot({
          path: path.join(directory, "key-points-crop.png"), animations: "disabled",
        });
        await childRow.getByRole("link", { name: scenario.children[0].task, exact: true }).click();
        await verifyChild(page, scenario);
        assert.deepEqual(errors, [], `${name}: console/page/network errors`);
        manifest.checks.push(`${name}/plan: parent breadcrumb, independent child link, three whole preview lines, no console/network/layout faults`);
        console.log(`Task-plan UI passed: ${name}; ${planOnly ? "Plan visual regression" : "all six new/append groups, saved reloads, Plan"}; ${manifest.captures.filter((file) => file.startsWith(`${name}/`)).length} captures.`);
      } catch (error) {
        await page.screenshot({ path: path.join(directory, "failure.png"), animations: "disabled" }).catch(() => {});
        throw error;
      } finally {
        await browserContext.close();
      }
    }
    assert.deepEqual(sortRecords(await readAll("tasks", "tasks")), before, "Browsing changed saved task state");
    assert.deepEqual(sortRecords(await readAll("clients", "pipeline")), companiesBefore, "Browsing changed companies");
    // Include the exact saved state for later visual review; fixtures contain no live customer data or secrets.
    await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}
