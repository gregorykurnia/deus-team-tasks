import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { encodeValue, decodeValue } from "../support/emulator";
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
  await page.getByRole("button", { name: "Send code", exact: true }).click();
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
