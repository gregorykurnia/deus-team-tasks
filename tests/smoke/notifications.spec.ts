import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { TaskChangesPreview } from "../../lib/taskEdit";
import type { TaskChangesSaved } from "../../lib/taskEditServer";
import { test, expect } from "./fixtures";
import { company, seedCompanies, seedTasks, storedById, task } from "./data";
import { EMULATOR_HOST, encodeValue, decodeValue, readAll } from "../support/emulator";
import { mockCalendar } from "../support/calendar";
import { notificationBrowser } from "../support/notificationBrowser";
import { auditLayout } from "../../scripts/compare/layout.mjs";
import { expectWordGaps } from "../support/wordSpacing";

const EMAIL = "audrey.wijaya@deushcs.com";
const DEMO = "http://127.0.0.1:8180/v1/projects/deus-team-tasks/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const OUT = process.env.A5_SHOTS || "redesign/compare/a5";
const pageErrors = new WeakMap<Page, string[]>();
const sheet = (page: Page) => page.getByRole("dialog", { name: "Turn on notifications", exact: true });

async function documents(collection: string) {
  const response = await fetch(`${DEMO}/${collection}`, { headers: OWNER }); expect(response.ok).toBe(true);
  return (await response.json()).documents ?? [];
}
async function signIn(page: Page, email = EMAIL, name = "Audrey") {
  const response = await fetch(`${DEMO}/people/${email}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: {
    email: encodeValue(email), name: encodeValue(name), active: encodeValue(true),
  } }) }); expect(response.ok).toBe(true);
  // Enter as a person does: the shell initializes Auth before opening the sign-in page.
  await page.goto("/plan?view=month");
  if (page.viewportSize()!.width <= 900) await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("link", { name: /^Sign in/ }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  const anyway = page.getByRole("button", { name: "Sign in here anyway" });
  await expect(anyway.or(page.getByRole("textbox", { name: "Work email" }))).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await page.getByRole("textbox", { name: "Work email" }).fill(email);
  const sent = page.waitForResponse((response) => response.url().endsWith("/api/auth/code") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  expect((await sent).status()).toBe(200);
  await expect(page.getByRole("textbox", { name: "Digit 1", exact: true })).toBeEnabled();
  const mail = (await documents("_fakeMail")).find((doc: { fields: Record<string, Parameters<typeof decodeValue>[0]> }) => decodeValue(doc.fields.to) === email);
  const code = String(decodeValue(mail.fields.code)); expect(code).toMatch(/^\d{6}$/);
  for (let index = 0; index < 6; index++) await page.getByRole("textbox", { name: `Digit ${index + 1}`, exact: true }).pressSequentially(code[index]);
  await expect(page).toHaveURL(/\/plan\?/);
}
async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Loading tasks", { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // Wait for the actual panel's entrance animation before checking covered buttons.
  await page.locator('[role="dialog"]').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished.catch(() => {})))));
  const audit = await auditLayout(page);
  await writeFile(`${OUT}/${name}-audit.json`, JSON.stringify(audit));
  await page.screenshot({ path: `${OUT}/${name}.png`, animations: "disabled" });
  expect(audit.errors).toEqual([]);
  const dialog = page.getByRole("dialog").last();
  if (await dialog.count() && await dialog.getByRole("heading", { name: /^(Turn on notifications|Audrey)/ }).count()) {
    await expectWordGaps(dialog.locator("h2, button, p, ol li > span"));
  }
  await expectWordGaps(page.getByRole("link", { name: /Audrey (Turn on notifications|Notifications on|Notifications off)/ }).locator("small"));
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  for (const url of ["http://127.0.0.1:8180/emulator/v1/projects/deus-team-tasks/databases/(default)/documents", "http://127.0.0.1:9199/emulator/v1/projects/demo-deus/accounts"]) {
    // The Firestore readiness URL can answer just before Auth finishes starting.
    await expect(async () => { expect((await fetch(url, { method: "DELETE", headers: OWNER })).ok).toBe(true); }).toPass({ timeout: 15_000 });
  }
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test("approved notification and account frames", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.setContent(await readFile("docs/implementation/sign-in-screens.html", "utf8"));
  await mkdir(OUT, { recursive: true });
  for (const [id, index, name] of [["notify", 0, "turn-on"], ["notify", 1, "install"], ["notify", 2, "blocked"], ["notify", 3, "on"], ["account", 0, "account"]] as const) {
    // The phone's bezel is an outer shadow; a figure-only clip cuts it off.
    // Keep the approved phone at 390px and add capture margins around it and its caption.
    await page.locator(`#${id} figure`).nth(index).evaluate((figure) => {
      document.getElementById("reference-capture")?.remove();
      const stage = document.createElement("div"); stage.id = "reference-capture";
      stage.style.cssText = "box-sizing:content-box;width:390px;padding:24px;background:var(--page)";
      stage.appendChild(figure.cloneNode(true)); document.body.appendChild(stage);
    });
    const stage = page.locator("#reference-capture");
    const bounds = await stage.boundingBox(), phone = await stage.locator(".phone").boundingBox(), caption = await stage.locator("figcaption").boundingBox();
    expect(phone!.x - bounds!.x).toBeGreaterThanOrEqual(24); expect(phone!.y - bounds!.y).toBeGreaterThanOrEqual(24);
    expect(phone!.width).toBe(390); expect(caption!.x - bounds!.x).toBeGreaterThanOrEqual(24);
    await stage.screenshot({ path: `${OUT}/reference-${name}.png` });
  }
});

