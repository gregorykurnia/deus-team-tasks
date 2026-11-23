import { mkdir } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { encodeValue, decodeValue } from "../support/emulator";
import { expectWordGaps } from "../support/wordSpacing";
import { auditLayout } from "../../scripts/compare/layout.mjs";

const EMAIL = "audrey.wijaya@deushcs.com";
const DEMO = "http://127.0.0.1:8180/v1/projects/deus-team-tasks/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function person(email = EMAIL, name = "Audrey") {
  const response = await fetch(`${DEMO}/people/${email}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: {
    email: encodeValue(email), name: encodeValue(name), active: encodeValue(true),
  } }) });
  expect(response.ok).toBe(true);
}
async function code(email = EMAIL) {
  const response = await fetch(`${DEMO}/_fakeMail`, { headers: OWNER });
  expect(response.ok).toBe(true);
  const body = await response.json();
  const mail = body.documents?.find((doc: { fields: Record<string, Parameters<typeof decodeValue>[0]> }) => decodeValue(doc.fields.to) === email);
  return mail ? String(decodeValue(mail.fields.code)) : "";
}
async function send(page: Page, email = EMAIL) {
  await page.getByRole("textbox", { name: "Work email" }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Digit 1", exact: true })).toBeEnabled();
}
async function paste(page: Page, text: string, box = 0) {
  await page.getByRole("textbox", { name: `Digit ${box + 1}`, exact: true }).evaluate((element, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text", value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}
async function account(page: Page, phone: boolean, name = "Audrey") {
  if (phone) await page.getByRole("button", { name: "More", exact: true }).click();
  const container = phone ? page.getByRole("dialog", { name: "More" }) : page.getByRole("navigation", { name: "Main navigation" });
  await container.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
}
async function shot(page: Page, name: string) {
  if (!process.env.A3_SHOTS) return;
  await mkdir(process.env.A3_SHOTS, { recursive: true });
  await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Loading tasks", { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `${process.env.A3_SHOTS}/${name}.png`, animations: "disabled" });
}

async function sameLeft(first: Locator, second: Locator) {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
}

async function entryLayout(page: Page, phone: boolean, personName?: string) {
  const entry = page.getByRole("link", { name: personName ? new RegExp(personName) : /^Sign in/ });
  if (phone) {
    const more = page.getByRole("dialog", { name: "More", exact: true });
    await more.evaluate((sheet) => Promise.all(sheet.getAnimations().map((animation) => animation.finished)));
    const plan = more.getByRole("link", { name: /^Plan/ });
    await sameLeft(entry.locator("b"), plan.locator("span").first());
    await expect(entry).toHaveCSS("background-color", "rgba(255, 255, 255, 0.75)");
    if (!personName) {
      expect(await entry.locator("svg").first().evaluate((el) => getComputedStyle(el).color))
        .toBe(await plan.locator("svg").evaluate((el) => getComputedStyle(el).color));
      await readableSpaces(entry.locator("small"));
    }
    const liveStatus = more.getByText("Live, everyone's up to date", { exact: true });
    await expect(liveStatus).toBeInViewport({ ratio: 1 });
  } else {
    const install = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Install the app" });
    await sameLeft(entry.locator("b"), install.locator("span"));
    expect(await entry.locator("b").evaluate((el) => getComputedStyle(el).fontSize))
      .toBe(await install.evaluate((el) => getComputedStyle(el).fontSize));
    const navLabel = await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: /^Today/ }).evaluate((el) => {
      const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())!;
      const range = document.createRange(); range.selectNodeContents(text); return range.getBoundingClientRect().x;
    });
    expect(Math.abs((await entry.locator("b").boundingBox())!.x - navLabel)).toBeLessThan(1);
  }
  if (personName) await avatarGap(entry);
}

async function avatarGap(entry: Locator) {
  const [avatar, label] = await Promise.all([entry.locator("span[title]").boundingBox(), entry.locator("b").boundingBox()]);
  expect(avatar).not.toBeNull(); expect(label).not.toBeNull();
  expect(label!.x - avatar!.x - avatar!.width).toBeGreaterThanOrEqual(6);
}

async function accountLayout(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name, exact: true });
  // A5's approved white perk cards have their own inset, shared by both labels.
  await sameLeft(dialog.getByText("Morning summary", { exact: true }), dialog.getByText("New task for you", { exact: true }));
}

async function readableSpaces(text: Locator) {
  const widths = await text.evaluate((el) => {
    const values: number[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of node.textContent!.matchAll(/ /g)) {
        const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + 1);
        const width = range.getBoundingClientRect().width;
        if (width > .1) values.push(width); // A space at a line break is collapsed, rather than drawn.
      }
    }
    return values;
  });
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(3.5);
}

test.beforeEach(async ({ page }) => {
  // Auth checks keep setup dismissed; notification states have their own spec.
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" }));
  for (const url of ["http://127.0.0.1:8180/emulator/v1/projects/deus-team-tasks/databases/(default)/documents", "http://127.0.0.1:9199/emulator/v1/projects/demo-deus/accounts"]) {
    await expect(async () => { expect((await fetch(url, { method: "DELETE", headers: OWNER })).ok).toBe(true); }).toPass({ timeout: 15_000 });
  }
  await person();
});

test("signs in from navigation, reloads with the same identity, redirects an existing session and signs out", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.setTimeout(120_000); // This round trip also captures eight states and cold-compiles both layouts in dev.
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 900 });
  const shape = isMobile ? "390" : "1280";
  let verifies = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/auth/verify")) verifies++; });
  await page.goto("/plan?view=month");
  if (isMobile) await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
  await entryLayout(page, isMobile);
  await shot(page, `${shape}-entry-out`);
  await page.getByRole("link", { name: /^Sign in/ }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplan%3Fview%3Dmonth/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Work email" })).toBeFocused();
  await readableSpaces(page.locator("main header p"));
  await shot(page, `${shape}-email`);
  await page.getByRole("textbox", { name: "Work email" }).fill("greg@deushcs.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByText(/isn’t added yet/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Work email" })).toHaveCount(1);
  await readableSpaces(page.getByText(/isn’t added yet/));
  await shot(page, `${shape}-not-added`);
  await send(page, " AUDREY.WIJAYA@DEUSHCS.COM ");
  const right = await code();
  expect(right).toMatch(/^\d{6}$/);
  const wrong = right === "000000" ? "111111" : "000000";
  await paste(page, wrong, 3);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/That code isn’t right\. 4 tries left\./);
  const edges = await page.getByRole("textbox", { name: /^Digit [12]$/ }).evaluateAll((boxes) => {
    const spreads = [...getComputedStyle(boxes[0]).boxShadow.matchAll(/0px 0px 0px (\d+)px/g)].map((match) => Number(match[1]));
    return { gap: boxes[1].getBoundingClientRect().left - boxes[0].getBoundingClientRect().right, spread: Math.max(0, ...spreads) };
  });
  expect(edges.gap - 2 * edges.spread).toBeGreaterThanOrEqual(1);
  await shot(page, `${shape}-wrong-code`);
  await page.getByRole("textbox", { name: "Digit 1", exact: true }).fill("9");
  await expect(page.getByRole("textbox", { name: "Digit 2", exact: true })).toBeFocused();
  expect(verifies).toBe(1); // Corrections submit on the sixth box, rather than spend a try on each edit.
  await paste(page, right, 5);
  await expect(page).toHaveURL("/plan?view=month");
  await expect(page.getByText("Signed in as Audrey", { exact: true })).toBeVisible();
  await page.reload();
  if (!isMobile) await expect(page.getByRole("link", { name: /Audrey/ })).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("link", { name: /Audrey/ })).toBeVisible();
  await avatarGap(page.getByRole("link", { name: /Audrey/ }));
  await shot(page, `${shape}-entry-in`);
  if (isMobile) await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Close" }).click();
  await page.goto("/sign-in?next=%2Fplan%3Fview%3Dmonth");
  await expect(page).toHaveURL("/plan?view=month");
  // A direct link into the account, followed by reload, must build the same identity.
  await page.goto("/plan?view=month&account=1");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Audrey", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText(EMAIL)).toBeVisible();
  await accountLayout(page, "Audrey");
  await shot(page, `${shape}-account`);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/plan?view=month");
  if (isMobile) await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
  await page.reload();
  if (isMobile) await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Sign in/ })).toBeVisible();
});

test("six typed digits submit once; blank and wrong-domain emails send nothing", async ({ page }) => {
  await page.goto("/sign-in?next=%2Ftasks");
  let sends = 0; let verifies = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/auth/code")) sends++; if (request.url().endsWith("/api/auth/verify")) verifies++; });
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByText("Use your @deushcs.com email.")).toBeVisible();
  await page.getByRole("textbox", { name: "Work email" }).fill("audrey@gmail.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByText("Use your @deushcs.com email.")).toBeVisible();
  expect(sends).toBe(0);
  await send(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: () => Promise.reject(new Error("Not allowed")) } }));
  await page.getByRole("button", { name: "Paste code", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Paste into any code box, or type the six digits from your email.");
  await page.clock.install();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: () => new Promise(() => {}) } }));
  await page.getByRole("button", { name: "Paste code", exact: true }).click();
  await page.clock.fastForward(16_000);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Paste into any code box, or type the six digits from your email.");
  const right = await code();
  for (let index = 0; index < 6; index++) await page.getByRole("textbox", { name: `Digit ${index + 1}`, exact: true }).pressSequentially(right[index]);
  await expect(page).toHaveURL("/tasks");
  expect(sends).toBe(1); expect(verifies).toBe(1);
  await account(page, false);
});

test("Safari shows Home Screen steps, standalone goes to email, and remembered installation cannot bypass the card", { tag: "@phone" }, async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => { Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1" }); localStorage.setItem("deus-installed", "1"); });
  await page.goto("/sign-in?next=%2Ftasks");
  await expect(page.getByText("Add DEUS Team Space to your Home Screen first,")).toBeVisible();
  await expect(page.getByText("DEUS Space (DEUS Team Space)")).toBeVisible();
  await shot(page, `${isMobile ? "390" : "1280"}-safari`);
  await page.getByRole("button", { name: "Sign in here anyway" }).click();
  await expect(page.getByRole("textbox", { name: "Work email" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the app" }).click();
  await expect(page).toHaveURL("/tasks");
  await page.addInitScript(() => { Object.defineProperty(navigator, "standalone", { value: true }); });
  await page.goto("/sign-in");
  await expect(page.getByRole("textbox", { name: "Work email" })).toBeVisible();
});

test("no answer, retry after a landed request, expired and rate-limited codes all remain recoverable", async ({ page, context }) => {
  await page.clock.install();
  await page.goto("/sign-in?next=%2Ftasks");
  await expect(page.getByRole("textbox", { name: "Work email" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText("Connect to the internet to sign in.")).toBeVisible();
  await shot(page, "1440-offline");
  await context.setOffline(false);
  let sends = 0;
  await page.route("**/api/auth/code", async (route) => {
    sends++;
    if (sends === 1) { await route.fetch(); await route.abort(); }
    else if (sends === 2) await route.continue();
    else await route.fulfill({ json: { status: "sent" } });
  });
  await page.getByRole("textbox", { name: "Work email" }).fill(EMAIL);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn’t confirm");
  await send(page); // Real server cooldown proves the first request landed; its code remains usable.
  await expect(page.getByRole("main").getByRole("alert")).toContainText("sent recently");
  let replies = 0;
  await page.route("**/api/auth/verify", async (route) => {
    replies++;
    await route.fulfill({ json: replies === 1 ? { status: "expired" } : { status: "tooMany", minutes: 15 } });
  });
  await paste(page, "123456");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This code has expired");
  await page.clock.fastForward(61_000);
  await page.getByRole("button", { name: "Send a new code", exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Digit 1", exact: true })).toHaveValue("");
  await paste(page, "123456");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many tries. Wait 15 minutes");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Use another email" }).click();
  await expect(page.getByRole("button", { name: "Send code", exact: true })).toBeEnabled();
});

test("a lost verify reply never reports success, and retrying the consumed code offers a new one", async ({ page }) => {
  await page.goto("/sign-in?next=%2Ftasks");
  await send(page);
  let verifies = 0;
  await page.route("**/api/auth/verify", async (route) => {
    verifies++;
    if (verifies === 1) { await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  const right = await code();
  await paste(page, right);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn’t sign you in");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("Signed in as Audrey")).toHaveCount(0);
  await paste(page, right);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This code has expired");
  expect(verifies).toBe(2);
});

test("busy requests cannot overlap, timed-out requests retry, and leaving ignores late replies", async ({ page }) => {
  await page.clock.install();
  await page.goto("/sign-in");
  let attempts = 0;
  let release: () => void = () => {};
  await page.route("**/api/auth/code", async (route) => {
    attempts++;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { status: "sent" } }).catch(() => {});
  });
  await page.getByRole("textbox", { name: "Work email" }).fill(EMAIL);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toHaveAttribute("aria-busy", "true");
  await shot(page, "1440-sending");
  await page.getByRole("button", { name: "Sending…" }).click({ force: true });
  expect(attempts).toBe(1);
  await page.clock.fastForward(16_000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn’t confirm");
  release();
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await page.getByRole("link", { name: "Back to the app" }).click();
  release();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Signed in as Audrey")).toHaveCount(0);
});

test("320px long identity, code boxes, More and account fit without sideways scrolling", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone stress layout");
  await page.setViewportSize({ width: 320, height: 740 });
  const email = `${"a".repeat(48)}@deushcs.com`; // 60 characters
  const name = "Audrey Wijaya Kusuma Nathalia Prameswari";
  expect(name).toHaveLength(40);
  await person(email, name);
  await page.goto("/sign-in?next=%2Ftasks");
  await send(page, email);
  await expect(page.getByText(/^Send a new code in /)).toHaveText(/in (1:00|0:[0-5]\d)$/);
  await shot(page, "320-code");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  for (let index = 0; index < 6; index++) {
    const box = await page.getByRole("textbox", { name: `Digit ${index + 1}`, exact: true }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await paste(page, await code(email));
  await expect(page).toHaveURL("/tasks");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await avatarGap(page.getByRole("link", { name: new RegExp(name) }));
  await expect(page.getByText(/^Signed in as/)).toHaveCount(0);
  await shot(page, "320-more");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByText(/^Signed in as/)).toHaveCount(0);
  await accountLayout(page, name);
  await shot(page, "320-account");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  // The same long name must fit the laptop side bar's fixed column too.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Close" }).click();
  await avatarGap(page.getByRole("link", { name: new RegExp(name) }));
  await shot(page, "1280-long-sidebar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
});

test("fresh-eyes: shared account entries fit three other screens at every size", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.setTimeout(120_000); // Sign-in plus six shared-page captures per project, without using live data.
  await page.goto("/sign-in");
  await send(page);
  await paste(page, await code());
  await expect(page).toHaveURL("/");
  for (const width of isMobile ? [320, 390] : [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 740 : isMobile ? 844 : 900 });
    for (const [name, path] of [["today", "/"], ["tasks", "/tasks"], ["companies", "/companies"]]) {
      await page.goto(isMobile ? `${path}?more=1` : path);
      await expect(page.getByRole("link", { name: /Audrey/ })).toBeVisible();
      await entryLayout(page, isMobile, "Audrey");
      await expectWordGaps(page.getByRole("link", { name: /Audrey/ }).locator("small"));
      if (isMobile) await readableSpaces(page.getByRole("link", { name: /^Install on this phone/ }).locator("small"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect((await auditLayout(page)).errors).toEqual([]);
      await shot(page, `${width}-shared-${name}`);
    }
  }
});
