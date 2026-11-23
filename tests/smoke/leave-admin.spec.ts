import type { Page } from "@playwright/test";
import type { LeaveProfile, LeaveRequest } from "@/lib/leave";
import { auditLayout } from "../../scripts/compare/layout.mjs";
import { readAll, readDoc, seed } from "../support/emulator";
import { test, expect } from "./fixtures";
import { signInLeave } from "./leaveSession";

const admin = "gregory.leave@deushcs.com";
const staff = "audrey.leave@deushcs.com";
const sovie = "sovie.leave@deushcs.com";
const former = "amelia.leave@deushcs.com";
const createdAt = Date.parse("2027-02-09T10:00:00Z");
const teamUrl = "/leave?view=team";
const teamApi = "**/api/leave/team";
const capture = process.env.LEAVE_SHOTS === "team";
const teamLook = { capture, gallery: "test-results/leave-look/L7" };
const personLook = { capture: process.env.LEAVE_SHOTS === "person", gallery: "test-results/leave-look/L8" };
const waiting = (page: Page) => page.getByRole("region", { name: "Waiting for you" });
const people = (page: Page) => page.getByRole("region", { name: "People" });
const card = (page: Page, date: string) => waiting(page).getByRole("article").filter({ hasText: date });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const decide = (id: string) => `**/api/leave/requests/${id}/decide`;
const failure = "Couldn’t confirm the decision. Try again.";

function profile(email: string, name: string, changes: Partial<LeaveProfile> = {}) {
  return {
    id: email, email, name, joinDate: "2026-12-01", accrualStart: "2027-02-01", openingDate: "2027-01-01",
    openingBalance: 8, openingCarried: 0, endDate: null, updatedAt: createdAt, ...changes,
  } satisfies LeaveProfile & { id: string };
}

function request(id: string, date: string, changes: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id, email: staff, name: "Audrey", type: "annual", start: date, end: date, half: null, reason: null, event: null, hours: null,
    note: "", status: "waiting", pay: null, createdAt, createdBy: staff, decidedBy: null, decidedAt: null, rejectReason: null,
    cancelledAt: null, cancelledBy: null, ...changes,
  };
}

async function setup(rows: LeaveRequest[], name = "Audrey", balance = 8) {
  await seed("tasks", "people", [
    { id: admin, email: admin, name: "Gregory", active: true }, { id: staff, email: staff, name, active: true },
    { id: sovie, email: sovie, name: "Sovie", active: true }, { id: former, email: former, name: "Amelia", active: false },
  ]);
  await seed("tasks", "leaveProfiles", [
    profile(staff, name, { openingBalance: balance }), profile(sovie, "Sovie"), profile(former, "Amelia", { endDate: "2027-01-29" }),
  ]);
  await seed("tasks", "leaveRequests", rows);
}

async function readyForPicture(page: Page) {
  await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.getElementById("leave-team-hide-dev-tools")) {
      const style = document.createElement("style");
      style.id = "leave-team-hide-dev-tools";
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    }
  });
}

async function shot(page: Page, name: string, { capture, gallery } = teamLook) {
  if (!capture) return;
  await readyForPicture(page);
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    const layers = [...document.querySelectorAll('[aria-modal="true"]')];
    await Promise.all(layers.flatMap((layer) => layer.getAnimations()).map((animation) => animation.finished.catch(() => {})));
  });
  await expect.poll(async () => (await auditLayout(page)).errors, { message: name, timeout: 3500 }).toEqual([]);
  await page.screenshot({ path: `${gallery}/${page.viewportSize()!.width}-${name}.png`, animations: "disabled" });
}

async function openOverlay(page: Page, title: string, frame: string, open: () => Promise<void>, checkReadableOpening = false,
  { capture, gallery } = teamLook, role: "dialog" | "alertdialog" = "dialog") {
  if (capture) await readyForPicture(page);
  if (capture || checkReadableOpening) {
    await page.evaluate((title) => {
      const opening = new MutationObserver(() => {
        const layer = Array.from(document.querySelectorAll('[aria-modal="true"]'))
          .find((element) => element.querySelector("h2")?.textContent === title);
        if (!layer) return;
        for (const element of [layer.previousElementSibling, layer]) {
          if (element instanceof HTMLElement) element.style.animationPlayState = "paused";
        }
        opening.disconnect();
      });
      opening.observe(document.body, { childList: true });
    }, title);
  }
  await open();
  const overlay = page.getByRole(role, { name: title, exact: true });
  await expect(overlay).toBeVisible();
  if (!capture && !checkReadableOpening) return;
  const duration = await overlay.evaluate((layer) => Math.max(
    ...[layer, layer.previousElementSibling].flatMap((element) =>
      (element?.getAnimations() ?? []).map(({ effect }) => Number(effect?.getTiming().duration ?? 0))),
  ));
  expect(duration).toBeGreaterThan(0);
  if (checkReadableOpening) {
    const frames = await overlay.evaluate((layer) => {
      const scrim = layer.previousElementSibling!;
      const panelMotion = layer.getAnimations()[0];
      const scrimMotion = scrim.getAnimations()[0];
      if (!panelMotion?.effect || !scrimMotion?.effect) throw new Error("Overlay opening animations did not start");
      const panelTime = Number(panelMotion.effect.getTiming().duration);
      const scrimTime = Number(scrimMotion.effect.getTiming().duration);
      return [0, 0.5].map((progress) => {
        panelMotion.currentTime = panelTime * progress;
        scrimMotion.currentTime = scrimTime * progress;
        const backdrop = getComputedStyle(scrim);
        return { panel: getComputedStyle(layer).opacity, scrim: backdrop.opacity, blur: backdrop.backdropFilter };
      });
    });
    for (const frame of frames) {
      expect(frame, "The overlay stays readable while its backdrop tint fades in")
        .toEqual({ panel: "1", scrim: "1", blur: "blur(8px)" });
    }
  }
  for (let frameIndex = 0; capture && frameIndex <= Math.ceil(duration * 30 / 1000); frameIndex++) {
    const time = Math.min(frameIndex * 1000 / 30, duration);
    await overlay.evaluate((layer, at) => {
      for (const element of [layer.previousElementSibling, layer]) {
        for (const animation of element?.getAnimations() ?? []) {
          animation.currentTime = Math.min(at, Number(animation.effect?.getTiming().duration));
        }
      }
    }, time);
    await page.screenshot({ path: `${gallery}/motion/${page.viewportSize()!.width}-${frame}-${String(Math.round(time)).padStart(3, "0")}.png` });
  }
  await overlay.evaluate((layer) => {
    for (const element of [layer.previousElementSibling, layer]) {
      for (const animation of element?.getAnimations() ?? []) animation.finish();
      if (element instanceof HTMLElement) element.style.removeProperty("animation-play-state");
    }
  });
}

