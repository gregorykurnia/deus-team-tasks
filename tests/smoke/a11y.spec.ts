// Accessibility (task 4.5, guide 8): no serious or critical axe issues on any screen or open sheet, every control
// reachable by keyboard with a visible focus ring, overlays that hold focus and give it back, and reflow at 320px.
// The full sweep of every state on the prototype's map is `node scripts/a11y/axe.mjs`; this spec guards the screens.
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { company, flow, isoDay, seedCompanies, seedFlows, seedGroups, seedTasks, task } from "./data";
import { seed } from "../support/emulator";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function seedAll() {
  await seedGroups([{ id: "g1", name: "Office move", order: 1 }]);
  await seedCompanies([
    company(1, { company: "Pelita Foods", status: "To Follow Up", pic: "Dewi Lestari", priority: "High", type: "Prospect", date: isoDay(-3), target: isoDay(20) }),
    company(2, { company: "Halcyon Labs", status: "Meeting Soon", pic: "Budi Santoso", priority: "Medium", type: "Prospect", date: isoDay(-1) }),
  ]);
  await seedTasks([
    task("t1", { task: "Call Pelita Foods", responsible: ["Maya Chen"], informed: [{ name: "Ravi Patel" }], endDate: isoDay(1), linkedClientId: 1, priority: "High", taskType: "Follow Up", taskGroup: "Office move" }),
    task("t2", { task: "Book the interview room", responsible: ["Ravi Patel"], endDate: isoDay(-2) }),
    task("t3", { task: "Send the proposal", responsible: ["Maya Chen"], endDate: isoDay(5), startDate: isoDay(2), completed: true, completedAt: Date.now() }),
  ]);
  await seedFlows([
    flow("f1", {
      name: "Onboarding",
      steps: [{ id: "s1", title: "Kick-off", description: "Agree the plan", roles: [{ id: "r1", label: "Owner", names: ["Maya Chen"] }] }],
      decision: { label: "Is the client ready?", description: "", branches: [
        { id: "b1", label: "", tone: "good", title: "Go live", description: "", roles: [] },
        { id: "b2", label: "", tone: "bad", title: "Wait", description: "", roles: [], loopTo: "s1" },
      ] },
    }),
  ]);
  await seed("clients", "prospectJournal", [
    { id: "n1", prospectName: "Pelita Foods", pipelineEntryId: 1, updatedAt: Date.now(), clientNeed: "Faster onboarding", opportunityStatus: "High", detailedRemarks: "" },
    { id: "n2", prospectName: "Nusa Agro", pipelineEntryId: null, updatedAt: Date.now() - 1000, clientNeed: "", opportunityStatus: "", detailedRemarks: "" },
  ]);
  await seed("clients", "historicalClients", [
    { id: "p1", name: "Meridian Bank", parentId: null, sector: "Banking", countHead: true, createdAt: 1 },
    { id: "p2", name: "Meridian Leasing", parentId: "p1", sector: null, countHead: true, createdAt: 2 },
  ]);
}

const SCREENS: { name: string; path: string; ready: string | RegExp }[] = [
  { name: "Today", path: "/", ready: "Today" },
  { name: "All tasks", path: "/tasks", ready: "Tasks" },
  { name: "A task group", path: "/tasks/groups/g1", ready: "Office move" },
  { name: "Selecting several", path: "/tasks?select=1", ready: "Tasks" },
  { name: "Plan timeline", path: "/plan", ready: "Plan" },
  { name: "Plan month", path: "/plan?view=month", ready: "Plan" },
  { name: "Plan day", path: "/plan?view=day", ready: "Plan" },
  { name: "Plan people", path: "/plan?view=people", ready: "Plan" },
  { name: "Prospects", path: "/companies", ready: "Prospects" },
  { name: "Qualification notes", path: "/notes/n1", ready: "Qualification notes" },
  { name: "Past clients", path: "/past", ready: "Past clients" },
  { name: "Flows", path: "/flows/f1", ready: "Flows" },
  { name: "Editing a flow", path: "/flows/f1?edit=1", ready: "Flows" },
];

const SHEETS: { name: string; path: string; dialog: string | RegExp }[] = [
  { name: "task details", path: "/?task=t1", dialog: /Call Pelita Foods|Task/ },
  { name: "new task", path: "/tasks?task=new", dialog: "New task" },
  { name: "company record", path: "/companies?company=1", dialog: /Pelita Foods/ },
  { name: "new company", path: "/companies?newCompany=1", dialog: /New company/ },
  { name: "fields", path: "/companies?fields=active", dialog: /Fields|Active/ },
  { name: "new group", path: "/tasks?newGroup=1", dialog: /group/i },
  { name: "new flow", path: "/flows?newFlow=1", dialog: /New flow/ },
  { name: "new notes", path: "/notes?newNotes=1", dialog: /notes/i },
  { name: "add a past client", path: "/past?add=1", dialog: /past client/i },
  { name: "install", path: "/?install=1", dialog: /Install/ },
];

async function loaded(page: Page) {
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
  await page.waitForFunction(() => !/Loading (tasks|companies|task groups|past clients|flows|qualification notes|prospects|notes)/i.test(document.body.innerText));
}