test("turn on, test, resave a lost device, and sign out remove this device", { tag: "@phone" }, async ({ page, context, isMobile }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["notifications"]);
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 900 });
  await notificationBrowser(page, { apple: isMobile, standalone: true });
  await signIn(page);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Turn on notifications", exact: true })).toBeVisible();
  await shot(page, `${isMobile ? "390" : "1280"}-turn-on`);
  await sheet(page).getByRole("button", { name: "Not now" }).click();
  await expect(page).toHaveURL("/plan?view=month");
  if (!isMobile) await shot(page, "1280-sidebar-setup");
  if (isMobile) await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("link", { name: /Audrey Turn on notifications/ })).toBeVisible();
  if (isMobile) await shot(page, "390-more-setup");
  await page.getByRole("link", { name: /Audrey Turn on notifications/ }).click();
  await expect(page.getByRole("dialog", { name: "Audrey", exact: true })).toBeVisible();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await shot(page, `${isMobile ? "390" : "1280"}-account-off`);
  await page.getByRole("link", { name: "Turn on notifications", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Turn on notifications", exact: true }).click();
  await expect(sheet(page).getByText(/^Notifications are on for this/)).toBeVisible();
  expect(await page.evaluate(() => window.notificationMock.askedFromTap)).toBe(true);
  expect((await documents(`people/${EMAIL}/devices`)).length).toBe(1);
  await shot(page, `${isMobile ? "390" : "1280"}-on`);
  await sheet(page).getByRole("button", { name: "Send a test", exact: true }).click();
  await expect(page.getByText("Test sent. It should arrive in a few seconds.", { exact: true })).toBeVisible();
  expect((await documents("_fakePush")).length).toBe(1);
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Audrey", exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Audrey", exact: true }).getByRole("button", { name: "Close" }).click();
  // Less than the toast's 5.2s lifetime: waiting for natural expiry would mask the bug.
  await expect(page.getByText(/^Test sent\./)).toHaveCount(0, { timeout: 1000 });
  if (!isMobile) await shot(page, "1280-sidebar-on");
  else {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("link", { name: /Audrey Notifications on/ })).toBeVisible();
    await expect(page.getByText(/^Test sent\./)).toHaveCount(0);
    await shot(page, "390-more-on");
    await page.getByRole("dialog", { name: "More", exact: true }).getByRole("button", { name: "Close" }).click();
  }
  // Direct link, then reload: the same subscription is restored and a missing server row is repaired.
  const device = (await documents(`people/${EMAIL}/devices`))[0];
  expect((await fetch(`http://127.0.0.1:8180/v1/${device.name}`, { method: "DELETE", headers: OWNER })).ok).toBe(true);
  await page.goto("/plan?view=month&account=1"); await page.reload();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  expect((await documents(`people/${EMAIL}/devices`)).length).toBe(1);
  expect((await documents(`people/${EMAIL}/devices`))[0].name).toBe(device.name);
  await shot(page, `${isMobile ? "390" : "1280"}-account-on-reload`);
  await page.evaluate(() => { window.notificationMock.permission = "denied"; window.dispatchEvent(new Event("focus")); });
  await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Audrey", exact: true }).getByRole("button", { name: "Close" }).click();
  if (!isMobile) await shot(page, "1280-sidebar-off");
  else {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "More", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Audrey Notifications off/ })).toBeVisible();
    await shot(page, "390-more-off");
  }
  await page.getByRole("link", { name: /Audrey Notifications off/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Audrey", exact: true })).toHaveCount(0);
  expect((await documents(`people/${EMAIL}/devices`)).length).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("a5-subscription"))).toBeNull();
  await page.reload();
  if (isMobile) await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
});