async function navCount(page: Page, isMobile: boolean, count: number) {
  let scope = page.getByRole("navigation", { name: "Main navigation" });
  if (isMobile) {
    await scope.getByRole("button", { name: "More", exact: true }).click();
    scope = dialog(page, "More");
  }
  await expect(scope.getByRole("link", { name: new RegExp(`^Leave.*${count} waiting`) })).toBeVisible();
  if (isMobile) await scope.getByRole("button", { name: "Close", exact: true }).click();
}

test.describe("Leave Team", { tag: "@phone" }, () => {
  test.beforeAll(async ({ request }) => {
    // Compile the dev routes before the browser starts its deadlines. Neither call writes.
    const [auth, team] = await Promise.all([
      request.post("/api/auth/code", { data: { email: "invalid" } }),
      request.get("/api/leave/team"),
    ]);
    expect(auth.ok()).toBe(true);
    expect(await auth.json()).toEqual({ status: "wrongDomain" });
    expect(team.status()).toBe(401);
  });

  test("opens waiting cards from links and saves decisions visible to the employee", async ({ page, isMobile, browser, baseURL }) => {
    test.setTimeout(capture ? 180_000 : 90_000);
    if (capture && !isMobile) await page.setViewportSize({ width: 1280, height: 900 });
    await setup([
      request("first", "2027-02-16", { half: "morning", note: "A morning appointment.", createdAt: createdAt - 2 * 86_400_000 }),
      request("second", "2027-02-18", { note: "Client visit rescheduled." }),
      request("last", "2027-02-23", { email: sovie, name: "Sovie", createdBy: sovie, createdAt: createdAt + 86_400_000,
        type: "other", reason: "else", note: "Family appointment." }),
      request("away", "2027-02-16", { email: sovie, name: "Sovie", createdBy: sovie, status: "approved", pay: "deduct" }),
      request("annual-used", "2027-02-05", { status: "approved", pay: "deduct", half: "afternoon" }),
      request("sick-used", "2027-02-04", { status: "approved", type: "sick", pay: "paid" }),
      request("other-used", "2027-02-02", { status: "approved", type: "other", reason: "unpaid", pay: "unpaid" }),
    ]);
    await signInLeave(page, `${teamUrl}&request=first`, admin);
    await expect(dialog(page, "Audrey").getByText("Also away: Sovie (Tue)")).toBeVisible();
    await page.reload();
    const first = dialog(page, "Audrey");
    await expect(first.getByText("Waiting 3 days")).toBeVisible();
    await expect(first.getByText("0.5 day · Morning")).toBeVisible();
    await shot(page, "first-request-reload");
    await first.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(teamUrl);
    await expect(page.getByRole("button", { name: "Team", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(waiting(page).getByRole("article")).toHaveCount(3);
    await expect(card(page, "Thu 18 Feb").getByText("Waiting 1 day")).toBeVisible();
    await expect(people(page).getByRole("row").last()).toContainText("Left Fri 29 Jan");
    const audrey = people(page).getByRole("row", { name: /^Audrey/ });
    await expect(audrey.getByRole("cell")).toHaveText(isMobile ? ["8.5 days", "7 days"] : ["8.5 days", "7 days", "0.5 day", "1 day", "1"]);
    await navCount(page, isMobile, 3);
    if (isMobile) {
      const heading = (await people(page).getByRole("heading", { name: "People" }).boundingBox())!;
      const bar = (await page.getByRole("navigation", { name: "Main navigation" }).boundingBox())!;
      expect(heading.y + heading.height).toBeLessThan(bar.y);
    }
    await shot(page, "three-waiting");

    const last = card(page, "Tue 23 Feb").getByRole("link");
    await openOverlay(page, "Sovie", "last-request", () => last.click());
    await expect(dialog(page, "Sovie").getByText("Something else", { exact: true })).toBeVisible();
    await shot(page, "last-request");
    await dialog(page, "Sovie").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(teamUrl);
    await expect(last).toBeFocused();

    const second = card(page, "Thu 18 Feb");
    await openOverlay(page, "Reject this request?", "reject", () => second.getByRole("button", { name: "Reject", exact: true }).click(), true);
    const reject = dialog(page, "Reject this request?");
    const reason = reject.getByRole("textbox", { name: "Reason", exact: true });
    const rejectButton = reject.getByRole("button", { name: "Reject request", exact: true });
    await reason.fill("   ");
    await rejectButton.click();
    await expect(reason).toBeFocused();
    await expect(reject.getByText("Enter a reason for rejecting this request.")).toBeVisible();
    await expect.poll(() => readDoc("tasks", "leaveRequests/second")).toMatchObject({ status: "waiting" });
    await shot(page, "reject-required");
    await reason.fill("  Coverage is needed that day.  ");
    await shot(page, "reject-filled");
    await rejectButton.click();
    await expect(second).toHaveCount(0);
    await expect.poll(() => readDoc("tasks", "leaveRequests/second")).toMatchObject({ status: "rejected", rejectReason: "Coverage is needed that day." });

    const approval = card(page, "Tue 16 Feb");
    await expect(approval.getByText("Available leave after requests: 7 days", { exact: true })).toBeVisible();
    await approval.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(waiting(page).getByRole("article")).toHaveCount(1);
    await expect.poll(() => readDoc("tasks", "leaveRequests/first")).toMatchObject({ status: "approved", pay: "deduct" });
    await navCount(page, isMobile, 1);
    if (capture) {
      await expect(page.getByText("Request approved", { exact: true })).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0));
    }
    await shot(page, "one-waiting");

    await openOverlay(page, "Choose pay", "pay", () => card(page, "Tue 23 Feb").getByRole("button", { name: "Approve", exact: true }).click(), true);
    const pay = dialog(page, "Choose pay");
    const titleGap = await pay.getByRole("heading", { name: "Choose pay" }).evaluate(async (heading) => {
      await document.fonts.ready;
      const text = heading.firstChild!;
      const space = (text.textContent ?? "").indexOf(" ");
      const range = document.createRange();
      range.setStart(text, space);
      range.setEnd(text, space + 1);
      return range.getBoundingClientRect().width;
    });
    expect(titleGap).toBeGreaterThanOrEqual(3.5);
    const approveButton = pay.getByRole("button", { name: "Approve request", exact: true });
    await expect(pay.getByRole("radio")).toHaveCount(3);
    await approveButton.click();
    await expect(pay.getByText("Choose how this absence is paid.")).toBeVisible();
    await pay.getByRole("radio", { name: "Paid", exact: true }).check();
    await shot(page, "pay-choice");
    await approveButton.click();
    await expect(waiting(page).getByText("No leave requests waiting")).toBeVisible();
    await expect.poll(() => readDoc("tasks", "leaveRequests/last")).toMatchObject({ status: "approved", pay: "paid" });
    await expect(people(page).getByRole("row", { name: /^Sovie/ }).getByRole("cell").nth(1)).toHaveText("8 days");
    await navCount(page, isMobile, 0);
    if (capture) {
      await expect(page.getByText("Request approved", { exact: true })).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0));
    }
    await shot(page, "none-waiting-people");
    await people(page).getByRole("link", { name: /Amelia/ }).click();
    await expect(page).toHaveURL(`${teamUrl}&person=${encodeURIComponent(former)}`);

    const staffContext = await browser.newContext({ baseURL });
    try {
      const employee = await staffContext.newPage();
      let teamReads = 0;
      employee.on("request", (req) => { if (req.url().endsWith("/api/leave/team")) teamReads++; });
      await signInLeave(employee, `${teamUrl}&request=first`, staff);
      await expect(employee).toHaveURL("/leave");
      await expect(employee.getByRole("button", { name: "Team", exact: true })).toHaveCount(0);
      await expect(employee.getByRole("region", { name: "Requests" }).getByText("Approved", { exact: true }).first()).toBeVisible();
      const rejected = employee.getByRole("link", { name: /Thu 18 Feb.*Not approved/ });
      await rejected.click();
      await expect(dialog(employee, "Annual leave").getByText("Coverage is needed that day.")).toBeVisible();
      expect(teamReads).toBe(0);
    } finally {
      await staffContext.close();
    }
  });

  test("distinguishes loading, failure, offline, and missing holidays", async ({ page, context, isMobile }) => {
    if (capture && !isMobile) await page.setViewportSize({ width: 1280, height: 900 });
    await setup([]);
    await signInLeave(page, "/leave", admin);
    await expect(page.getByText("Your leave isn’t set up yet.")).toBeVisible();
    await shot(page, "mine-with-switch");
    const held = Promise.withResolvers<void>();
    await page.route(teamApi, async (route) => {
      await held.promise;
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    }, { times: 1 });
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await expect(page.getByText("Loading team leave")).toBeVisible();
    await shot(page, "loading");
    held.resolve();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Couldn’t load the team’s leave.");
    await shot(page, "load-failed");
    // The server's October cutover is covered by the data suite. Exercise its warning here with the February fixtures.
    await page.route(teamApi, async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.fulfill({ response, json: { ...await response.json(), nextMissingHolidayYear: "2028" } });
    });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(waiting(page).getByText("No leave requests waiting")).toBeVisible();
    await expect(page.getByText("Add holidays for 2028.")).toBeVisible();
    await shot(page, "missing-holidays");
    await context.setOffline(true);
    try {
      await expect(page.getByText("Leave needs a connection.", { exact: true })).toBeVisible();
      await expect(people(page)).toHaveCount(0);
      await shot(page, "offline");
    } finally {
      await context.setOffline(false);
    }
    await expect(people(page)).toBeVisible();
    await page.goto(`${teamUrl}&request=missing`);
    await expect(page.getByText("This request is no longer waiting.")).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(teamUrl);
  });

  test("keeps actions independent, times out safely and verifies a committed retry once", async ({ page, isMobile }) => {
    if (capture && !isMobile) await page.setViewportSize({ width: 1280, height: 900 });
    await setup([request("slow", "2027-02-16"), request("fast", "2027-02-18")]);
    await signInLeave(page, teamUrl, admin);
    const slow = card(page, "Tue 16 Feb");
    const fast = card(page, "Thu 18 Feb");
    await expect(slow).toBeVisible();
    const seen = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let posts = 0;
    await page.clock.install();
    await page.route(decide("slow"), async (route) => {
      posts++;
      if (posts === 1) {
        seen.resolve();
        await release.promise;
        await route.abort().catch(() => {});
      } else if (posts === 2) {
        expect((await route.fetch()).ok()).toBeTruthy();
        await page.route("**/api/leave/people/**", (read) => read.abort(), { times: 1 });
        await route.abort();
      } else await route.continue();
    });
    await slow.getByRole("button", { name: "Approve", exact: true }).click();
    await seen.promise;
    const busy = slow.getByRole("button", { name: "Approving…", exact: true });
    await expect(busy).toBeDisabled();
    await busy.dispatchEvent("click");
    expect(posts).toBe(1);
    const teamRefreshed = page.waitForResponse((response) => response.url().endsWith("/api/leave/team") && response.ok());
    await fast.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(fast).toHaveCount(0);
    await teamRefreshed;
    await navCount(page, isMobile, 1);
    await expect(busy).toBeVisible();
    await page.clock.fastForward(12_100);
    release.resolve();
    await expect(slow.getByRole("alert")).toHaveText(failure);
    await expect.poll(() => readDoc("tasks", "leaveRequests/slow")).toMatchObject({ status: "waiting" });
    await shot(page, "decision-failed");

    await slow.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(slow.getByRole("alert")).toHaveText(failure);
    const committed = await readDoc("tasks", "leaveRequests/slow");
    expect(committed).toMatchObject({ status: "approved", pay: "deduct" });
    await slow.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(waiting(page).getByText("No leave requests waiting")).toBeVisible();
    expect(posts).toBe(3);
    expect(await readDoc("tasks", "leaveRequests/slow")).toEqual(committed);
    await navCount(page, isMobile, 0);
  });

  test("keeps the winning decision and leaves no stale dialog when you switch views", async ({ page }) => {
    await setup([request("both", "2027-02-16"), request("later", "2027-02-18")]);
    await signInLeave(page, `${teamUrl}&request=both`, admin);
    const detail = dialog(page, "Audrey");
    await detail.getByRole("button", { name: "Reject", exact: true }).click();
    const reject = dialog(page, "Reject this request?");
    await reject.getByRole("textbox", { name: "Reason" }).fill("Coverage needed.");
    await page.route(decide("both"), async (route) => {
      const headers = await route.request().allHeaders();
      const other = await page.request.post(route.request().url(), { headers: { authorization: headers.authorization }, data: { decision: "approve" } });
      expect(other.ok()).toBeTruthy();
      await route.continue();
    });
    await reject.getByRole("button", { name: "Reject request", exact: true }).click();
    await expect(page.getByText("This request is no longer waiting.", { exact: true })).toBeVisible();
    await expect(page.getByText("Request rejected", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(teamUrl);
    await expect.poll(() => readDoc("tasks", "leaveRequests/both")).toMatchObject({ status: "approved", rejectReason: null });

    const held = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    await page.route(decide("later"), async (route) => {
      entered.resolve();
      await held.promise;
      await route.continue();
    });
    const later = card(page, "Thu 18 Feb");
    await later.getByRole("link").click();
    await dialog(page, "Audrey").getByRole("button", { name: "Reject", exact: true }).click();
    await expect(reject).toBeVisible();
    await page.goBack();
    await expect(reject).toHaveCount(0);
    await later.getByRole("link").click();
    await expect(dialog(page, "Audrey")).toBeVisible();
    await expect(reject).toHaveCount(0);
    await dialog(page, "Audrey").getByRole("button", { name: "Close", exact: true }).click();
    await later.getByRole("button", { name: "Approve", exact: true }).click();
    await entered.promise;
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect(page).toHaveURL("/leave");
    await expect(page.getByText("Your leave isn’t set up yet.")).toBeVisible();
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await expect(later).toBeVisible();
    held.resolve();
    await expect(waiting(page).getByText("No leave requests waiting")).toBeVisible();
    await expect(page.getByText("Request approved", { exact: true })).toHaveCount(0);
  });

  test("fits long and missing data at 320px and keeps lookalike names distinct", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The narrow layout is narrower than the phone project.");
    test.setTimeout(90_000);
    const name = "Ameliasuperlongstaffnamewithoutanyspaces";
    const note = "W".repeat(500);
    expect(name).toHaveLength(40);
    await setup([request("long", "2027-02-16", { name, note, type: "other", reason: "else" })], name, -100.5);
    await seed("tasks", "people", [{ id: sovie, email: sovie, name: name.toUpperCase(), active: true }]);
    await signInLeave(page, teamUrl, admin);
    await expect(card(page, "Tue 16 Feb")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    const long = card(page, "Tue 16 Feb");
    await expect(long.getByText(staff, { exact: true })).toBeVisible();
    await expect(people(page).getByText("−99.5 days", { exact: true })).toBeVisible();
    await expect(people(page).getByText("Leave isn’t set up").first()).toBeAttached();
    await expect(people(page).getByRole("link", { name: new RegExp(staff) })).toHaveAttribute("href", `${teamUrl}&person=${encodeURIComponent(staff)}`);
    await expect(people(page).getByRole("link", { name: new RegExp(sovie) })).toHaveAttribute("href", `${teamUrl}&person=${encodeURIComponent(sovie)}`);
    await expect(long.getByRole("button", { name: "Reject", exact: true })).toBeInViewport();
    await expect(long.getByRole("button", { name: "Approve", exact: true })).toBeInViewport();
    await shot(page, "stress-waiting");
    await openOverlay(page, name, "stress-request", () => long.getByRole("link").click());
    await expect(dialog(page, name).getByText(note, { exact: true })).toBeVisible();
    await expect(dialog(page, name).getByText("Available leave after requests: −100.5 days")).toBeInViewport();
    await expect(dialog(page, name).getByRole("button", { name: "Approve", exact: true })).toBeInViewport();
    await shot(page, "stress-request");
    const payOpener = dialog(page, name).getByRole("button", { name: "Approve", exact: true });
    await openOverlay(page, "Choose pay", "stress-pay", () => payOpener.click(), true);
    const pay = dialog(page, "Choose pay");
    const cancelBox = (await pay.getByRole("button", { name: "Cancel", exact: true }).boundingBox())!;
    const approveBox = (await pay.getByRole("button", { name: "Approve request", exact: true }).boundingBox())!;
    expect(Math.abs(cancelBox.y - approveBox.y)).toBeLessThan(4);
    await shot(page, "stress-pay");
    await dialog(page, "Choose pay").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(payOpener).toBeFocused();
    await dialog(page, name).getByRole("button", { name: "Close", exact: true }).click();
    await people(page).getByRole("row").last().scrollIntoViewIfNeeded();
    await shot(page, "stress-people");
  });
});

