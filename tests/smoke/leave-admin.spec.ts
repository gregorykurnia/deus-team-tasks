import type { Page } from "@playwright/test";
import type { LeaveProfile, LeaveRequest } from "@/lib/leave";
import { auditLayout } from "../../scripts/compare/layout.mjs";
import { readDoc, seed } from "../support/emulator";
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
const gallery = "test-results/leave-look/L7";
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

async function shot(page: Page, name: string) {
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

async function openOverlay(page: Page, title: string, frame: string, open: () => Promise<void>) {
  if (capture) {
    await readyForPicture(page);
    await page.evaluate((title) => {
      document.addEventListener("animationstart", function pause(event) {
        const layer = event.target;
        if (!(layer instanceof HTMLElement) || layer.getAttribute("aria-modal") !== "true" || layer.querySelector("h2")?.textContent !== title) return;
        for (const element of [layer.previousElementSibling, layer]) {
          for (const animation of element?.getAnimations() ?? []) {
            animation.pause();
            animation.currentTime = 0;
          }
        }
        document.removeEventListener("animationstart", pause);
      });
    }, title);
  }
  await open();
  const overlay = dialog(page, title);
  await expect(overlay).toBeVisible();
  if (!capture) return;
  const duration = await overlay.evaluate((layer) => Number(layer.getAnimations()[0]?.effect?.getTiming().duration ?? 0));
  expect(duration).toBeGreaterThan(0);
  for (let frameIndex = 0; frameIndex <= Math.ceil(duration * 30 / 1000); frameIndex++) {
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
  test("opens waiting cards from links and saves decisions visible to the employee", async ({ page, isMobile, browser, baseURL }) => {
    test.setTimeout(90_000);
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
    await openOverlay(page, "Reject this request?", "reject", () => second.getByRole("button", { name: "Reject", exact: true }).click());
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

    await card(page, "Tue 16 Feb").getByRole("button", { name: "Approve", exact: true }).click();
    await expect(waiting(page).getByRole("article")).toHaveCount(1);
    await expect.poll(() => readDoc("tasks", "leaveRequests/first")).toMatchObject({ status: "approved", pay: "deduct" });
    await navCount(page, isMobile, 1);
    if (capture) {
      await expect(page.getByText("Request approved", { exact: true })).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0));
    }
    await shot(page, "one-waiting");

    await openOverlay(page, "Choose pay", "pay", () => card(page, "Tue 23 Feb").getByRole("button", { name: "Approve", exact: true }).click());
    const pay = dialog(page, "Choose pay");
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
    await expect(dialog(page, name).getByText("Available after −100.5 days")).toBeInViewport();
    await expect(dialog(page, name).getByRole("button", { name: "Approve", exact: true })).toBeInViewport();
    await shot(page, "stress-request");
    await openOverlay(page, "Choose pay", "stress-pay", () => dialog(page, name).getByRole("button", { name: "Approve", exact: true }).click());
    const pay = dialog(page, "Choose pay");
    const cancelBox = (await pay.getByRole("button", { name: "Cancel", exact: true }).boundingBox())!;
    const approveBox = (await pay.getByRole("button", { name: "Approve request", exact: true }).boundingBox())!;
    expect(Math.abs(cancelBox.y - approveBox.y)).toBeLessThan(4);
    await shot(page, "stress-pay");
    await dialog(page, "Choose pay").getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog(page, name).getByRole("button", { name: "Close", exact: true }).click();
    await people(page).getByRole("row").last().scrollIntoViewIfNeeded();
    await shot(page, "stress-people");
  });
});
