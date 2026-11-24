import type { Locator, Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import { readAll, readDoc, seed } from "../support/emulator";
import { auditLayout } from "../../scripts/compare/layout.mjs";
import type { LeaveAudit, LeaveProfile, LeaveRequest } from "@/lib/leave";
import { enterLeaveCode, signInLeave } from "./leaveSession";
import { auditState, auditsState } from "./axeState";

const staff = "audrey.leave@deushcs.com";
const admin = "gregory.leave@deushcs.com";
const at = Date.parse("2027-02-09T10:00:00Z");
const myLeave = "**/api/leave/me";
const cancelUrl = "**/api/leave/requests/waiting/cancel";
const askUrl = "**/api/leave/requests";

const main = (page: Page) => page.getByRole("main");
const balance = (page: Page) => page.getByRole("region", { name: "Leave balance" });
const requests = (page: Page) => page.getByRole("region", { name: "Requests" });
const confirm = (page: Page) => page.getByRole("alertdialog", { name: "Cancel this request?" });
const sheet = (page: Page, name = "Annual leave") => page.getByRole("dialog", { name, exact: true });
const chooseCancel = (page: Page) => sheet(page).getByRole("button", { name: "Cancel request" }).click();
const cancel = (page: Page) => confirm(page).getByRole("button", { name: "Cancel request", exact: true });
const askSheet = (page: Page) => sheet(page, "Ask for leave");
const askLink = (page: Page) => balance(page).getByRole("link", { name: "Ask for leave" });
const send = (page: Page) => askSheet(page).getByRole("button", { name: "Send request", exact: true });
const askField = (page: Page, name: string) => askSheet(page).getByLabel(name, { exact: true });
const preview = (page: Page) => askSheet(page).getByRole("status");
const failedSend = "Not sent. Check your connection and try again.";
const captureAsk = process.env.LEAVE_SHOTS === "1" || process.env.LEAVE_SHOTS === "ask";
const captureReview = process.env.LEAVE_SHOTS === "l8-review";
const reviewFrames = new RegExp(process.env.LEAVE_REVIEW_FRAMES ?? ".");

async function people(name = "Audrey", adminName = "Gregory") {
  await seed("tasks", "people", [{ id: staff, email: staff, name, active: true }, { id: admin, email: admin, name: adminName, active: true }]);
}

function profile(overrides: Partial<LeaveProfile> = {}) {
  const row: LeaveProfile = {
    email: staff, name: "Audrey", joinDate: "2026-12-01", accrualStart: "2027-02-01", openingDate: "2027-02-01",
    openingBalance: 8, openingCarried: 0, endDate: null, updatedAt: at, ...overrides,
  };
  return { ...row, id: row.email };
}

function request(id: string, changes: Partial<LeaveRequest> = {}) {
  const row: LeaveRequest = {
    id, email: staff, name: "Audrey", status: "waiting", type: "annual", start: "2027-02-12", end: "2027-02-12", half: "morning",
    reason: null, event: null, hours: null, note: "", pay: null, createdBy: staff, createdAt: at, decidedBy: null, decidedAt: null,
    rejectReason: null, cancelledBy: null, cancelledAt: null, ...changes,
  };
  return row;
}

const signIn = (page: Page, next: string, email = staff) => signInLeave(page, next, email);

async function shot(page: Page, frame: string) {
  const reviewFrame = captureReview && frame.startsWith("mine-");
  const capture = reviewFrame || (frame.startsWith("ask-") ? captureAsk : process.env.LEAVE_SHOTS === "1");
  if (capture) {
    await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
    if (frame === "signed-out" || frame.startsWith("admin-nav")) await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
    if (frame.startsWith("admin-nav")) {
      await expect(page.getByText("Loading flows", { exact: true })).toHaveCount(0);
    }
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.getElementById("leave-test-hide-dev-tools")) {
      const style = document.createElement("style");
      style.id = "leave-test-hide-dev-tools";
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    }
    const layers = [...document.querySelectorAll('[aria-modal="true"]')];
    await Promise.all(layers.flatMap((layer) => layer.getAnimations()).map((animation) => animation.finished.catch(() => {})));
  });
  await expect.poll(async () => (await auditLayout(page)).errors, { message: frame, timeout: 2500 }).toEqual([]);
  const clipped = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[aria-modal="true"]')].at(-1);
    const root = dialog ?? document.querySelector("main")!;
    return [...root.querySelectorAll("h1, h2, p, dt, dd, small, a, button")].filter((node) => {
      const el = node as HTMLElement;
      return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
    }).map((el) => el.textContent?.slice(0, 65));
  });
  expect(clipped, frame).toEqual([]);
  await auditState(page, `mine/${frame}`);
  if (capture) {
    const folder = reviewFrame ? "leave-look/L8/review" : frame.startsWith("ask-") ? "leave-look/L6" : "leave-look";
    await page.screenshot({ path: `test-results/${folder}/${page.viewportSize()!.width}-${frame}.png`, animations: "disabled" });
  }
}

async function pauseAskOpening(page: Page) {
  if (!captureAsk) return;
  await page.evaluate(() => {
    document.addEventListener("animationstart", function pause(event) {
      const sheet = event.target;
      if (!(sheet instanceof HTMLElement) || sheet.getAttribute("role") !== "dialog" || sheet.querySelector("h2")?.textContent !== "Ask for leave") return;
      for (const layer of [sheet.previousElementSibling, sheet]) {
        for (const animation of layer?.getAnimations() ?? []) {
          animation.pause();
          animation.currentTime = 0;
        }
      }
      document.removeEventListener("animationstart", pause);
    });
  });
}