const personUrl = (email = staff) => `${teamUrl}&person=${encodeURIComponent(email)}`;
const exactButton = (name: string) => ({ name, exact: true });

async function personShot(page: Page, name: string) {
  await shot(page, name, personLook);
}

async function personFrame(page: Page, title: string, frame: string, open: () => Promise<void>, role?: "alertdialog") {
  await openOverlay(page, title, frame, open, true, personLook, role);
}

test.describe("L8 person and holidays", { tag: "@phone" }, () => {
  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000);
    // Compile each route before an interactive save can hit its deadline. Every Leave call here is unauthenticated.
    const responses = await Promise.all([
      request.post("/api/auth/code", { data: { email: "invalid" } }),
      request.get("/api/leave/team"),
      request.get(`/api/leave/people/${encodeURIComponent(staff)}`),
      request.post("/api/leave/adjustments", { data: {} }),
      request.put(`/api/leave/profiles/${encodeURIComponent(staff)}`, { data: {} }),
      request.post("/api/leave/requests", { data: {} }),
      request.post("/api/leave/holidays/2027-02-16", { data: {} }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([200, 401, 401, 401, 401, 401, 401]);
  });

  test("deep-links into a person, adjusts their balance, audits details and adds sick leave", async ({ page, isMobile, browser, baseURL }) => {
    test.setTimeout(personLook.capture ? 180_000 : 100_000);
    if (personLook.capture && !isMobile) await page.setViewportSize({ width: 1280, height: 900 });
    await setup([
      request("first", "2027-02-16", { note: "Cover a client visit." }),
      request("cancelled", "2027-02-08", { type: "other", reason: "unpaid", status: "cancelled", cancelledBy: staff, cancelledAt: createdAt }),
      request("last", "2027-02-02", { status: "rejected", decidedBy: admin, decidedAt: createdAt, rejectReason: "Coverage is needed." }),
    ]);
    await signInLeave(page, personUrl(), admin);
    const audrey = dialog(page, "Audrey");
    const balance = audrey.getByRole("region", { name: "Leave balance" });
    await expect(balance.getByText("9 days", { exact: true })).toBeVisible({ timeout: 25_000 });
    await page.reload();
    await expect(page).toHaveURL(personUrl());
    await expect(balance.getByText("9 days", { exact: true })).toBeVisible({ timeout: 25_000 });
    await personShot(page, "person-reload");
    await audrey.getByRole("button", exactButton("Close")).click();
    await expect(page).toHaveURL(teamUrl);
    const opener = people(page).getByRole("link", { name: /Audrey/ });
    await personFrame(page, "Audrey", "person", () => opener.click());

    await personFrame(page, "Adjust balance", "adjust", () => audrey.getByRole("button", exactButton("Adjust balance")).click());
    const adjust = dialog(page, "Adjust balance");
    await adjust.getByRole("spinbutton", { name: "Days" }).fill("1.5");
    const reason = adjust.getByRole("textbox", { name: "Reason" });
    await reason.fill("  ");
    await adjust.getByRole("button", exactButton("Save adjustment")).click();
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute("aria-invalid", "true");
    await reason.fill("Opening balance correction");
    await personShot(page, "adjust");
    await adjust.getByRole("button", exactButton("Save adjustment")).click();
    await expect(balance.getByText("10.5 days", { exact: true })).toBeVisible();
    await expect(audrey.getByRole("region", { name: "History" }).getByText("Opening balance correction")).toBeVisible();
    await expect(audrey.getByRole("button", exactButton("Adjust balance"))).toBeFocused();

    await personFrame(page, "Leave details", "details", () => audrey.getByRole("button", exactButton("Leave details")).click());
    const details = dialog(page, "Leave details");
    const accrual = details.getByLabel("+1 from", { exact: true });
    await accrual.fill("2027-03-01");
    await personShot(page, "details");
    await details.getByRole("button", exactButton("Save details")).click();
    const audit = audrey.getByText("Details changed by Gregory: +1 from 1 Feb 2027 → 1 Mar 2027", { exact: true });
    await expect(audit).toBeVisible({ timeout: 25_000 });
    await expect(balance.getByText("9.5 days", { exact: true })).toBeVisible();
    if (personLook.capture) await audit.scrollIntoViewIfNeeded();
    await personShot(page, "history-audit");

    await audrey.getByRole("button", exactButton("Leave details")).click();
    await expect(accrual).toHaveValue("2027-03-01");
    const lastDay = details.getByLabel(/^Last day/);
    await lastDay.fill("2027-02-15");
    await details.getByRole("button", exactButton("Save details")).click();
    const refusal = details.getByText("Cancel Audrey's request after Mon 15 Feb first.", { exact: true });
    await expect(refusal).toBeInViewport({ ratio: 1 });
    await expect(lastDay).toBeFocused();
    expect(await readDoc("tasks", `leaveProfiles/${staff}`)).toMatchObject({ endDate: null, accrualStart: "2027-03-01" });
    await personShot(page, "details-refused");
    await details.getByRole("button", exactButton("Cancel")).click();

    await personFrame(page, "Add leave", "add", () => audrey.getByRole("button", exactButton("Add leave")).click());
    const add = dialog(page, "Add leave");
    await add.getByRole("button", exactButton("Sick")).click();
    await add.getByLabel("From", { exact: true }).fill("2027-02-05");
    await add.getByLabel(/^Note/).fill("Recorded by the admin.");
    await expect(add.getByRole("status")).toContainText("1 working day");
    await personShot(page, "add-sick");
    await add.getByRole("button", exactButton("Add leave")).click();
    const records = audrey.getByRole("region", { name: "Requests" });
    const rows = records.getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "Sick" })).toContainText("Approved");
    await expect.poll(() => readAll("tasks", "leaveRequests")).toContainEqual(
      expect.objectContaining({ email: staff, type: "sick", status: "approved", pay: "paid", createdBy: admin }),
    );

    for (const [index, title, status] of [
      [0, "Annual leave", "Waiting"], [1, "Other absence", "Cancelled"], [2, "Sick", "Approved"], [3, "Annual leave", "Not approved"],
    ] as const) {
      const open = () => rows.nth(index).getByRole("button").click();
      if (index === 0) await personFrame(page, title, "request", open);
      else await open();
      const record = dialog(page, title);
      await expect(record.getByText(status, { exact: true })).toBeVisible();
      if (title === "Sick") await expect(record.getByText(/^Approved by Gregory on /)).toBeVisible();
      await personShot(page, `request-${index + 1}-${status.toLowerCase().replaceAll(" ", "-")}`);
      await record.getByRole("button", exactButton("Close")).click();
    }
    await audrey.getByRole("button", exactButton("Close")).click();
    await expect(opener).toBeFocused();
    await expect(people(page).getByRole("row", { name: /^Audrey/ }).getByRole("cell").first()).toHaveText("9.5 days");

    const employeeContext = await browser.newContext({ baseURL });
    try {
      const employee = await employeeContext.newPage();
      let personReads = 0;
      await employee.route("**/api/leave/people/**", (route) => { personReads++; return route.continue(); });
      await signInLeave(employee, personUrl(), staff);
      await expect(employee).toHaveURL("/leave");
      await expect(employee.getByText("9.5 days", { exact: true })).toBeVisible();
      await expect(employee.getByText("Sick", { exact: true })).toBeVisible();
      await employee.getByRole("button", exactButton("History")).click();
      await expect(employee.getByText("Opening balance correction")).toBeVisible();
      await expect(employee.getByText("Details changed by Gregory: +1 from 1 Feb 2027 → 1 Mar 2027")).toBeVisible();
      expect(personReads).toBe(0);
    } finally {
      await employeeContext.close();
    }
  });

  test("recounts waiting leave on holiday add and remove, and refuses duplicate dates", async ({ page, isMobile }) => {
    test.setTimeout(personLook.capture ? 125_000 : 80_000);
    if (personLook.capture && !isMobile) await page.setViewportSize({ width: 1280, height: 900 });
    await setup([request("range", "2027-02-15", { end: "2027-02-17" })]);
    await seed("tasks", "leaveHolidays", [
      { id: "2027-01-01", date: "2027-01-01", name: "New Year’s Day" },
      { id: "2028-01-01", date: "2028-01-01", name: "New Year’s Day" },
    ]);
    await signInLeave(page, `${teamUrl}&holidays=1`, admin);
    const holidays = dialog(page, "Holidays");
    await expect(holidays.getByRole("region", { name: "2027" }).getByText("New Year’s Day")).toBeVisible();
    await expect(holidays.getByRole("region", { name: "2028" }).getByText("New Year’s Day")).toBeVisible();
    await personShot(page, "holidays");
    await holidays.getByRole("button", exactButton("Close")).click();
    const waitingRange = card(page, "Mon 15");
    await expect(waitingRange.getByText(/· 3 days$/)).toBeVisible();
    const holidaysLink = people(page).getByRole("link", { name: "Holidays", exact: true });
    if (personLook.capture) {
      await holidaysLink.scrollIntoViewIfNeeded();
      await personShot(page, "team-holidays-entry");
    }
    await personFrame(page, "Holidays", "holidays", () => holidaysLink.click());
    await expect(holidays.getByText("Changing a holiday recounts every request on that day.")).toBeVisible();
    const date = holidays.getByLabel("Date", { exact: true });
    const name = holidays.getByRole("textbox", { name: "Holiday name" });
    await holidays.getByRole("button", exactButton("Add holiday")).click();
    await expect(date).toBeFocused();
    await expect(holidays.getByText("Enter a valid holiday date.")).toBeVisible();
    await date.fill("2027-02-16");
    await name.fill("  ");
    await holidays.getByRole("button", exactButton("Add holiday")).click();
    await expect(name).toBeFocused();
    await name.fill("Team holiday");
    await holidays.getByRole("button", exactButton("Add holiday")).click();
    const remove = holidays.getByRole("button", { name: /^Remove Team holiday,/ });
    await expect(remove).toBeEnabled();
    await expect(waitingRange.getByText(/· 2 days$/)).toBeAttached();
    await expect(people(page).getByRole("row", { name: /^Audrey/ }).getByRole("cell").nth(1)).toHaveText("7 days");
    await date.fill("2027-02-16");
    await name.fill("TEAM HOLIDAY");
    await holidays.getByRole("button", exactButton("Add holiday")).click();
    await expect(holidays.getByText("There is already a holiday on this date.")).toBeVisible();
    await expect(holidays.getByText("Team holiday", { exact: true })).toHaveCount(1);
    await name.fill(" ");
    await holidays.getByRole("button", exactButton("Add holiday")).click();
    const nameError = holidays.getByText("Enter a holiday name from 1 to 60 characters.");
    await expect(nameError).toBeVisible();

    await personFrame(page, "Remove this holiday?", "holidays-remove", () => remove.click(), "alertdialog");
    const confirmation = page.getByRole("alertdialog", { name: "Remove this holiday?" });
    await expect(confirmation.getByText("Team holiday")).toBeVisible();
    await personShot(page, "holidays-remove");
    await confirmation.getByRole("button", exactButton("Remove holiday")).click();
    await expect(remove).toHaveCount(0);
    await expect(confirmation).toHaveCount(0);
    await expect(nameError).toBeVisible();
    await holidays.getByRole("button", exactButton("Close")).click();
    await expect(holidaysLink).toBeFocused();
    await expect(waitingRange.getByText(/· 3 days$/)).toBeVisible();
    await expect(people(page).getByRole("row", { name: /^Audrey/ }).getByRole("cell").nth(1)).toHaveText("6 days");
    await expect.poll(() => readDoc("tasks", "leaveHolidays/2027-02-16")).toBeNull();
  });

  test("recovers one adjustment after a failed send and a lost reply, and ignores an add reply after leaving", async ({ page }) => {
    test.setTimeout(80_000);
    await setup([]);
    await signInLeave(page, personUrl(), admin);
    const audrey = dialog(page, "Audrey");
    await audrey.getByRole("button", exactButton("Adjust balance")).click();
    const adjust = dialog(page, "Adjust balance");
    const save = adjust.getByRole("button", exactButton("Save adjustment"));
    await adjust.getByRole("spinbutton", { name: "Days" }).fill("-0.5");
    const reason = adjust.getByRole("textbox", { name: "Reason" });
    await reason.fill("Half day correction");
    const sent = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const keys: string[] = [];
    await page.route("**/api/leave/adjustments", async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      if (keys.length === 1) {
        sent.resolve();
        await release.promise;
        await route.abort();
      } else if (keys.length === 2) {
        expect((await route.fetch()).ok()).toBe(true);
        await page.route("**/api/leave/people/**", (read) => read.abort(), { times: 1 });
        await route.abort();
      } else await route.continue();
    });
    await save.click();
    await sent.promise;
    const busy = adjust.getByRole("button", exactButton("Saving…"));
    await expect(busy).toBeDisabled();
    await busy.dispatchEvent("click");
    expect(keys).toHaveLength(1);
    release.resolve();
    await expect(adjust.getByRole("alert")).toHaveText(/Couldn’t confirm the adjustment/);
    expect(await readAll("tasks", "leaveAdjustments")).toHaveLength(0);
    await save.click();
    await expect(adjust.getByRole("alert")).toHaveText(/Couldn’t confirm the adjustment/);
    await expect(reason).toHaveValue("Half day correction");
    expect(await readAll("tasks", "leaveAdjustments")).toHaveLength(1);
    await save.click();
    await expect(audrey.getByText("Half day correction")).toBeVisible();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(await readAll("tasks", "leaveAdjustments")).toHaveLength(1);

    const committed = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<void>();
    await page.route("**/api/leave/requests", async (route) => {
      const entry = await route.fetch();
      expect(entry.ok()).toBe(true);
      committed.resolve();
      await reply.promise;
      await route.fulfill({ response: entry });
    });
    await audrey.getByRole("button", exactButton("Add leave")).click();
    const add = dialog(page, "Add leave");
    await add.getByRole("button", exactButton("Sick")).click();
    await add.getByLabel("From", { exact: true }).fill("2027-02-05");
    await add.getByRole("button", exactButton("Add leave")).click();
    await committed.promise;
    await add.getByRole("button", exactButton("Cancel")).click();
    await audrey.getByRole("button", exactButton("Close")).click();
    await people(page).getByRole("link", { name: /Sovie/ }).click();
    const other = dialog(page, "Sovie");
    await expect(other.getByText("No requests yet")).toBeVisible();
    const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/leave/team") && response.ok());
    reply.resolve();
    await refreshed;
    await expect(other.getByText("No requests yet")).toBeVisible();
    await expect(page.getByText("Added", { exact: true })).toHaveCount(0);
    expect(await readAll("tasks", "leaveRequests")).toEqual([expect.objectContaining({ email: staff, type: "sick" })]);
  });

  test("requires a reload before retrying stale leave details or a stale holiday removal", async ({ page }) => {
    test.setTimeout(80_000);
    await setup([]);
    await seed("tasks", "leaveHolidays", [{ id: "2027-02-16", date: "2027-02-16", name: "Original holiday" }]);
    await signInLeave(page, personUrl(), admin);
    const audrey = dialog(page, "Audrey");
    await audrey.getByRole("button", exactButton("Leave details")).click();
    const details = dialog(page, "Leave details");
    const accrual = details.getByLabel("+1 from", { exact: true });
    const detailsApi = "**/api/leave/profiles/**";
    await page.route(detailsApi, async (route) => {
      const first = await route.fetch();
      expect(first.ok()).toBe(true);
      const { profile } = await first.json();
      const winner = await route.fetch({
        headers: { ...route.request().headers(), "if-match": `"${profile.updatedAt}"` },
        postData: { accrualStart: "2027-04-01" },
      });
      expect(winner.ok()).toBe(true);
      await route.abort();
    }, { times: 1 });
    await accrual.fill("2027-03-01");
    const save = details.getByRole("button", exactButton("Save details"));
    await save.click();
    await expect(details.getByRole("alert")).toHaveText(/Couldn’t confirm the leave details/);
    await save.click();
    const reloadDetails = details.getByRole("button", exactButton("Reload details"));
    await expect(reloadDetails).toBeFocused();
    await expect(save).toBeDisabled();
    await reloadDetails.click();
    await expect(accrual).toHaveValue("2027-04-01");
    expect(await readAll("tasks", "leaveAudit")).toHaveLength(2);
    await details.getByRole("button", exactButton("Cancel")).click();
    await audrey.getByRole("button", exactButton("Close")).click();

    await people(page).getByRole("link", { name: "Holidays", exact: true }).click();
    const holidays = dialog(page, "Holidays");
    await holidays.getByRole("button", { name: /^Remove Original holiday,/ }).click();
    const confirm = page.getByRole("alertdialog", { name: "Remove this holiday?" });
    await page.route("**/api/leave/holidays/2027-02-16", async (route) => {
      const first = await route.fetch();
      expect(first.ok()).toBe(true);
      const { holidayVersion } = await first.json();
      const winner = await route.fetch({
        method: "POST",
        headers: { ...route.request().headers(), "content-type": "application/json", "if-match": `"${holidayVersion}"` },
        postData: { name: "Updated holiday" },
      });
      expect(winner.ok()).toBe(true);
      await route.abort();
    }, { times: 1 });
    const remove = confirm.getByRole("button", exactButton("Remove holiday"));
    await remove.click();
    await expect(confirm.getByRole("alert")).toHaveText(/Couldn’t confirm the holiday was removed/);
    await remove.click();
    const reloadHolidays = confirm.getByRole("button", exactButton("Reload holidays"));
    await expect(reloadHolidays).toBeVisible();
    await reloadHolidays.click();
    await expect(confirm).toHaveCount(0);
    await expect(holidays.getByText("Updated holiday", { exact: true })).toBeVisible();
    expect((await readAll("tasks", "leaveHolidays")).filter(({ id }) => id !== "_settings")).toHaveLength(1);
  });

  test("fits long names and refusal text at 320 px and loads an empty or unavailable person", async ({ page, isMobile }) => {
    test.skip(!isMobile, "This case changes the phone viewport.");
    test.setTimeout(personLook.capture ? 110_000 : 80_000);
    const name = "Alexandria Cassandra Maximiliana Winters";
    const holiday = "International Education and Community Service Observance Day";
    expect(name).toHaveLength(40);
    expect(holiday).toHaveLength(60);
    await setup([request("one", "2027-02-16", { name }), request("two", "2027-02-18", { name })], name, -100.5);
    await seed("tasks", "leaveHolidays", [{ id: "2027-02-17", date: "2027-02-17", name: holiday }]);
    await seed("tasks", "people", [{ id: "new.leave@deushcs.com", email: "new.leave@deushcs.com", name: "New teammate", active: true }]);
    await signInLeave(page, teamUrl, admin);
    await expect(people(page)).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    await people(page).getByRole("link", { name }).click();
    const person = dialog(page, name);
    await expect(person.getByText("−99.5 days", { exact: true })).toBeInViewport();
    await expect(person.getByRole("button", exactButton("Adjust balance"))).toBeInViewport();
    await personShot(page, "stress-person");
    await person.getByRole("button", exactButton("Adjust balance")).click();
    const adjust = dialog(page, "Adjust balance");
    const reason = "Correction after matching the attendance record. ".repeat(5) + "The difference comes from a missed check-in on day one.";
    expect(reason).toHaveLength(300);
    await adjust.getByRole("textbox", { name: "Reason" }).fill(reason);
    await adjust.getByRole("spinbutton", { name: "Days" }).fill("1.5");
    await personShot(page, "stress-adjust");
    await adjust.getByRole("button", exactButton("Save adjustment")).click();
    const adjustment = person.getByRole("listitem").filter({ hasText: reason });
    await expect(adjustment).toContainText("+1.5 days");
    await adjustment.scrollIntoViewIfNeeded();
    await expect(adjustment).toBeInViewport({ ratio: 1 });
    await personShot(page, "stress-history");
    await person.getByRole("button", exactButton("Leave details")).click();
    const details = dialog(page, "Leave details");
    const lastDay = details.getByLabel(/^Last day/);
    await lastDay.fill("2027-02-15");
    await details.getByRole("button", exactButton("Save details")).click();
    const error = details.getByText(`Cancel ${name}'s 2 requests after Mon 15 Feb first.`, { exact: true });
    await expect(error).toBeInViewport({ ratio: 1 });
    await expect(lastDay).toBeFocused();
    await personShot(page, "stress-details-refused");
    await details.getByRole("button", exactButton("Cancel")).click();
    await person.getByRole("button", exactButton("Close")).click();

    await people(page).getByRole("link", { name: "New teammate", exact: true }).click();
    const newPerson = dialog(page, "New teammate");
    await expect(newPerson.getByText("Leave isn’t set up for this person.")).toBeVisible();
    await expect(newPerson.getByRole("button", exactButton("Leave details"))).toBeInViewport();
    await personShot(page, "stress-no-profile");
    await newPerson.getByRole("button", exactButton("Close")).click();

    await people(page).getByRole("link", { name: "Holidays", exact: true }).click();
    const holidays = dialog(page, "Holidays");
    await expect(holidays.getByText(holiday, { exact: true })).toBeInViewport();
    await personShot(page, "stress-holidays");
    await holidays.getByRole("button", { name: new RegExp(`^Remove ${holiday},`) }).click();
    const confirm = page.getByRole("alertdialog", { name: "Remove this holiday?" });
    await expect(confirm.getByText(holiday, { exact: true })).toBeInViewport({ ratio: 1 });
    await personShot(page, "stress-holidays-remove");
    await confirm.getByRole("button", exactButton("Cancel")).click();
    await page.context().setOffline(true);
    await expect(holidays.getByText("Leave needs a connection.")).toBeVisible();
    await personShot(page, "stress-holidays-offline");
    await page.context().setOffline(false);

    await page.goto(personUrl("not-set-up@deushcs.com"));
    const missing = dialog(page, "Person leave");
    await expect(missing.getByText("This person isn’t available.")).toBeVisible();
    await personShot(page, "stress-person-unavailable");
  });
});
