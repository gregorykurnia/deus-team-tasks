// Flows (task 3.14, guide 6.8, 4.16, D-018): reading a flow with its loop back, editing in place (text saves as you
// write and keeps every key typed fast, steps, roles, the decision and its outcomes), Undo for removed parts, search,
// new flow, delete, read only with no connection (typing kept when it goes), and a colleague's change landing while
// typing. Each checks the stored data as well as the screen.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { flow, seedFlows, storedById, seedTasks, task } from "./data";

const storedFlow = (id: string) => storedById("tasks", "flows", id);
const toasts = (page: Page) => page.getByRole("status").filter({ has: page.locator("span") });
const doc = (page: Page) => page.getByRole("article");
const list = (page: Page) => page.getByRole("region", { name: "Flows" });
// Writes wait for the connection (N4): a test that writes first waits until the app is live.
const waitUntilLive = (page: Page) => expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();

type Stored = { description: string; steps: { id: string; title: string; description: string; roles: { label: string; names: string[] }[] }[]; decision: { label: string; branches: { id: string; tone: string; title: string; loopTo?: string }[] } | null; name: string; updatedAt?: number };
const read = async (id: string) => (await storedFlow(id)) as unknown as Stored | undefined;

const onboarding = flow("onboarding", {
  name: "Client onboarding",
  description: "From signed contract to go-live.",
  steps: [
    { id: "s1", title: "Sign the contract", description: "Both sides sign.", roles: [{ label: "Responsible", names: ["Ana Putri"] }] },
    { id: "s2", title: "Set up the accounts", description: "", roles: [{ label: "Consulted", names: ["Budi"] }] },
    { id: "s3", title: "Kick-off call", description: "", roles: [] },
  ],
  decision: {
    label: "Does the client accept?",
    branches: [
      { id: "o1", label: "", tone: "good", title: "Go live", description: "", roles: [] },
      { id: "o2", label: "", tone: "bad", title: "Fix the setup", description: "", roles: [], loopTo: "s2" },
    ],
  },
});
const renewals = flow("renewals", { name: "Annual renewals", steps: [], decision: null });

async function seedAll() {
  await seedFlows([onboarding, renewals]);
  await seedTasks([task("t1", { responsible: ["Citra Dewi"] })]);
}

test("M1 to M3: a flow reads as a path with its decision, and a loop back jumps to its step", async ({ page }) => {
  await seedAll();
  await page.goto("/flows/onboarding");
  await expect(doc(page).getByRole("heading", { name: "Client onboarding" })).toBeVisible();
  await expect(doc(page).getByText("3 steps · a decision")).toBeVisible();
  await expect(doc(page).getByText("2 people")).toBeVisible();
  await expect(doc(page).getByText("Does the client accept?")).toBeVisible();
  await expect(doc(page).getByText("Good outcome")).toBeVisible();
  await expect(doc(page).getByText("The flow ends here")).toBeVisible();
  await expect(doc(page).getByText("When the decision is “Fix the setup”, the work comes back here")).toBeVisible();
  await doc(page).getByRole("button", { name: "Back to step 2: Set up the accounts" }).click();
  await expect(doc(page).getByRole("heading", { name: "Step 2: Set up the accounts" }).locator("..")).toBeFocused();
});