async function shootAskOpening(page: Page) {
  if (!captureAsk) return;
  const drawer = askSheet(page);
  const duration = await drawer.evaluate((sheet) => Number(sheet.getAnimations()[0]?.effect?.getTiming().duration ?? 0));
  expect(duration).toBeGreaterThan(0);
  const folder = `test-results/leave-look/L6/motion/${page.viewportSize()!.width}-ask-open`;
  for (let tick = 0; tick <= Math.ceil(duration * 30 / 1000); tick++) {
    const time = Math.min(tick * 1000 / 30, duration);
    await drawer.evaluate((sheet, at) => {
      for (const layer of [sheet.previousElementSibling, sheet]) {
        for (const animation of layer?.getAnimations() ?? []) {
          animation.currentTime = Math.min(at, Number(animation.effect?.getTiming().duration));
        }
      }
    }, time);
    await page.screenshot({ path: `${folder}-${String(Math.round(time)).padStart(3, "0")}.png` });
  }
  await drawer.evaluate((sheet) => {
    for (const layer of [sheet.previousElementSibling, sheet]) {
      for (const animation of layer?.getAnimations() ?? []) animation.finish();
    }
  });
}

async function openLeaveNav(page: Page, phone: boolean) {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  if (!phone) return nav;
  await nav.getByRole("button", { name: "More", exact: true }).click();
  return page.getByRole("dialog", { name: "More", exact: true });
}

async function waitingRequest() {
  await people();
  await seed("tasks", "leaveProfiles", [profile()]);
  await seed("tasks", "leaveRequests", [request("waiting")]);
}

async function askProfile(overrides?: Partial<LeaveProfile>) {
  await people();
  await seed("tasks", "leaveProfiles", [profile(overrides)]);
  await seed("tasks", "leaveHolidays", [{ id: "2027-02-08", date: "2027-02-08", name: "Test holiday" }]);
}

async function askDates(page: Page, from: string, to = from) {
  await askField(page, "From").fill(from);
  await askField(page, "To").fill(to);
}

async function mineReviewShot(page: Page, frame: string, row?: Locator) {
  if (!captureReview && auditsState(`mine/${frame}`)) {
    await row?.scrollIntoViewIfNeeded();
    await auditState(page, `mine/${frame}`);
    return;
  }
  if (!captureReview || !reviewFrames.test(frame)) return;
  await row?.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await shot(page, frame);
  const viewport = page.viewportSize()!;
  if (viewport.width === 390) {
    await page.setViewportSize({ width: 320, height: 740 });
    try {
      await row?.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await shot(page, frame);
    } finally {
      await page.setViewportSize(viewport);
    }
  }
}