for (const version of ["install", "blocked", "old"] as const) {
  test(`phone version: ${version}, direct link and Check again`, { tag: "@phone" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, "390px notification versions");
    await notificationBrowser(page, { apple: true, standalone: version !== "install", old: version === "old", permission: version === "blocked" ? "denied" : "default" });
    await signIn(page);
    if (version !== "install") await page.goto("/plan?view=month&notifications=1");
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByText(version === "install" ? "Add DEUS Space to your Home Screen first." : version === "blocked" ? "Notifications are blocked for DEUS Space." : "Older iPhone or iPad?", { exact: true })).toBeVisible();
    await shot(page, `390-${version}`);
    if (version === "blocked") {
      for (const item of await sheet(page).locator("ol li").all()) {
        const marker = await item.evaluate((element) => {
          const style = getComputedStyle(element, "::before");
          return { content: style.content, width: parseFloat(style.width) };
        });
        expect(["none", "normal"]).not.toContain(marker.content); expect(marker.width).toBeGreaterThan(0);
      }
      await page.evaluate(() => { window.notificationMock.permission = "granted"; });
      await sheet(page).getByRole("button", { name: "Check again" }).click();
      await expect(sheet(page).getByRole("button", { name: "Turn on notifications", exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => window.notificationMock.subscriptions)).toBe(0);
  });
}

test("a failed registration retries the existing subscription; test errors never claim sent; 403 signs out", async ({ page }) => {
  test.setTimeout(120_000); // Cold shell/Auth startup plus the deliberately lost save reply.
  await notificationBrowser(page); await signIn(page);
  await expect(sheet(page)).toBeVisible();
  let saves = 0;
  await page.route("**/api/push/devices", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    saves++;
    if (saves === 1) { await route.fetch(); return route.abort("failed"); }
    return route.continue();
  });
  await sheet(page).getByRole("button", { name: "Turn on notifications", exact: true }).click();
  await expect(sheet(page).getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await expect(sheet(page).getByRole("alert")).toContainText("We couldn’t confirm notifications were turned on.");
  await expect(sheet(page).getByRole("button", { name: "Send a test" })).toHaveCount(0);
  await shot(page, "1440-save-error");
  await sheet(page).getByRole("button", { name: "Turn on notifications", exact: true }).click();
  await expect(sheet(page).getByRole("button", { name: "Send a test" })).toBeVisible();
  expect(await page.evaluate(() => window.notificationMock.subscriptions)).toBe(1);
  expect((await documents(`people/${EMAIL}/devices`)).length).toBe(1);
  await page.route("**/api/push/test", (route) => route.fulfill({ status: 503, json: { error: "We couldn’t send the test. Try again shortly." } }));
  await sheet(page).getByRole("button", { name: "Send a test" }).click();
  await expect(sheet(page).getByRole("alert")).toContainText("couldn’t send");
  await expect(page.getByText(/^Test sent\./)).toHaveCount(0);
  expect((await documents("_fakePush")).length).toBe(0);
  await page.unroute("**/api/push/test");
  await sheet(page).getByRole("button", { name: "Send a test" }).click();
  await expect(page.getByText(/^Test sent\./)).toBeVisible();
  expect((await documents("_fakePush")).length).toBe(1);
  // Real removed-person 403, rather than stubbing away the access check.
  expect((await fetch(`${DEMO}/people/${EMAIL}?updateMask.fieldPaths=active`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { active: encodeValue(false) } }) })).ok).toBe(true);
  await page.reload();
  await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("a5-subscription"))).toBeNull();
});