test("M4: the list runs A to Z, and search covers steps, outcomes and people", { tag: "@phone" }, async ({ page, isMobile }) => {
  await seedAll();
  await page.goto("/flows");
  if (!isMobile) await expect(page).toHaveURL(/\/flows\/renewals/);
  await expect(list(page).getByText("2 flows, A to Z")).toBeVisible();
  await expect(list(page).getByRole("link").first()).toContainText("Annual renewals");
  const find = page.getByRole("searchbox", { name: "Find a flow" });
  await find.fill("ana putri");
  await expect(list(page).getByText("1 of 2 flows mention “ana putri”")).toBeVisible();
  await expect(list(page).getByRole("link", { name: /Client onboarding/ })).toBeVisible();
  await find.fill("fix the setup");
  await expect(list(page).getByRole("link", { name: /Client onboarding/ })).toBeVisible();
  await find.fill("nothing like this");
  await expect(list(page).getByText("No flow mentions “nothing like this”")).toBeVisible();
  await list(page).getByRole("button", { name: "Clear" }).click();
  await expect(list(page).getByRole("link")).toHaveCount(2);
  if (isMobile) {
    await list(page).getByRole("link", { name: /Client onboarding/ }).click();
    await expect(doc(page).getByRole("heading", { name: "Client onboarding" })).toBeVisible();
    await doc(page).getByRole("button", { name: "All flows" }).click();
    await expect(list(page)).toBeVisible();
  }
});

test("M4: a new flow needs a name, then opens in editing with its first step ready, and saves as you write", async ({ page }) => {
  await seedAll();
  await page.goto("/flows?newFlow=1");
  await waitUntilLive(page);
  const dialog = page.getByRole("dialog", { name: "New flow" });
  await dialog.getByRole("button", { name: "Create flow" }).click();
  await expect(dialog.getByText("Give the flow a name, so the team can find it.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Name" }).fill("Supplier payments");
  await dialog.getByRole("button", { name: "Create flow" }).click();
  await expect(toasts(page).getByText("Flow “Supplier payments” created.")).toBeVisible();
  await expect(page).toHaveURL(/\/flows\/[^/?]+\?edit=1/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  const title = doc(page).getByRole("textbox", { name: "Step 1 title" });
  await expect(title).toBeFocused();
  // Typed fast, with a pause past 0.8s that saves mid-string, then more typing while a colleague's change to the same
  // flow arrives: no key is dropped (R1), and the colleague's change is kept and shown.
  await title.pressSequentially("Check the invoice", { delay: 15 });
  await expect(doc(page).getByText("Saving…")).toBeVisible();
  await expect.poll(async () => (await read(id))?.steps[0]?.title).toBe("Check the invoice");
  const colleague = (async () => {
    await page.waitForTimeout(120);
    await seedFlows([{ ...(await storedFlow(id))!, description: "Paid within 30 days." } as unknown as ReturnType<typeof flow>]);
  })();
  await title.pressSequentially(" against the order", { delay: 40 });
  await colleague;
  await expect(doc(page).getByText("Changed just now")).toBeVisible();
  await expect(doc(page).getByRole("textbox", { name: "Flow description" })).toHaveValue("Paid within 30 days.");
  await expect(doc(page).getByText("Saved", { exact: true })).toBeVisible();
  await expect(title).toHaveValue("Check the invoice against the order");
  await expect.poll(async () => (await read(id))?.steps[0]?.title).toBe("Check the invoice against the order");
  expect(await read(id)).toMatchObject({
    name: "Supplier payments",
    description: "Paid within 30 days.",
    steps: [{ roles: [{ label: "Responsible", names: [] }] }],
    decision: null,
  });

  // Leaving a field saves at once.
  await doc(page).getByRole("textbox", { name: "Step 1 description" }).fill("Match amounts and dates.");
  await doc(page).getByRole("textbox", { name: "Flow name" }).focus();
  await expect.poll(async () => (await read(id))?.steps[0]?.description, { timeout: 2_000 }).toBe("Match amounts and dates.");

  await doc(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).not.toHaveURL(/edit=1/);
  await expect(doc(page).getByRole("heading", { name: "Step 1: Check the invoice against the order" })).toBeVisible();
});

test("M1, D-018: steps are added, moved and removed; removing a step an outcome went back to ends it there, and Undo brings both back", async ({ page }) => {
  await seedAll();
  await page.goto("/flows/onboarding?edit=1");
  await doc(page).getByRole("button", { name: "Add a step after step 1" }).click();
  const added = doc(page).getByRole("textbox", { name: "Step 2 title" });
  await expect(added).toBeFocused();
  await added.fill("Send the welcome pack");
  await doc(page).getByRole("button", { name: "Move step 2 down" }).click();
  await expect.poll(async () => (await read("onboarding"))?.steps.map((s) => s.title)).toEqual([
    "Sign the contract",
    "Set up the accounts",
    "Send the welcome pack",
    "Kick-off call",
  ]);

  await doc(page).getByRole("button", { name: "Remove step 2" }).click();
  await expect(toasts(page).getByText("“Set up the accounts” removed. The outcome that went back to it now ends the flow.")).toBeVisible();
  await expect.poll(async () => (await read("onboarding"))?.steps.length).toBe(3);
  expect((await read("onboarding"))?.decision?.branches[1].loopTo).toBeUndefined();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await read("onboarding"))?.steps.map((s) => s.id).slice(0, 2)).toEqual(["s1", "s2"]);
  expect((await read("onboarding"))?.decision?.branches[1].loopTo).toBe("s2");
});

