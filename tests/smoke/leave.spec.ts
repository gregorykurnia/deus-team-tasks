import type { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import { readAll, readDoc, seed } from "../support/emulator";
import { auditLayout } from "../../scripts/compare/layout.mjs";
import type { LeaveAudit, LeaveProfile, LeaveRequest } from "@/lib/leave";

const staff = "audrey.leave@deushcs.com";
const admin = "gregory.leave@deushcs.com";
const at = Date.parse("2027-02-09T10:00:00Z");
const myLeave = "**/api/leave/me";
const cancelUrl = "**/api/leave/requests/waiting/cancel";

const main = (page: Page) => page.getByRole("main");
const balance = (page: Page) => page.getByRole("region", { name: "Leave balance" });
const requests = (page: Page) => page.getByRole("region", { name: "Requests" });
const confirm = (page: Page) => page.getByRole("alertdialog", { name: "Cancel this request?" });
const sheet = (page: Page, name = "Annual leave") => page.getByRole("dialog", { name, exact: true });
const chooseCancel = (page: Page) => sheet(page).getByRole("button", { name: "Cancel request" }).click();
const cancel = (page: Page) => confirm(page).getByRole("button", { name: "Cancel request", exact: true });

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

async function signIn(page: Page, next: string, email = staff) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await enterCode(page, email);
}

async function enterCode(page: Page, email: string) {
  await page.getByRole("textbox", { name: "Work email" }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  const code = (await readAll("tasks", "_fakeMail")).find((row) => row.to === email)?.code;
  expect(code).toMatch(/^\d{6}$/);
  await page.getByRole("textbox", { name: "Digit 1", exact: true }).pressSequentially(String(code));
  await expect(page).not.toHaveURL(/\/sign-in/);
  const notifications = page.getByRole("dialog", { name: "Notifications", exact: true });
  if (new URL(page.url()).searchParams.has("notifications")) {
    await notifications.getByRole("button", { name: "Close", exact: true }).click();
  }
}

async function shot(page: Page, frame: string) {
  if (process.env.LEAVE_SHOTS === "1") {
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
  if (process.env.LEAVE_SHOTS === "1") {
    await page.screenshot({ path: `test-results/leave-look/${page.viewportSize()!.width}-${frame}.png`, animations: "disabled" });
  }
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
    await enterCode(page, staff);
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
    await expect(sheet(page, "Other absence").getByRole("button", { name: "Cancel request" })).toHaveCount(0);
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
    await expect(main(page).getByText(`Details changed by ${name}: +1 from 1 Feb 2027 → 1 Apr 2027`)).toBeVisible();
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
});
