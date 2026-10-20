// Flows on the old UI: create, rename, steps, roles, decision, delete.
import { test, expect } from "./fixtures";
import { acceptDialogs, flow, seedBaseline, seedFlows, stored, storedById } from "./data";
import { OLD_UI, openArea } from "./old-ui";

test.skip(({ isMobile }) => isMobile, "The old UI is checked on desktop; 4.3 adds phone runs for the new UI.");

test.beforeEach(async ({ page }) => {
  await seedBaseline();
  await page.goto(OLD_UI);
  await openArea(page, "Flow");
});

test("M1 M4: create a flow, name it and add a step", async ({ page }) => {
  await page.getByRole("button", { name: "+ New Flow" }).click();
  await expect(page.locator("input").first()).toHaveValue("New Flow");
  await page.locator("input").first().fill("Client onboarding");
  await page.getByRole("button", { name: "+ Add step" }).click();

  await expect
    .poll(async () => {
      const f = (await stored("tasks", "flows")).find((x) => x.id !== "baseline");
      return f && { name: f.name, steps: (f.steps as unknown[]).length };
    })
    .toEqual({ name: "Client onboarding", steps: 2 });
  await expect(page.getByRole("button", { name: "Client onboarding", exact: true })).toBeVisible();
});

test("M2: give a step a role with people in it", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.locator('input[value="New Role"]').fill("Responsible");
  const names = page.getByPlaceholder("+ add name");
  await names.fill("Ana");
  await names.press("Enter");

  await expect
    .poll(async () => ((await storedById("tasks", "flows", "baseline"))?.steps as { roles: unknown }[])[0].roles)
    .toEqual([{ label: "Responsible", names: ["Ana"] }]);
});

test("M3: add a decision with an outcome that loops back to a step", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add decision point" }).click();
  await page.getByRole("button", { name: "+ Add branch" }).click();
  const outcome = page.locator('[id^="branch-"]');
  const branch = async () => ((await storedById("tasks", "flows", "baseline"))?.decision as { branches: Record<string, unknown>[] })?.branches?.[0];
  // The old screen builds each change on the last saved one, so each step waits for the save.
  await outcome.locator("select").first().selectOption("bad");
  await expect.poll(async () => (await branch())?.tone).toBe("bad");
  await outcome.locator('input[value="New Outcome"]').fill("Trial failed");
  await expect.poll(async () => (await branch())?.title).toBe("Trial failed");
  await outcome.locator("select").last().selectOption({ label: "First step" });

  await expect
    .poll(async () => (await storedById("tasks", "flows", "baseline"))?.decision)
    .toMatchObject({
      label: "Decision Point",
      branches: [{ tone: "bad", title: "Trial failed", loopTo: "baseline-s1" }],
    });
});

test("M4: remove a step", async ({ page }) => {
  await seedFlows([
    flow("two", {
      name: "Two steps",
      steps: [
        { id: "two-a", title: "Step A", description: "", roles: [] },
        { id: "two-b", title: "Step B", description: "", roles: [] },
      ],
    }),
  ]);
  await page.getByRole("button", { name: "Two steps", exact: true }).click();
  await page.getByRole("button", { name: "Remove step" }).first().click();

  await expect
    .poll(async () => ((await storedById("tasks", "flows", "two"))?.steps as { id: string }[]).map((s) => s.id))
    .toEqual(["two-b"]);
});

test("M4: delete a flow after confirming", async ({ page }) => {
  acceptDialogs(page);
  await seedFlows([flow("spare", { name: "Spare flow" })]);
  await page.getByRole("button", { name: "Delete Spare flow" }).click();

  await expect.poll(async () => (await stored("tasks", "flows")).map((f) => f.id)).toEqual(["baseline"]);
  await expect(page.getByRole("button", { name: "Spare flow", exact: true })).toHaveCount(0);
});