async function serious(page: Page) {
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return res.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    // A suggestion list has no tab stop of its own: the field drives it with the arrow keys (aria-activedescendant).
    .map((v) => (v.id === "scrollable-region-focusable" ? { ...v, nodes: v.nodes.filter((n) => !n.html.includes("data-keys-via-input")) } : v))
    .filter((v) => v.nodes.length > 0)
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

test.beforeEach(async () => {
  await seedAll();
});

for (const s of SCREENS) {
  test(`axe: ${s.name} has no serious or critical issues`, async ({ page }) => {
    await page.goto(s.path);
    await loaded(page);
    expect(await serious(page)).toEqual([]);
  });
}

for (const s of SHEETS) {
  test(`axe: the ${s.name} sheet has no serious or critical issues`, async ({ page }) => {
    await page.goto(s.path);
    await loaded(page);
    await expect(page.getByRole("dialog", { name: s.dialog }).first()).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
}

test("axe: the phone's More sheet has no serious or critical issues", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "More is the phone's.");
  await page.goto("/?more=1");
  await loaded(page);
  await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test("axe: a confirmation has no serious or critical issues, and focuses Cancel first", async ({ page }) => {
  await page.goto("/?task=t2");
  await loaded(page);
  await page.getByRole("dialog").getByRole("button", { name: /^Delete/ }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(await serious(page)).toEqual([]);
});

// ---- Keyboard ----

// Tabs through a screen and returns what had focus each time, with its visible ring.
async function tabThrough(page: Page, max = 120) {
  const seen: { label: string; ring: boolean; visible: boolean }[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      // The ring is on the control itself, or on the box around it that lights up while it has focus (a search field's
      // frame, a row's link).
      const outlined = (node: Element) => {
        const cs = getComputedStyle(node);
        return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
      };
      const cs = getComputedStyle(el);
      let ring = outlined(el) || (cs.boxShadow !== "none" && cs.boxShadow !== "");
      for (let up = el.parentElement, n = 0; !ring && up && n < 7; up = up.parentElement, n++) ring = up.matches(":focus-within") && (outlined(up) || getComputedStyle(up).boxShadow !== "none");
      const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || el.getAttribute("placeholder") || el.tagName;
      return { label: `${el.tagName.toLowerCase()} "${name}"`, ring, visible: r.width > 0 && r.height > 0 };
    });
    if (!info || info.label.startsWith("nextjs-portal")) break; // left the page: Tab went to the browser (or to the dev server's badge)
    seen.push(info);
  }
  return seen;
}

for (const s of SCREENS) {
  test(`keyboard: ${s.name} is reachable with Tab, and every stop shows a focus ring`, async ({ page }) => {
    await page.goto(s.path);
    await loaded(page);
    const seen = await tabThrough(page);
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.filter((x) => !x.visible).map((x) => x.label)).toEqual([]);
    expect(seen.filter((x) => !x.ring).map((x) => x.label)).toEqual([]);
  });
}

test("keyboard: a sheet keeps Tab inside, Esc closes it, and focus goes back to what opened it", async ({ page }) => {
  await page.goto("/tasks");
  await loaded(page);
  const opener = page.getByRole("link", { name: "New task" }).first(); // the header's action, or the tab bar's + on phones
  await opener.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "New task" });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

// Menus and the quick editors (R4: these are where roles nest, a menu's items inside a dialog).
const filterButton = (page: Page, name: RegExp) => page.getByRole("toolbar", { name: "Filter and sort" }).getByRole("button", { name });

test("axe: a menu with a number field has no serious or critical issues, and the arrow keys move out of the field", async ({ page }) => {
  await page.goto("/tasks");
  await loaded(page);
  await filterButton(page, /^No action for/).click();
  const menu = page.getByRole("menu", { name: "No action for" });
  await expect(menu).toBeVisible();
  expect(await serious(page)).toEqual([]);
  const field = menu.getByRole("spinbutton");
  await field.focus();
  await page.keyboard.press("ArrowUp");
  await expect(field).not.toBeFocused();
  expect(await menu.evaluate((el) => el.contains(document.activeElement) && /^menuitem/.test(document.activeElement!.getAttribute("role") ?? ""))).toBe(true);
});

test("axe: a company's quick date editor has no serious or critical issues", async ({ page, isMobile }) => {
  test.skip(isMobile, "The same editor; the desktop list has the cell to open it from.");
  await page.goto("/companies");
  await loaded(page);
  await page.getByRole("article", { name: "Pelita Foods" }).getByRole("button", { name: /^Target date:/ }).click();
  await expect(page.getByRole("dialog", { name: "Target date" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test("axe: linking notes to a tracked company has no serious or critical issues", async ({ page }) => {
  await page.goto("/notes/n2");
  await loaded(page);
  await page.getByRole("button", { name: "Link to a tracked company" }).first().click();
  const editor = page.getByRole("dialog", { name: "Link to a tracked company" });
  await expect(editor.getByRole("menuitem", { name: /Halcyon Labs/ })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test("axe: a past client's sector editor has no serious or critical issues", async ({ page }) => {
  await page.goto("/past");
  await loaded(page);
  await page.getByRole("button", { name: /Change the sector of Meridian Bank/ }).first().click();
  const editor = page.getByRole("dialog", { name: "Sector of Meridian Bank" });
  await expect(editor.getByRole("menuitemradio", { name: /Banking/ })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test("keyboard: a menu opens with Enter, arrows move, Esc closes and focus returns", async ({ page }) => {
  await page.goto("/flows/f1");
  await loaded(page);
  const trigger = page.getByRole("button", { name: /More for this flow/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// ---- Reflow ----

test.describe("320px wide", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const s of SCREENS) {
    test(`reflow: ${s.name} has no sideways scrolling`, async ({ page }) => {
      await page.goto(s.path);
      await loaded(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});
