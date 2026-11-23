import { createHash } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import holidaySeed from "@/lib/leaveHolidays.json";
import { readAll, readDoc, seed } from "../support/emulator";
import { pinLeaveDate, resetLeaveDate } from "../support/leaveClock";
import { subscription } from "../support/push";
import { test, expect } from "./fixtures";
import { signInLeave } from "./leaveSession";

const calista = "calista.leave@deushcs.com";
const audrey = "audrey.leave@deushcs.com";
const gregory = "gregory.leave@deushcs.com";
const openingDate = "2026-12-01";
const adjustmentReason = "Opening balance correction";
const lapse = "2026 days not used by 28 Feb";

const balance = (scope: Page | Locator) => scope.getByRole("region", { name: "Leave balance" });
const history = (page: Page) => page.getByRole("region", { name: "History" });
const requests = (scope: Page | Locator) => scope.getByRole("region", { name: "Requests" });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const exact = (name: string) => ({ name, exact: true });

async function seedWorkedExample() {
  const profiles = [
    { email: calista, name: "Calista", joinDate: openingDate, accrualStart: "2027-02-01", openingBalance: 0 },
    { email: audrey, name: "Audrey", joinDate: "2026-01-01", accrualStart: "2026-01-01", openingBalance: 6 },
    { email: gregory, name: "Gregory", joinDate: "2020-01-01", accrualStart: "2020-01-01", openingBalance: 10 },
  ];
  await seed("tasks", "people", profiles.map(({ email, name }) => ({ id: email, email, name, active: true })));
  await seed("tasks", "leaveProfiles", profiles.map((profile) => ({
    ...profile, id: profile.email, openingDate, openingCarried: 0, endDate: null, updatedAt: Date.parse(openingDate),
  })));
  await seed("tasks", "leaveHolidays", holidaySeed.holidays.map((entry) => ({ ...entry, id: entry.date })));
  for (const { email } of profiles) {
    const device = subscription(email);
    const id = createHash("sha256").update(device.endpoint).digest("hex");
    await seed("tasks", `people/${email}/devices`, [{ id, ...device }]);
  }
}

async function askAnnual(page: Page, start: string, end: string, preview: string, row: RegExp, halfDay = false) {
  await balance(page).getByRole("link", exact("Ask for leave")).click();
  const ask = dialog(page, "Ask for leave");
  await ask.getByLabel("From", { exact: true }).fill(start);
  await ask.getByLabel("To", { exact: true }).fill(end);
  if (halfDay) await ask.getByRole("button", exact("Morning")).click();
  await expect(ask.getByRole("status")).toHaveText(preview);
  await ask.getByRole("button", exact("Send request")).click();
  await expect(ask).toBeHidden();
  const saved = requests(page).getByRole("link", { name: row });
  await expect(saved).toBeVisible();
  const href = await saved.getAttribute("href");
  const id = href && new URL(href, page.url()).searchParams.get("request");
  if (!id) throw new Error("The saved request has no link to its details.");
  return id;
}

async function expectBalance(scope: Page | Locator, amount: string) {
  const card = balance(scope);
  await expect(card.getByText(amount, { exact: true }).and(card.locator("p"))).toBeVisible();
}

async function expectLine(page: Page, label: string, date: string, debit: string, remaining: string) {
  const line = history(page).getByRole("listitem")
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ has: page.getByText(date, { exact: true }) });
  await expect(line.getByText(debit, { exact: true })).toBeVisible();
  await expect(line.getByText(`Balance ${remaining}`, { exact: true })).toBeVisible();
}

async function historyOn(day: string, ...checks: [Page, string][]) {
  await pinLeaveDate(day);
  await Promise.all(checks.map(async ([page, amount]) => {
    const read = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/leave/me"
      && !new URL(response.url()).search && response.request().method() === "GET");
    await page.goto("/leave?view=history");
    const response = await read;
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ today: day });
    await expectBalance(page, amount);
    await expect(history(page)).toBeVisible();
  }));
}

function openPerson(page: Page, name: string) {
  return page.getByRole("region", { name: "People" }).getByRole("link", exact(name)).click();
}