test.describe("Leave", { tag: "@phone" }, () => {
  test.skip(() => process.env.LEAVE_SMOKE_OFF === "1" || process.env.SIGN_IN_SMOKE_OFF === "1", "Leave needs both flags.");
  test.use({ actionTimeout: 12_000, navigationTimeout: 35_000 });
  const pageErrors = new WeakMap<Page, Error[]>();
  test.beforeEach(async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 1280, height: 900 });
    const errors: Error[] = [];
    pageErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(error));
  });
  test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

  test("keeps the shared Leave forms, requests and audit rows readable in Mine", async ({ page }) => {
    test.setTimeout(captureReview ? 180_000 : 80_000);
    const longRejection = "Coverage is needed. ".repeat(25).trim();
    await askProfile({ email: admin, name: "Gregory" });
    await seed("tasks", "leaveRequests", [
      request("mine-waiting", { email: admin, name: "Gregory", createdBy: admin }),
      request("mine-approved", { email: admin, name: "Gregory", start: "2027-02-15", end: "2027-02-15", status: "approved",
        pay: "deduct", decidedBy: admin, decidedAt: at }),
      request("mine-refused", { email: admin, name: "Gregory", start: "2027-02-04", end: "2027-02-04", status: "rejected",
        decidedBy: admin, decidedAt: at, rejectReason: "Coverage is needed." }),
      request("mine-long-refusal", { email: admin, name: "Gregory", start: "2027-02-01", end: "2027-02-01", type: "sick", half: null,
        status: "rejected", decidedBy: admin, decidedAt: at, rejectReason: longRejection }),
    ]);
    await signIn(page, "/leave", admin);
    await askLink(page).click();
    const ask = askSheet(page);
    await askDates(page, "17/2/2027", "18 Feb 2027");
    await expect(askField(page, "From")).toHaveValue("17 Feb 2027");
    await expect(preview(page)).toContainText("2 working days");
    await mineReviewShot(page, "mine-annual");
    await ask.getByRole("button", { name: "Sick", exact: true }).click();
    await expect(askField(page, "To")).toHaveValue("18 Feb 2027");
    await mineReviewShot(page, "mine-sick");
    await ask.getByRole("button", { name: "Other absence", exact: true }).click();
    await askField(page, "Reason").selectOption("hours");
    await askField(page, "From time").fill("09:30");
    await askField(page, "To time").fill("11:00");
    await expect(askField(page, "Date")).toHaveValue("17 Feb 2027");
    await mineReviewShot(page, "mine-hours");
    await ask.getByRole("button", { name: "Close", exact: true }).click();

    for (const [label, frame] of [
      ["Waiting", "mine-request-waiting"], ["Approved", "mine-request-approved"], ["Not approved", "mine-request-declined"],
    ]) {
      await requests(page).getByRole("link", { name: new RegExp(`Annual leave.*${label}$`) }).click();
      const record = sheet(page);
      await expect(record.getByText(label, { exact: true })).toBeVisible();
      if (label === "Not approved") {
        await expect(page).toHaveURL("/leave?request=mine-refused");
        await page.reload();
        await expect(record.getByText(label, { exact: true })).toBeVisible({ timeout: 25_000 });
        await expect(record.getByText("Coverage is needed.", { exact: true })).toBeVisible();
        await expect(record.getByRole("button", { name: /^(Cancel request|Mark as cancelled)$/ })).toHaveCount(0);
        const decision = record.getByText("Not approved by Gregory on Tue 9 Feb", { exact: true });
        await expect(decision).toBeVisible();
        const bottomSpace = await decision.evaluate((line) =>
          line.closest('[role="dialog"]')!.getBoundingClientRect().bottom - line.getBoundingClientRect().bottom);
        expect(bottomSpace).toBeLessThan(40);
      } else {
        await expect(record.getByRole("button", { name: "Cancel request", exact: true })).toBeVisible();
      }
      await mineReviewShot(page, frame);
      await record.getByRole("button", { name: "Close", exact: true }).click();
    }

    await page.goto("/leave?request=mine-long-refusal");
    const longRefusal = sheet(page, "Sick");
    await expect(longRefusal.getByText(longRejection, { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(longRefusal.getByRole("button", { name: "Close", exact: true })).toBeInViewport({ ratio: 1 });
    await mineReviewShot(page, "mine-request-long-declined");
    await longRefusal.getByRole("button", { name: "Close", exact: true }).click();

    const changes = [
      { field: "accrualStart", from: "2027-02-01", to: "2027-04-01", text: "Monthly +1 starts 1 Feb 2027 → 1 Apr 2027" },
      { field: "openingBalance", from: 7, to: 8, text: "Opening balance 7 days → 8 days" },
      { field: "endDate", from: "2027-02-26", to: null, text: "Last day 26 Feb 2027 → None" },
    ] as const;
    for (const [index, { field, from, to, text }] of changes.entries()) {
      const row = { id: field, email: admin, by: admin, at: at + index, field, from, to } satisfies LeaveAudit;
      await seed("tasks", "leaveAudit", [row]);
      if (index === 0) await page.goto("/leave?view=history");
      else await page.reload();
      const change = main(page).getByRole("listitem").filter({ hasText: text });
      await expect(change).toContainText("Details changed by Gregory", { timeout: 25_000 });
      await mineReviewShot(page, `mine-audit-${field}`, change);
    }
  });

  test("a signed-out deep link comes back to the request; Mine shows balances, statuses and history after cancellation", async ({ page }) => {
    test.setTimeout(100_000); // The first visit compiles both Leave and sign-in on the isolated dev server.
    await people();
    await seed("tasks", "leaveProfiles", [profile({ openingDate: "2027-01-01", openingBalance: 7, openingCarried: 3.5 })]);
    await seed("tasks", "leaveRequests", [
      request("waiting", { note: "Family visit" }),
      request("approved", { status: "approved", start: "2027-02-15", end: "2027-02-15", half: null, pay: "deduct", decidedBy: admin, decidedAt: at }),
      request("rejected", { status: "rejected", type: "other", reason: "else", half: null, note: "Personal appointment", rejectReason: "We need cover that morning.", decidedBy: admin, decidedAt: at }),
      request("cancelled", { status: "cancelled", type: "sick", cancelledBy: admin, cancelledAt: at, half: null }),
      request("private", { email: admin, name: "Gregory", note: "Private request" }),
    ]);
    const path = "/leave?request=waiting&ref=push";
    await page.goto(path);
    await expect(main(page).getByText("Sign in to see your leave")).toBeVisible();
    await shot(page, "signed-out");
    const signInLink = main(page).getByRole("link", { name: "Sign in", exact: true });
    await expect(signInLink).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(path)}`);
    await signInLink.click();
    await enterLeaveCode(page, staff);
    await expect(page).toHaveURL(path);
    await expect(sheet(page).getByText("Requested by Audrey on Tue 9 Feb")).toBeVisible();
    await expect(sheet(page).getByText("Family visit")).toBeVisible();
    await shot(page, "request-waiting");
    await chooseCancel(page);
    await expect(confirm(page).getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await shot(page, "cancel-confirm");
    await confirm(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await sheet(page).getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL("/leave?ref=push");
    await expect(balance(page).getByText("8 days", { exact: true })).toBeVisible();
    await expect(balance(page).getByText("6.5 days", { exact: true })).toBeVisible();
    await expect(balance(page).getByText("2 days from 2026 lapse after Sun 28 Feb")).toBeVisible();
    await expect(requests(page).getByRole("link")).toHaveText([/Annual leave.*Waiting/, /Annual leave.*Approved/, /Sick.*Cancelled/, /Other absence.*Not approved/]);
    await expect(requests(page).getByRole("link").first()).toHaveAccessibleName(/Annual leave Fri 12 Feb · 0.5 day Waiting/);
    await expect(requests(page).getByText("Private request")).toHaveCount(0);
    await shot(page, "eight-days-requests-lapse");

    await requests(page).getByRole("link", { name: /Approved/ }).click();
    await expect(sheet(page).getByText("Approved by Gregory on Tue 9 Feb")).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Cancel request" })).toBeVisible();
    await shot(page, "request-approved");
    await page.goBack();
    await expect(sheet(page)).toBeHidden();
    await requests(page).getByRole("link", { name: /Not approved/ }).click();
    await expect(sheet(page, "Other absence").getByText("We need cover that morning.")).toBeVisible();
    await expect(sheet(page, "Other absence").getByRole("button", { name: /Cancel request|Mark as cancelled/ })).toHaveCount(0);
    await shot(page, "request-rejected");
    await sheet(page, "Other absence").getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL("/leave?ref=push");

    await requests(page).getByRole("link", { name: /Annual leave.*Waiting/ }).click();
    await chooseCancel(page);
    await cancel(page).click();
    await expect(sheet(page).getByText(/Cancelled by Audrey/)).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Close" })).toBeFocused();
    expect((await readDoc("tasks", "leaveRequests/waiting"))?.status).toBe("cancelled");
    await page.goto("/leave?request=cancelled");
    await expect(sheet(page, "Sick").getByText("Cancelled by Gregory on Tue 9 Feb")).toBeVisible();
    await shot(page, "request-cancelled-link");
    await sheet(page, "Sick").getByRole("button", { name: "Close" }).click();
    await expect(balance(page).getByText("7 days", { exact: true })).toBeVisible();
    await main(page).getByRole("button", { name: "History", exact: true }).click();
    const history = page.getByRole("region", { name: "History" });
    await expect(history.getByRole("listitem")).toHaveText([/Annual leave.*−1 day.*Balance 7 days/, /Monthly \+1.*\+1 day.*Balance 8 days/, /Opening balance.*\+7 days.*Balance 7 days/]);
    await shot(page, "history");
    await page.goto("/leave?view=history&request=private");
    await expect(page.getByText("This leave request couldn't be found.")).toBeVisible();
    await expect(page).toHaveURL("/leave?view=history");
    await expect(history).toBeVisible();
  });

  test("an unset-up profile gets a name, and loading, failure and offline recover to an empty half-day balance", async ({ page, context }) => {
    await people("Audrey", "Gregory Kurnia");
    await signIn(page, "/leave");
    await expect(main(page).getByText("Your leave isn’t set up yet. Ask Gregory.")).toBeVisible();
    await shot(page, "not-set-up");
    await seed("tasks", "leaveProfiles", [profile({ openingBalance: 0.5 })]);

    const release = Promise.withResolvers<void>();
    const failOnce = async (route: Route) => {
      await release.promise;
      await route.fulfill({ status: 503, json: { error: "Leave needs a connection. Try again." } });
    };
    await page.route(myLeave, failOnce, { times: 1 });
    await page.reload();
    await expect(main(page).getByText("Loading leave", { exact: true })).toBeVisible();
    await shot(page, "loading");
    release.resolve();
    await expect(main(page).getByText("Couldn’t load leave.")).toBeVisible();
    await shot(page, "failed-load");
    await main(page).getByRole("button", { name: "Try again" }).click();
    await expect(main(page).getByRole("heading", { name: "No requests yet" })).toBeVisible();
    await expect(balance(page).getByText("0.5 day", { exact: true }).first()).toBeVisible();
    await shot(page, "empty-half-day");
    await context.setOffline(true);
    await expect(main(page).getByText("Leave needs a connection")).toBeVisible();
    await expect(balance(page)).toBeHidden();
    await shot(page, "offline");
    await context.setOffline(false);
    await expect(balance(page).getByText("0.5 day", { exact: true }).first()).toBeVisible();

    const firstRead = Promise.withResolvers<void>();
    const deliverOld = Promise.withResolvers<void>();
    const oldFinished = Promise.withResolvers<void>();
    await page.route(myLeave, async (route) => {
      const response = await route.fetch();
      firstRead.resolve();
      await deliverOld.promise;
      await route.fulfill({ response }).catch(() => {}); // the browser can already have aborted the request
      oldFinished.resolve();
    }, { times: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await firstRead.promise;
    await seed("tasks", "leaveProfiles", [profile({ openingBalance: 8 })]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(balance(page).getByText("8 days", { exact: true }).first()).toBeVisible();
    deliverOld.resolve();
    await oldFinished.promise;
    await expect(balance(page).getByText("0.5 day", { exact: true })).toHaveCount(0);
  });

  test("an admin sees one and twelve waiting requests in the Leave navigation entry", async ({ page, isMobile }) => {
    await people();
    await seed("tasks", "leaveProfiles", [profile({ email: admin, name: "Gregory" })]);
    await seed("tasks", "leaveRequests", [request("waiting", { email: admin, name: "Gregory", createdBy: admin })]);
    await signIn(page, "/flows", admin);
    const nav = await openLeaveNav(page, isMobile);
    const leave = nav.getByRole("link", { name: /^Leave\b/ });
    await expect(leave).toHaveAccessibleName(/1 waiting/);
    await shot(page, "admin-nav-one");
    await seed("tasks", "leaveRequests", Array.from({ length: 11 }, (_, index) => request(`other-${index}`)));
    await page.reload();
    await expect(leave).toHaveAccessibleName(/12 waiting/);
    await shot(page, "admin-nav-twelve");
    await leave.click();
    await expect(page).toHaveURL("/leave");
    await expect(main(page).getByRole("heading", { name: "Leave", level: 1 })).toBeVisible();
    await requests(page).getByRole("link", { name: /Waiting/ }).click();
    await chooseCancel(page);
    await cancel(page).click();
    await expect(sheet(page).getByText(/Cancelled by Gregory/)).toBeVisible();
    await sheet(page).getByRole("button", { name: "Close" }).click();
    if (isMobile) await expect(page.getByRole("button", { name: "More", exact: true })).toHaveAttribute("aria-current", "page");
    const updatedNav = await openLeaveNav(page, isMobile);
    await expect(updatedNav.getByRole("link", { name: /^Leave\b/ })).toHaveAccessibleName(/11 waiting/);
    await expect(updatedNav.getByRole("link", { name: /^Leave\b/ })).toHaveAttribute("aria-current", "page");
  });

  test("a negative balance shows its warning, and long details and audit dates fit at 320px", async ({ page, isMobile }) => {
    const name = "Alexandria Ramadhani Nirmala Hadinata Put".slice(0, 40);
    const note = `${"Cover the team handover with the operations lead. ".repeat(10)}End of note.`.slice(0, 500).padEnd(500, "x");
    const audit: LeaveAudit = { id: "audit", email: staff, by: admin, at, field: "accrualStart", from: "2027-02-01", to: "2027-04-01" };
    await people("Audrey", name);
    await seed("tasks", "leaveProfiles", [profile({ openingBalance: -2, accrualStart: "2027-04-01" })]);
    await seed("tasks", "leaveRequests", [request("waiting", { note, createdBy: admin })]);
    await seed("tasks", "leaveAudit", [audit]);
    await signIn(page, "/leave");
    await expect(balance(page).getByText("−2 days", { exact: true })).toBeVisible();
    await expect(balance(page).getByText(/Below zero is leave taken in advance/)).toBeVisible();
    await shot(page, "below-zero");
    if (!isMobile) return;
    await page.setViewportSize({ width: 320, height: 844 });
    // Combine both warnings for layout stress while the real ledger prevents this balance/warning combination.
    await seed("tasks", "leaveProfiles", [profile({ openingBalance: -99.5, accrualStart: "2027-04-01" })]);
    await page.route(myLeave, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      await route.fulfill({ response, json: { ...json, summary: { ...json.summary, lapseWarning: 2 } } });
    });
    await page.goto("/leave?view=history");
    await expect(balance(page).getByText("−99.5 days", { exact: true })).toBeVisible();
    await expect(balance(page).getByText(/2 days from 2026 lapse/)).toBeVisible();
    const auditRow = main(page).getByRole("listitem").filter({ hasText: "Monthly +1 starts 1 Feb 2027 → 1 Apr 2027" });
    await expect(auditRow).toContainText(`Details changed by ${name}`);
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    const prospectLines = await navigation.getByRole("link", { name: "Prospects" }).evaluate((link) => {
      const label = [...link.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      const range = document.createRange();
      range.selectNodeContents(label!);
      return range.getClientRects().length;
    });
    expect(prospectLines).toBe(1);
    await shot(page, "stress-history");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const opening = await main(page).getByRole("listitem").filter({ hasText: "Opening balance" }).boundingBox();
    expect(opening!.y + opening!.height).toBeLessThan((await navigation.boundingBox())!.y);
    await shot(page, "stress-history-foot");
    await page.goto("/leave?request=waiting");
    await expect(sheet(page).getByText(note, { exact: true })).toBeVisible();
    const requestedBy = sheet(page).getByText(`Requested by ${name} on Tue 9 Feb`);
    await expect(requestedBy).toBeVisible();
    await requestedBy.scrollIntoViewIfNeeded();
    await expect(sheet(page).getByRole("button", { name: "Cancel request" })).toBeInViewport();
    await shot(page, "stress-request-link");
  });

  test("an unanswered cancellation is retryable and a lost committed reply reconciles exactly once", async ({ page }) => {
    await waitingRequest();
    await signIn(page, "/leave?request=waiting");
    let calls = 0;
    await page.route(cancelUrl, async (route) => {
      calls += 1;
      if (calls === 2) expect((await route.fetch()).ok()).toBe(true);
      await route.abort("failed");
    });
    await chooseCancel(page);
    await cancel(page).click();
    await expect(confirm(page).getByText("Couldn’t confirm the cancellation. Try again.")).toBeVisible();
    expect((await readDoc("tasks", "leaveRequests/waiting"))?.status).toBe("waiting");
    await shot(page, "cancel-failed");
    await cancel(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(sheet(page).getByText(/Cancelled by Audrey/)).toBeVisible();
    await expect(confirm(page)).toBeHidden();
    expect((await readDoc("tasks", "leaveRequests/waiting"))?.status).toBe("cancelled");
    expect(calls).toBe(2);
  });

  test("leaving the sheet mid-save refreshes the row without reopening it or showing an old toast", async ({ page }) => {
    await waitingRequest();
    await signIn(page, "/leave");
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    await page.route(cancelUrl, async (route) => {
      const response = await route.fetch();
      started.resolve();
      await finish.promise;
      await route.fulfill({ response });
    });
    await requests(page).getByRole("link", { name: /Waiting/ }).click();
    await chooseCancel(page);
    await cancel(page).click();
    await started.promise;
    await page.goBack();
    await expect(sheet(page)).toBeHidden();
    finish.resolve();
    await expect(requests(page).getByRole("link", { name: /Cancelled/ })).toBeVisible();
    await expect(confirm(page)).toBeHidden();
    await expect(page.getByText("Request cancelled", { exact: true })).toHaveCount(0);
  });

  test("asks for three days across a weekend and reads the confirmed request and balance back", async ({ page }) => {
    test.setTimeout(115_000);
    await askProfile();
    await signIn(page, "/leave?view=history&ref=ask-test");
    await expect(askLink(page)).toBeInViewport();
    await shot(page, "ask-entry");
    await pauseAskOpening(page);
    await askLink(page).click();
    await expect(page).toHaveURL(/view=history&ref=ask-test&ask=1$/);
    await expect(askSheet(page)).toBeVisible();
    await shootAskOpening(page);
    await shot(page, "ask-annual-empty");
    await askDates(page, "2027-02-12", "2027-02-16");
    await expect(preview(page)).toHaveText("3 working days · Available after: 5 days");
    await expect(askSheet(page).getByRole("group", { name: "Length" })).toHaveCount(0);
    await expect(send(page)).toBeInViewport();
    await shot(page, "ask-annual-three-days");
    await send(page).click();
    await expect(page.getByText("Sent to Gregory", { exact: true })).toBeVisible();
    await expect(page).toHaveURL("/leave?ref=ask-test");
    const row = requests(page).getByRole("link", { name: /Annual leave.*3 days.*Waiting/ });
    await expect(row).toBeVisible();
    await expect(balance(page).getByText("5 days", { exact: true })).toBeVisible();
    await shot(page, "ask-sent");
    await row.click();
    await expect(sheet(page).getByText("3 days", { exact: true })).toBeVisible();
    await page.reload();
    await expect(sheet(page).getByText(/Requested by Audrey/)).toBeVisible();
    expect(await readAll("tasks", "leaveRequests")).toEqual([expect.objectContaining({ type: "annual", status: "waiting", half: null })]);
  });

  test("reserves a half day below zero and counts a backdated sick range with a past holiday", async ({ page }) => {
    await askProfile({ openingBalance: 0 });
    await signIn(page, "/leave?ask=1");
    await expect(askSheet(page)).toBeVisible();
    await page.reload();
    await expect(askSheet(page)).toBeVisible();
    await expect(askField(page, "From")).toHaveValue("");
    await shot(page, "ask-direct-link");
    await askDates(page, "2027-02-12");
    const length = askSheet(page).getByRole("group", { name: "Length" });
    await length.getByRole("button", { name: "Morning" }).click();
    await expect(preview(page)).toHaveText("0.5 working day · Available after: −0.5 day, taken in advance");
    await askField(page, "To").fill("2027-02-15");
    await expect(length).toHaveCount(0);
    await askField(page, "To").fill("2027-02-12");
    await expect(length.getByRole("button", { name: "Full day" })).toHaveAttribute("aria-pressed", "true");
    await length.getByRole("button", { name: "Afternoon" }).click();
    await shot(page, "ask-half-day-below-zero");
    await send(page).click();
    await expect(requests(page).getByRole("link", { name: /Annual leave.*0.5 day.*Waiting/ })).toBeVisible();
    await expect(page.getByText("Sent to Gregory", { exact: true })).toBeVisible();

    await askLink(page).click();
    await expect(page.getByText("Sent to Gregory", { exact: true })).toHaveCount(0);
    await askSheet(page).getByRole("button", { name: "Sick", exact: true }).click();
    await askDates(page, "2027-02-08", "2027-02-09");
    await expect(preview(page)).toHaveText("1 working day · Available after: −0.5 day, taken in advance");
    await shot(page, "ask-sick-yesterday");
    await send(page).click();
    await expect(requests(page).getByRole("link", { name: /Sick.*1 day.*Waiting/ })).toBeVisible();
    expect(await readAll("tasks", "leaveRequests")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "annual", half: "afternoon" }),
      expect.objectContaining({ type: "sick", start: "2027-02-08", end: "2027-02-09", half: null }),
    ]));
  });

  test("shows all other absence reasons and keeps cap, overlap and note refusals on their fields", async ({ page, isMobile }) => {
    await askProfile();
    await seed("tasks", "leaveRequests", [request("waiting")]);
    await signIn(page, "/leave?ask=1");
    await askSheet(page).getByRole("button", { name: "Other absence" }).click();
    const reason = askField(page, "Reason");
    await expect(reason.locator("option")).toHaveText(["Choose a reason", "Special leave", "Leave by law", "A few hours", "Unpaid", "Something else"]);
    await send(page).click();
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAccessibleDescription("Choose an absence reason.");
    await reason.selectOption("special");
    const event = askField(page, "Event");
    await expect(event.locator("option")).toHaveCount(8);
    await event.selectOption("marriage");
    await expect(event).toHaveAccessibleDescription("Up to 3 days");
    await askDates(page, "2027-02-15", "2027-02-19");
    await send(page).click();
    await expect(askField(page, "To")).toBeFocused();
    await expect(askField(page, "To")).toHaveAccessibleDescription("This special leave allows up to 3 days.");
    await shot(page, "ask-refused-special-cap");
    await askField(page, "To").fill("2027-02-17");
    await expect(preview(page)).toHaveText("3 working days · Available after: 7.5 days");
    await shot(page, "ask-special");
    await askDates(page, "2027-02-15");
    await event.selectOption("householdDeath");
    await expect(event).toHaveAccessibleDescription("Up to 1 day");
    await reason.selectOption("law");
    await expect(event).toHaveValue("");
    await expect(event.locator("option")).toHaveText(["Choose an event", "Maternity", "Miscarriage", "Menstrual leave", "Religious duty"]);
    await event.selectOption("maternity");
    await askDates(page, "2027-02-08");
    await expect(askField(page, "To")).toHaveAccessibleDescription("These dates have no working days.");
    await askDates(page, "2028-02-21");
    await event.selectOption("religiousDuty");
    await expect(askSheet(page).getByText("Holidays for 2028 aren’t in the list yet, so this count may change.")).toBeVisible();
    await shot(page, "ask-law-holiday-warning");
    await reason.selectOption("unpaid");
    await expect(event).toHaveCount(0);
    await askDates(page, "2027-02-15");
    await shot(page, "ask-unpaid");
    await reason.selectOption("else");
    const note = askField(page, "Note");
    await note.fill("   ");
    await send(page).click();
    await expect(note).toBeFocused();
    await expect(note).toHaveAccessibleDescription("Add a note about this absence.");
    await shot(page, "ask-refused-blank-note");
    await note.fill("x".repeat(501));
    await expect(note).toHaveAccessibleDescription("Use 500 characters or fewer.");
    await note.fill("An appointment");
    await expect(note).not.toHaveAttribute("aria-invalid");
    await expect(preview(page)).toHaveText("1 working day · Available after: 6.5 days");
    await shot(page, "ask-something-else");
    await askDates(page, "2027-02-12");
    await send(page).click();
    await expect(askField(page, "From")).toBeFocused();
    await expect(askField(page, "From")).toHaveAccessibleDescription("You already have leave on Fri 12 Feb.");
    await shot(page, "ask-refused-overlap");
    expect(await readAll("tasks", "leaveRequests")).toHaveLength(1);

    if (!isMobile) return;
    await askSheet(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(askSheet(page)).toBeHidden();
    await page.setViewportSize({ width: 320, height: 780 });
    await askLink(page).click();
    await askSheet(page).getByRole("button", { name: "Other absence" }).click();
    await reason.selectOption("special");
    await event.selectOption("closeFamilyDeath");
    await askDates(page, "2027-02-15", "2027-02-16");
    await expect(event).toHaveAccessibleDescription("Up to 2 days");
    await expect(askSheet(page).locator('span[aria-hidden="true"]').filter({ hasText: /Death of a spouse/ })).toBeInViewport();
    await expect(askSheet(page).getByLabel(/^Note/)).toBeInViewport({ ratio: 1 });
    await expect(preview(page)).toBeInViewport();
    await expect(send(page)).toBeInViewport();
    await shot(page, "ask-longest-event");
  });

  test("takes one date for hours, refuses reversed or out-of-range times, and saves the hours", async ({ page }) => {
    await askProfile();
    await signIn(page, "/leave?ask=1");
    await askSheet(page).getByRole("button", { name: "Other absence" }).click();
    await askField(page, "Reason").selectOption("hours");
    await askField(page, "Date").fill("2027-02-13");
    await expect(askField(page, "Date")).toHaveAccessibleDescription("These dates have no working days.");
    await askField(page, "Date").fill("2027-02-11");
    await askField(page, "From time").fill("06:59");
    await expect(askField(page, "From time")).toHaveAccessibleDescription("Enter a start time between 07:00 and 20:00.");
    await askField(page, "From time").fill("08:00");
    await askField(page, "To time").fill("07:30");
    await expect(askField(page, "To time")).toHaveAccessibleDescription("The end time must be after the start time.");
    await askField(page, "To time").fill("10:30");
    await expect(preview(page)).toHaveText("1 working day · Available after: 8 days");
    await shot(page, "ask-hours");
    await send(page).click();
    await requests(page).getByRole("link", { name: /Other absence.*Waiting/ }).click();
    await expect(sheet(page, "Other absence").getByText("08:00 to 10:30")).toBeVisible();
    expect(await readAll("tasks", "leaveRequests")).toEqual([expect.objectContaining({
      type: "other", reason: "hours", start: "2027-02-11", end: "2027-02-11", half: null, event: null,
      hours: { from: "08:00", to: "10:30" },
    })]);
  });

  test("keeps the draft offline or after a lost reply and retries with the same key without undoing a newer status", async ({ page, context }) => {
    await askProfile();
    await signIn(page, "/leave?ask=1");
    await askDates(page, "2027-02-12");
    const note = askSheet(page).getByLabel(/^Note/);
    await note.fill("Family plans");
    await context.setOffline(true);
    await send(page).click();
    await expect(askSheet(page).getByRole("alert")).toHaveText(failedSend);
    await expect(note).toHaveValue("Family plans");
    await context.setOffline(false);
    await expect(page.getByText("Back online. Everything is up to date.", { exact: true })).toBeAttached();
    const failureNotice = askSheet(page).getByRole("alert");
    expect(await failureNotice.evaluate((notice) => {
      const text = notice.querySelector("p")!.getBoundingClientRect();
      return notice.contains(document.elementFromPoint(text.x + text.width / 2, text.y + text.height / 2));
    })).toBe(true);

    const release = Promise.withResolvers<void>();
    const began = Promise.withResolvers<void>();
    const keys: string[] = [];
    await page.route(askUrl, async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      if (keys.length === 1) {
        began.resolve();
        await release.promise;
      } else if (keys.length === 2) {
        expect((await route.fetch()).ok()).toBe(true);
        const [saved] = await readAll("tasks", "leaveRequests");
        await seed("tasks", "leaveRequests", [{ ...saved, id: String(saved.id), status: "cancelled", cancelledBy: staff, cancelledAt: at }]);
        await page.route(myLeave, (read) => read.abort("failed"), { times: 1 });
      } else {
        const response = await route.fetch();
        expect(response.status()).toBe(409);
        await route.fulfill({ response });
        return;
      }
      await route.abort("failed");
    });
    await send(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await began.promise;
    const sending = askSheet(page).getByRole("button", { name: "Sending…" });
    await expect(sending).toHaveAttribute("aria-busy", "true");
    await expect(note).toBeDisabled();
    await expect(page.getByText("Sent to Gregory", { exact: true })).toHaveCount(0);
    await shot(page, "ask-sending");
    release.resolve();
    await expect(askSheet(page).getByRole("alert")).toHaveText(failedSend);
    await expect(note).toHaveValue("Family plans");
    await expect(askField(page, "From")).toHaveValue("12 Feb 2027");
    expect(await readAll("tasks", "leaveRequests")).toHaveLength(0);
    await shot(page, "ask-failed-send");

    await send(page).click();
    await expect(askSheet(page).getByRole("alert")).toHaveText(failedSend);
    await send(page).click();
    await expect(page.getByText("Request received", { exact: true })).toBeVisible();
    await expect(requests(page).getByRole("link", { name: /Cancelled/ })).toBeVisible();
    expect(keys).toEqual([keys[0], keys[0], keys[0]]);
    expect(keys[0]).toMatch(/^[\da-f-]{36}$/);
    expect(await readAll("tasks", "leaveRequests")).toEqual([expect.objectContaining({ status: "cancelled", note: "Family plans" })]);
  });

  test("places a late server refusal on its date while keeping the rest of the draft", async ({ page }) => {
    await askProfile();
    await signIn(page, "/leave?ask=1");
    await askDates(page, "2027-02-12");
    const note = askSheet(page).getByLabel(/^Note/);
    await note.fill("Keep this note");
    await seed("tasks", "leaveRequests", [request("another-device")]);
    await expect(preview(page)).toHaveText("1 working day · Available after: 7 days");
    await send(page).click();
    await expect(askField(page, "From")).toBeFocused();
    await expect(askField(page, "From")).toHaveAccessibleDescription("You already have leave on Fri 12 Feb.");
    await expect(note).toHaveValue("Keep this note");
    await expect(askSheet(page).getByRole("alert")).toHaveCount(0);
    await auditState(page, "mine/ask-late-refusal");
    await askDates(page, "2027-02-15");
    await send(page).click();
    await expect(page.getByText("Sent to Gregory", { exact: true })).toBeVisible();
    expect(await readAll("tasks", "leaveRequests")).toHaveLength(2);
  });

  test("a reply after browser Back refreshes the list and leaves a newer draft open", async ({ page }) => {
    await askProfile();
    await signIn(page, "/leave");
    const committed = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<void>();
    await page.route(askUrl, async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committed.resolve();
      await reply.promise;
      await route.fulfill({ response });
    }, { times: 1 });
    await askLink(page).click();
    await askDates(page, "2027-02-12");
    await send(page).click();
    await committed.promise;
    await page.goBack();
    await expect(askSheet(page)).toBeHidden();
    await askLink(page).click();
    await askDates(page, "2027-02-15");
    reply.resolve();
    await expect(preview(page)).toHaveText("1 working day · Available after: 6 days");
    await expect(askField(page, "From")).toHaveValue("15 Feb 2027");
    await expect(page.getByText("Sent to Gregory", { exact: true })).toHaveCount(0);
    await askSheet(page).getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL("/leave");
    await expect(requests(page).getByRole("link", { name: /Waiting/ })).toHaveCount(1);
    await page.reload();
    await expect(requests(page).getByRole("link", { name: /Fri 12 Feb.*Waiting/ })).toBeVisible();
  });

  test("an admin chooses pay for their own other absence and sees the confirmed approval", async ({ page }) => {
    await askProfile({ email: admin, name: "Gregory" });
    await signIn(page, "/leave?ask=1", admin);
    await askSheet(page).getByRole("button", { name: "Other absence" }).click();
    await askField(page, "Reason").selectOption("else");
    await askDates(page, "2027-02-12");
    await askField(page, "Note").fill("An appointment");
    await send(page).click();
    const pay = askField(page, "Pay");
    await expect(pay).toBeFocused();
    await expect(pay).toHaveAccessibleDescription("Choose how this absence is paid.");
    await pay.selectOption("deduct");
    await expect(preview(page)).toHaveText("1 working day · Available after: 7 days");
    await pay.selectOption("paid");
    await expect(preview(page)).toHaveText("1 working day · Available after: 8 days");
    await shot(page, "ask-admin-pay");
    await send(page).click();
    await expect(page.getByText("Added", { exact: true })).toBeVisible();
    await expect(requests(page).getByRole("link", { name: /Other absence.*Approved/ })).toBeVisible();
    expect(await readAll("tasks", "leaveRequests")).toEqual([expect.objectContaining({ email: admin, pay: "paid", status: "approved" })]);
  });
});