test("M2: a role gets a label from the ones in use and people from the names in use", async ({ page }) => {
  await seedAll();
  await page.goto("/flows/onboarding?edit=1");
  const step3 = doc(page).locator("li").filter({ has: page.getByRole("textbox", { name: "Step 3 title" }) });
  await step3.getByRole("button", { name: "Add a role" }).click();
  const label = step3.getByRole("combobox", { name: "Role 1 in step 3" });
  await expect(label).toBeFocused();
  await label.fill("cons");
  await page.getByRole("option", { name: "Consulted" }).click();
  await expect(label).toHaveValue("Consulted");
  const people = step3.getByRole("combobox", { name: "People in Consulted" });
  await people.fill("citra");
  await page.getByRole("option", { name: /Citra Dewi/ }).click();
  await people.fill("Dimas");
  await people.press("Enter");
  await expect.poll(async () => (await read("onboarding"))?.steps[2].roles).toMatchObject([{ label: "Consulted", names: ["Citra Dewi", "Dimas"] }]);

  await step3.getByRole("button", { name: "Remove Consulted" }).click();
  await expect.poll(async () => (await read("onboarding"))?.steps[2].roles).toEqual([]);
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await read("onboarding"))?.steps[2].roles.length).toBe(1);
});

test("M2: what's typed in a role stays with it when a colleague removes an earlier role", async ({ page }) => {
  const roles = [
    { label: "Responsible", names: ["Ana Putri"] },
    { label: "Consulted", names: ["Budi"] },
    { label: "Informed", names: [] },
  ];
  await seedFlows([flow("roles", { name: "Approvals", steps: [{ id: "s1", title: "Approve", description: "", roles }] })]);
  await page.goto("/flows/roles?edit=1");
  await waitUntilLive(page);
  const second = doc(page).getByRole("combobox", { name: "Role 2 in step 1" });
  await second.fill("Approves");
  await doc(page).getByRole("textbox", { name: "Flow name" }).focus();
  await expect.poll(async () => (await read("roles"))?.steps[0].roles.map((r) => r.label)).toEqual(["Responsible", "Approves", "Informed"]);
  // Still being written in when a colleague removes the first role (keeping the ids the roles got on that save).
  await second.fill("Approves the budget");
  const now = (await storedFlow("roles"))!;
  const steps = (now.steps as Stored["steps"]).map((st) => ({ ...st, roles: st.roles.slice(1) }));
  await seedFlows([{ ...now, steps } as unknown as ReturnType<typeof flow>]);
  const first = doc(page).getByRole("combobox", { name: "Role 1 in step 1" });
  await expect(first).toHaveValue("Approves the budget");
  await expect(first).toBeFocused();
  await expect(doc(page).getByRole("combobox", { name: "Role 2 in step 1" })).toHaveValue("Informed");
  await doc(page).getByRole("textbox", { name: "Flow name" }).focus();
  await expect.poll(async () => (await read("roles"))?.steps[0].roles.map((r) => r.label)).toEqual(["Approves the budget", "Informed"]);
});