test("320px account and setup keep long identity and actions readable", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "Smallest phone");
  await page.setViewportSize({ width: 320, height: 740 });
  await notificationBrowser(page, { apple: true, standalone: true });
  await signIn(page, `${"a".repeat(48)}@deushcs.com`, "Audrey Wijaya Kusuma Nathalia Prameswari");
  await expect(sheet(page)).toBeVisible(); await shot(page, "320-turn-on");
  await sheet(page).getByRole("button", { name: "Not now" }).click();
  await page.goto("/plan?view=month&account=1");
  await expect(page.getByRole("heading", { name: /^Audrey/ })).toBeVisible();
  const close = await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).boundingBox();
  expect(close!.width).toBeGreaterThanOrEqual(40); expect(close!.height).toBeGreaterThanOrEqual(40);
  await shot(page, "320-account-long");
});

test("a pending test finishes after its sheet closes and sign-out wins without a late toast", async ({ page }) => {
  await notificationBrowser(page); await signIn(page);
  await sheet(page).getByRole("button", { name: "Turn on notifications", exact: true }).click();
  await expect(sheet(page).getByRole("button", { name: "Send a test" })).toBeVisible();
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/push/test", async (route) => { started(); await held; await route.continue(); });
  await sheet(page).getByRole("button", { name: "Send a test" }).click(); await requestStarted;
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: /Audrey Notifications on/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing out…", exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
  expect((await documents(`people/${EMAIL}/devices`)).length).toBe(0);
  await expect(page.getByText(/^Test sent\./)).toHaveCount(0);
});

test("email assignments appear in a morning push and Audrey’s task lists", { tag: "@phone" }, async ({ page }, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(20_000);
  await seedTasks([
    task("email-owner", { task: "Review the trial report", responsible: [EMAIL], endDate: "2026-11-17" }),
    task("named-owner", { task: "Confirm the visit", responsible: ["Audrey", EMAIL], endDate: "2026-11-17" }),
  ]);
  await notificationBrowser(page, { apple: true, standalone: true });
  await signIn(page);
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole("button", { name: "Turn on notifications", exact: true }).click();
  await expect(sheet(page).getByText(/^Notifications are on for this/)).toBeVisible();
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();

  const summary = await page.request.get("/api/notify/morning", { headers: { Authorization: "Bearer morning-smoke-emulator-only" } });
  expect(summary.status()).toBe(200);
  expect(await summary.json()).toMatchObject({ results: [{ email: EMAIL, count: 2, status: "sent" }] });
  const [push] = await readAll("tasks", "_fakePush");
  expect(push).toMatchObject({ title: "2 due today", url: "/plan?view=people&person=Audrey" });
  await page.goto(String(push.url));
  await expect(page.getByRole("heading", { name: "Audrey", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Review the trial report/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Confirm the visit/ })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("audrey-plan.png"), style: "nextjs-portal { display: none; }" });

  await page.goto("/");
  const yours = page.getByRole("region", { name: "Your tasks" });
  await expect(yours.getByRole("link", { name: /Review the trial report/ })).toBeVisible();
  await expect(yours.getByRole("link", { name: /Confirm the visit/ })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("audrey-today.png"), style: "nextjs-portal { display: none; }" });
});