test.describe("Leave ledger across pinned days", () => {
  test.skip(() => process.env.LEAVE_SMOKE_OFF === "1" || process.env.SIGN_IN_SMOKE_OFF === "1", "Leave needs both flags.");
  test.afterEach(resetLeaveDate);

  test("replays the three worked balances through February, March lapse and approved cancellation", async ({ page: calistaPage, browser, baseURL }) => {
    test.setTimeout(240_000);
    await seedWorkedExample();
    await pinLeaveDate(openingDate);
    const audreyContext = await browser.newContext({ baseURL });
    const gregoryContext = await browser.newContext({ baseURL });
    try {
      const audreyPage = await audreyContext.newPage();
      const gregoryPage = await gregoryContext.newPage();
      await signInLeave(calistaPage, "/leave", calista);
      await signInLeave(audreyPage, "/leave", audrey);
      await signInLeave(gregoryPage, "/leave", gregory);

      const calistaJanuary = await askAnnual(calistaPage, "2027-01-12", "2027-01-14",
        "3 working days · Available after: −3 days, taken in advance", /Annual leave.*3 days.*Waiting/);
      const audreyDecember = await askAnnual(audreyPage, "2026-12-24", "2026-12-24",
        "1 working day · Available after: 5 days", /Annual leave.*24 Dec.*1 day.*Waiting/);
      const audreyJanuary = await askAnnual(audreyPage, "2027-01-04", "2027-01-06",
        "2 working days · Available after: 3 days", /Annual leave.*6 Jan.*2 days.*Waiting/);
      const audreyFebruary = await askAnnual(audreyPage, "2027-02-05", "2027-02-05",
        "0.5 working day · Available after: 2.5 days", /Annual leave.*5 Feb.*0.5 day.*Waiting/, true);
      const gregorySpring = await askAnnual(gregoryPage, "2027-02-25", "2027-03-02",
        "4 working days · Available after: 6 days", /Annual leave.*25 Feb.*2 Mar.*4 days.*Approved/);

      await test.step("approve four employee requests through Team and confirm the badge clears", async () => {
        await gregoryPage.reload();
        const nav = gregoryPage.getByRole("navigation", { name: "Main navigation" });
        await expect(nav.getByRole("link", { name: /^Leave.*4 waiting/ })).toBeVisible();
        await gregoryPage.getByRole("button", exact("Team")).click();
        const waiting = gregoryPage.getByRole("region", { name: "Waiting for you" });
        await expect(waiting.getByRole("article")).toHaveCount(4);
        for (const id of [calistaJanuary, audreyDecember, audreyJanuary, audreyFebruary]) {
          const card = waiting.getByRole("article").filter({ has: gregoryPage.locator(`a[href$="&request=${id}"]`) });
          await card.getByRole("button", exact("Approve")).click();
          await expect(card).toHaveCount(0);
          expect(await readDoc("tasks", `leaveRequests/${id}`)).toMatchObject({ status: "approved", pay: "deduct", decidedBy: gregory });
        }
        await expect(waiting.getByText("No leave requests waiting")).toBeVisible();
        await expect(nav.getByRole("link", exact("Leave 0 waiting"))).toBeVisible();
      });

      await test.step("count the December working day and exclude the January holiday", async () => {
        await historyOn("2026-12-31", [audreyPage, "5 days"]);
        await expectLine(audreyPage, "Annual leave", "24 Dec", "−1 day", "5 days");
        await historyOn("2027-01-06", [audreyPage, "4 days"]);
        await expectLine(audreyPage, "Annual leave", "4 Jan", "−2 days", "4 days");
      });

      await test.step("apply Gregory’s 20 January adjustment through his person sheet", async () => {
        await pinLeaveDate("2027-01-20");
        await gregoryPage.reload();
        await openPerson(gregoryPage, "Gregory");
        const person = dialog(gregoryPage, "Gregory");
        await person.getByRole("button", exact("Adjust balance")).click();
        const adjust = dialog(gregoryPage, "Adjust balance");
        await adjust.getByRole("spinbutton", exact("Days")).fill("-5");
        await adjust.getByRole("textbox", exact("Reason")).fill(adjustmentReason);
        await adjust.getByRole("button", exact("Save adjustment")).click();
        await expect(adjust).toBeHidden();
        await expectBalance(person, "6 days");
        await expect(person.getByRole("region", { name: "History" }).getByText(adjustmentReason)).toBeVisible();
      });

      await test.step("verify February accrual and the warning before the lapse", async () => {
        await historyOn("2027-01-31", [calistaPage, "−3 days"], [audreyPage, "4 days"], [gregoryPage, "6 days"]);
        await expectLine(calistaPage, "Annual leave", "12 Jan", "−3 days", "−3 days");
        await expect(history(calistaPage).getByText("Monthly +1", { exact: true })).toHaveCount(0);
        await expectLine(gregoryPage, adjustmentReason, "20 Jan", "−5 days", "6 days");
        await historyOn("2027-02-01", [calistaPage, "−2 days"], [audreyPage, "5 days"], [gregoryPage, "7 days"]);
        await expectLine(calistaPage, "Monthly +1", "1 Feb", "+1 day", "−2 days");
        await historyOn("2027-02-10", [calistaPage, "−2 days"], [audreyPage, "4.5 days"], [gregoryPage, "7 days"]);
        await expect(balance(audreyPage).getByText("2.5 days from 2026 lapse after Sun 28 Feb", { exact: true })).toBeVisible();
        await expectLine(audreyPage, "Annual leave", "5 Feb", "−0.5 day", "4.5 days");
        await historyOn("2027-02-28", [calistaPage, "−2 days"], [audreyPage, "4.5 days"], [gregoryPage, "5 days"]);
        await expectLine(gregoryPage, "Annual leave", "25 Feb", "−2 days", "5 days");
        await expect(history(audreyPage).getByText(lapse, { exact: true })).toHaveCount(0);
        await expect(history(gregoryPage).getByText(lapse, { exact: true })).toHaveCount(0);
      });

      await test.step("verify the 1 March lapse, accrual and cross-month debit in order", async () => {
        await historyOn("2027-03-01", [calistaPage, "−1 day"], [audreyPage, "3 days"], [gregoryPage, "1 day"]);
        await expect(history(calistaPage).getByText(lapse, { exact: true })).toHaveCount(0);
        await expectLine(calistaPage, "Monthly +1", "1 Mar", "+1 day", "−1 day");
        await expectLine(audreyPage, lapse, "1 Mar", "−2.5 days", "2 days");
        await expectLine(audreyPage, "Monthly +1", "1 Mar", "+1 day", "3 days");
        await expect(balance(audreyPage).getByText(/from 2026 lapse after/)).toHaveCount(0);
        await expect(history(gregoryPage).getByRole("listitem").filter({ has: gregoryPage.getByText("1 Mar", { exact: true }) })).toHaveText([
          /Annual leave.*−2 days.*Balance 1 day/,
          /Monthly \+1.*\+1 day.*Balance 3 days/,
          /2026 days not used by 28 Feb.*−3 days.*Balance 2 days/,
        ]);
      });

      await test.step("cancel Calista’s approved January request and restore all three days", async () => {
        await gregoryPage.getByRole("button", exact("Team")).click();
        await openPerson(gregoryPage, "Calista");
        const person = dialog(gregoryPage, "Calista");
        await expectBalance(person, "−1 day");
        await requests(person).getByRole("button", { name: /Annual leave.*14 Jan.*3 days.*Approved/ }).click();
        const request = dialog(gregoryPage, "Annual leave");
        await request.getByRole("button", exact("Cancel request")).click();
        const confirm = gregoryPage.getByRole("alertdialog", exact("Cancel this request?"));
        await confirm.getByRole("button", exact("Cancel request")).click();
        await expect(request.getByText("Cancelled", { exact: true })).toBeVisible();
        await request.getByRole("button", exact("Close")).click();
        await expectBalance(person, "2 days");
        await historyOn("2027-03-01", [calistaPage, "2 days"]);
        await expect(history(calistaPage).getByText("Annual leave", { exact: true })).toHaveCount(0);
        await expectLine(calistaPage, "Monthly +1", "1 Mar", "+1 day", "2 days");
        await history(calistaPage).getByRole("button", exact("Requests")).click();
        await expect(requests(calistaPage).getByRole("link", { name: /Annual leave.*3 days.*Cancelled/ })).toBeVisible();
      });

      const employeeRequests = [[calistaJanuary, calista], [audreyDecember, audrey], [audreyJanuary, audrey], [audreyFebruary, audrey]];
      const expectedPushes = employeeRequests.flatMap(([id, email]) => [
        [gregory, "Leave request", `/leave?view=team&request=${id}`],
        [email, "Annual leave approved", `/leave?request=${id}`],
      ]);
      expectedPushes.push([calista, "Gregory cancelled your leave", `/leave?request=${calistaJanuary}`]);
      await expect.poll(async () => (await readAll("tasks", "_fakePush")).map(({ email, title, url }) => [email, title, url]).sort())
        .toEqual(expectedPushes.sort());
      expect(await readDoc("tasks", `leaveRequests/${gregorySpring}`)).toMatchObject({ status: "approved", createdBy: gregory, decidedBy: gregory });
      expect(await readAll("tasks", "leaveRequests")).toHaveLength(5);
      expect(await readAll("tasks", "leaveAdjustments")).toMatchObject([{ email: gregory, by: gregory, date: "2027-01-20", days: -5 }]);
    } finally {
      await Promise.all([audreyContext.close(), gregoryContext.close()]);
    }
  });
});