test("M3: a decision starts with a good and a bad outcome; outcomes change tone, loop back and are removed with Undo", async ({ page }) => {
  await seedAll();
  await page.goto("/flows/renewals?edit=1");
  await doc(page).getByRole("button", { name: "Add the first step" }).click();
  await doc(page).getByRole("textbox", { name: "Step 1 title" }).fill("Send the renewal quote");
  await doc(page).getByRole("button", { name: /Add a decision/ }).click();
  const question = doc(page).getByRole("textbox", { name: "The decision" });
  await expect(question).toBeFocused();
  await question.fill("Does the client renew?");
  await doc(page).getByRole("textbox", { name: "Outcome 2 title" }).fill("They ask for a discount");
  await doc(page).getByRole("combobox", { name: "Then" }).last().selectOption({ label: "Go back to step 1: Send the renewal quote" });
  await expect
    .poll(async () => (await read("renewals"))?.decision)
    .toMatchObject({ label: "Does the client renew?", branches: [{ tone: "good" }, { tone: "bad", title: "They ask for a discount", loopTo: expect.any(String) }] });

  await doc(page).getByRole("group", { name: "Outcome 1 is" }).getByRole("button", { name: "Bad" }).click();
  await expect.poll(async () => (await read("renewals"))?.decision?.branches[0].tone).toBe("bad");
  await doc(page).getByRole("button", { name: "Remove outcome 1" }).click();
  await expect.poll(async () => (await read("renewals"))?.decision?.branches.length).toBe(1);
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await read("renewals"))?.decision?.branches.length).toBe(2);

  await doc(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(doc(page).getByRole("button", { name: "Back to step 1: Send the renewal quote" })).toBeVisible();
});

test("A3, D-018: with no connection a flow stays readable and editing waits", async ({ page, context }) => {
  await seedAll();
  await page.goto("/flows/onboarding");
  await expect(doc(page).getByRole("button", { name: "Edit flow" })).toBeVisible();
  await context.setOffline(true);
  await expect(doc(page).getByText("Editing needs a connection")).toBeVisible({ timeout: 15_000 });
  await expect(doc(page).getByRole("button", { name: "Edit flow" })).toHaveCount(0);
  await expect(doc(page).getByText("Sign the contract")).toBeVisible();
  await context.setOffline(false);
  await expect(doc(page).getByRole("button", { name: "Edit flow" })).toBeVisible({ timeout: 30_000 });
});

test("A3, D-018: typing kept when the connection goes while editing stays, read only, and saves once it's back", async ({ page, context }) => {
  await seedAll();
  await page.goto("/flows/onboarding?edit=1");
  await waitUntilLive(page);
  const title = doc(page).getByRole("textbox", { name: "Step 3 title" });
  await title.fill("Kick-off call with the sponsor");
  await context.setOffline(true);
  await expect(doc(page).getByText("Not saved yet. Saves when you’re back online.")).toBeVisible({ timeout: 15_000 });
  await expect(title).toBeDisabled();
  await expect(title).toHaveValue("Kick-off call with the sponsor");
  expect((await read("onboarding"))?.steps[2].title).toBe("Kick-off call");
  await context.setOffline(false);
  await expect.poll(async () => (await read("onboarding"))?.steps[2].title, { timeout: 30_000 }).toBe("Kick-off call with the sponsor");
  await expect(doc(page).getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(title).toBeEnabled();
});

test("M4: deleting a flow asks first and says what goes", async ({ page }) => {
  await seedAll();
  await page.goto("/flows/onboarding");
  await waitUntilLive(page);
  await doc(page).getByRole("button", { name: "More for this flow" }).click();
  await page.getByRole("menuitem", { name: "Delete flow" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete “Client onboarding”?" });
  await expect(confirm.getByText("Its 3 steps and the decision go, for everyone on the team.")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete flow" }).click();
  await expect(toasts(page).getByText("Flow “Client onboarding” deleted")).toBeVisible();
  await expect.poll(async () => await storedFlow("onboarding")).toBeUndefined();
});