test("E1: sign in, app and chat assignments, Tuesday summary, links, and sign out", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(20_000);
  expect(baseURL).toBe("http://localhost:3100");
  expect(EMULATOR_HOST).toBe("127.0.0.1:8180");
  const pushes = () => readAll("tasks", "_fakePush");
  await seedCompanies([company(1, { company: "Halcyon Logistics", status: "To Follow Up" })]);
  await seedTasks([
    task("follow-up", { task: "Halcyon follow-up", linkedClientId: 1 }),
    task("subtask", { task: "Book the trial room", parentId: "follow-up", linkedClientId: 1, endDate: "2026-11-17" }),
    task("chat", { task: "Confirm the visit", endDate: "2026-11-18" }),
    task("self", { task: "Self-assigned work" }),
    task("after-sign-out", { task: "After sign-out" }),
  ]);
  await notificationBrowser(page);
  await signIn(page);
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole("button", { name: "Turn on notifications", exact: true }).click();
  await expect(sheet(page).getByText(/^Notifications are on for this/)).toBeVisible();
  expect(await readAll("tasks", `people/${EMAIL}/devices`)).toHaveLength(1);
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();
  await page.reload(); // Restored Auth and the subscription must reach the same saved account.
  await expect(page.getByRole("link", { name: /Audrey Notifications on/ })).toBeVisible();
  expect(await readAll("tasks", `people/${EMAIL}/devices`)).toHaveLength(1);

  const taskSheet = (target: Page) => target.getByRole("dialog", { name: "Task", exact: true });
  const assign = async (target: Page) => {
    const dialog = target.getByRole("dialog", { name: /^(New task|Task)$/ });
    const responsible = dialog.getByRole("combobox", { name: /^Responsible\b/ });
    const details = dialog.getByRole("button", { name: /Add details/ });
    // Wait for the loaded form before choosing between the new-task and edit layouts.
    await expect(responsible.or(details)).toBeVisible();
    if (await details.isVisible()) await details.click();
    await responsible.fill("Audrey");
    await responsible.press("Enter");
  };
  const save = async (target: Page) => {
    const response = target.waitForResponse((r) => r.url().endsWith("/api/notify/assigned") && r.request().method() === "POST");
    await taskSheet(target).getByRole("button", { name: "Save changes", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(taskSheet(target)).toHaveCount(0);
  };

  // Self-assignment is claimed without a push, even when that person has a registered device.
  await page.goto("/tasks?task=self"); await assign(page); await save(page);
  expect(await storedById("tasks", "assignNotices", "self")).toMatchObject({ notified: ["Audrey"] });
  expect(await pushes()).toHaveLength(0);

  const other = await browser.newContext({ baseURL });
  const editor = await other.newPage();
  editor.setDefaultTimeout(20_000);
  const editorErrors: string[] = [];
  editor.on("pageerror", (error) => editorErrors.push(error.message));
  const chat = new Client({ name: "notification-e1", version: "1.0.0" });
  try {
    await mockCalendar(editor, "off");
    await editor.goto("/tasks?task=new");
    await expect(editor.getByRole("link", { name: /^Sign in/ })).toBeVisible();
    const newTask = editor.getByRole("dialog", { name: "New task", exact: true });
    await newTask.getByLabel("Description", { exact: true }).fill("Send the quote");
    await assign(editor);
    await newTask.getByLabel("Deadline").fill("2026-11-16");
    // Lose the successful reply, then replay in parallel: provider acceptance must not send twice.
    let processed!: (status: number) => void;
    const firstProcessed = new Promise<number>((resolve) => { processed = resolve; });
    await editor.route("**/api/notify/assigned", async (route) => {
      expect(route.request().headers().authorization).toBeUndefined();
      const response = await route.fetch();
      await route.abort("failed");
      processed(response.status());
    }, { times: 1 });
    await newTask.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(newTask).toHaveCount(0);
    expect(await firstProcessed).toBe(200);
    const added = (await readAll("tasks", "tasks")).find((row) => row.task === "Send the quote");
    expect(added).toMatchObject({ responsible: ["Audrey"], endDate: "2026-11-16" });
    expect(await pushes()).toEqual([expect.objectContaining({ email: EMAIL, title: "New task for you", body: expect.stringContaining("Send the quote"), url: `/?task=${added!.id}` })]);
    const retries = await Promise.all([1, 2].map(() => other.request.post("/api/notify/assigned", { data: { taskIds: [added!.id, added!.id] } })));
    for (const response of retries) expect(response.status()).toBe(200);
    expect(await pushes()).toHaveLength(1);
    await editor.goto(`/tasks?task=${added!.id}`);
    await taskSheet(editor).getByLabel("Key points").fill("Confirmed the quote details");
    await taskSheet(editor).getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(taskSheet(editor)).toHaveCount(0);
    expect(await storedById("tasks", "tasks", added!.id)).toMatchObject({ keyPoints: "Confirmed the quote details" });
    expect(await pushes()).toHaveLength(1);

    // Edit uses saveTaskKeptInStep, separate from the first task's addTaskKeptInStep path.
    await editor.goto("/tasks?task=subtask"); await assign(editor); await save(editor);
    expect(await storedById("tasks", "tasks", "subtask")).toMatchObject({ responsible: ["Audrey"], parentId: "follow-up", linkedClientId: 1 });
    expect(await pushes()).toHaveLength(2);
    expect((await pushes()).find((row) => row.url === "/?task=subtask")).toMatchObject({ title: "New task for you", body: expect.stringContaining("Subtask of Halcyon follow-up") });

    await chat.connect(new StreamableHTTPClientTransport(new URL("/api/mcp/mcp-smoke-emulator-only", baseURL)));
    const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
      const result = CallToolResultSchema.parse(await chat.callTool({ name, arguments: args }));
      const text = result.content.find((part) => part.type === "text");
      expect(result.isError, text?.text).not.toBe(true);
      if (!text) throw new Error(`${name} returned no text result`);
      return JSON.parse(text.text) as T;
    };
    const changes = [{ taskId: "chat", set: { responsible: ["Audrey"] } }];
    const preview = await call<TaskChangesPreview>("preview_task_changes", { changes });
    expect(preview.errors).toEqual([]); expect(preview.canWrite).toBe(true);
    expect(await storedById("tasks", "tasks", "chat")).toMatchObject({ responsible: [] });
    expect(await pushes()).toHaveLength(2);
    const args = { changes, seen: Object.fromEntries(preview.tasks.map((row) => [row.taskId, row.seen])), acknowledgedWarnings: preview.warnings.map((warning) => warning.id) };
    const saved = await call<TaskChangesSaved>("apply_task_changes", args);
    expect(saved.tasks).toContainEqual(expect.objectContaining({ taskId: "chat", saved: true }));
    expect(saved.alreadySaved).toBe(false);
    expect(await pushes()).toHaveLength(3);
    expect((await pushes()).find((row) => row.url === "/?task=chat")).toMatchObject({ title: "New task for you", body: expect.stringContaining("Confirm the visit") });
    expect((await call<TaskChangesSaved>("apply_task_changes", args)).alreadySaved).toBe(true);
    expect(await pushes()).toHaveLength(3);

    const morning = () => other.request.get("/api/notify/morning", { headers: { Authorization: "Bearer morning-smoke-emulator-only" } });
    expect((await other.request.get("/api/notify/morning")).status()).toBe(401);
    expect(await pushes()).toHaveLength(3);
    const summary = await morning(); expect(summary.status()).toBe(200);
    expect(await summary.json()).toEqual({ date: "2026-11-17", results: [{ email: EMAIL, count: 3, status: "sent" }] });
    expect(await pushes()).toHaveLength(4);
    expect((await pushes()).find((row) => row.title !== "New task for you")).toMatchObject({
      title: "1 late, 1 due today, 1 tomorrow", url: "/plan?view=people&person=Audrey",
      body: "Late: Send the quote (1 day late)\nToday: Book the trial room\nTomorrow: Confirm the visit",
    });
    const repeated = await Promise.all([morning(), morning()]);
    for (const response of repeated) {
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ results: [{ email: EMAIL, status: "skipped" }] });
    }
    expect(await pushes()).toHaveLength(4);

    // Drive the exact payload URLs, on the recipient's restored session, and verify the loaded record.
    const titles = new Map([[added!.id, "Send the quote"], ["subtask", "Book the trial room"], ["chat", "Confirm the visit"]]);
    for (const row of await pushes()) {
      const url = new URL(String(row.url), baseURL);
      await page.goto(`${url.pathname}${url.search}`);
      const id = url.searchParams.get("task");
      if (id) {
        await expect(taskSheet(page)).toBeVisible();
        await expect(taskSheet(page).getByLabel("Description", { exact: true })).toHaveValue(titles.get(id)!);
        await expect(taskSheet(page).getByRole("combobox", { name: /^Responsible\b/ })).toHaveValue("");
        await expect(taskSheet(page).getByRole("button", { name: "Remove Audrey", exact: true })).toBeVisible();
        if (id === "subtask") await expect(taskSheet(page).getByRole("link", { name: "Halcyon follow-up", exact: true })).toBeVisible();
        await page.reload();
        await expect(taskSheet(page).getByLabel("Description", { exact: true })).toHaveValue(titles.get(id)!);
      } else {
        await expect(page).toHaveURL("/plan?view=people&person=Audrey");
        await expect(page.getByRole("heading", { name: "Audrey", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: /^Responsible for/ })).toBeVisible();
      }
    }
    await page.goto("/plan?view=people&person=Audrey&account=1");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
    expect(await readAll("tasks", `people/${EMAIL}/devices`)).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem("a5-subscription"))).toBeNull();
    await editor.goto("/tasks?task=after-sign-out"); await assign(editor); await save(editor);
    expect(await storedById("tasks", "tasks", "after-sign-out")).toMatchObject({ responsible: ["Audrey"] });
    expect(await storedById("tasks", "assignNotices", "after-sign-out")).toMatchObject({ notified: ["Audrey"] });
    expect(await pushes()).toHaveLength(4);
    expect(editorErrors).toEqual([]);
  } finally {
    await chat.close();
    await other.close();
  }
});
