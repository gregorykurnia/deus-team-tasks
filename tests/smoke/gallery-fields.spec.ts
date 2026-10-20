// Fields on the dev gallery (task 2.6, guide 4.2, 4.3, 4.13, 5.11): the pickers work from the keyboard, a missing required
// field says what to do and takes focus, and clearing works.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { isoDay } from "./data";

test.beforeEach(async ({ page }) => {
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { level: 2, name: /^Fields/ })).toBeVisible();
});

const form = (page: Page) => page.getByRole("region", { name: "A form, like the new-task sheet" });

test.describe("people picker", () => {
  test("typing offers names in use with their open tasks, and Enter picks the highlighted one", async ({ page }) => {
    const picker = form(page).getByRole("combobox", { name: "Responsible" });
    await picker.click();
    await picker.fill("na");
    const list = page.getByRole("listbox", { name: "Names already in use" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option", { name: /Nadia Pratama.*3 open/ })).toBeVisible();
    await expect(page.getByRole("option", { name: "Add “na” as a new name" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(form(page).getByRole("button", { name: "Remove Nadia Pratama" })).toBeVisible();
    await expect(picker).toHaveValue("");
  });

  test("the arrow keys move to 'Add as a new name', and Backspace in an empty field removes the last person", async ({ page }) => {
    const picker = form(page).getByRole("combobox", { name: "Responsible" });
    await picker.click();
    await picker.fill("agus");
    await expect(page.getByRole("option", { name: "Add “agus” as a new name" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(form(page).getByRole("button", { name: "Remove agus" })).toBeVisible();

    await picker.fill("ma");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "Add “ma” as a new name" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("option", { name: /Maya Chen/ })).toHaveCount(0); // Maya is already chosen
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();

    await picker.fill("");
    await page.keyboard.press("Backspace");
    await expect(form(page).getByRole("button", { name: "Remove agus" })).toBeHidden();
    await expect(form(page).getByRole("button", { name: "Remove Maya Chen" })).toBeVisible();
  });

  test("a click on a suggestion picks it", async ({ page }) => {
    const picker = form(page).getByRole("combobox", { name: "Responsible" });
    await picker.click();
    await picker.fill("bu");
    await page.getByRole("option", { name: /Budi Santoso/ }).click();
    await expect(form(page).getByRole("button", { name: "Remove Budi Santoso" })).toBeVisible();
  });
});

test.describe("informed list", () => {
  test("adds someone from the add line, takes a note for their part, and removes them", async ({ page }) => {
    const add = form(page).getByRole("combobox", { name: "Add someone to keep informed" });
    await add.click();
    await add.fill("dian");
    await page.keyboard.press("Enter");
    const note = form(page).getByLabel("Their part for Dian Nadira");
    await note.fill("approves the quote");
    await expect(note).toHaveValue("approves the quote");
    await form(page).getByRole("button", { name: "Remove Dian Nadira" }).click();
    await expect(note).toBeHidden();
    await expect(form(page).getByLabel("Their part for Kevin Tan")).toHaveValue("backup");
  });
});

test.describe("sector picker", () => {
  test("says before saving whether a spelling is the same sector or a new one", async ({ page }) => {
    const sector = page.getByRole("combobox", { name: "Sector" });
    await sector.fill("retail");
    await expect(page.getByText("Same sector as “Retail”, so it’s saved that way.")).toBeVisible();
    await sector.fill("Agritech");
    await expect(page.getByText("“Agritech” will be a new sector.")).toBeVisible();
    await sector.fill("Retail");
    await expect(page.getByText(/will be a new sector|Same sector as/)).toHaveCount(0);
  });

  test("lists sectors in use with their company counts, and a click picks one", async ({ page }) => {
    const sector = page.getByRole("combobox", { name: "Sector" });
    await sector.click();
    await sector.fill("hea");
    const option = page.getByRole("option", { name: /Healthcare.*7 companies/ });
    await expect(option).toBeVisible();
    await option.click();
    await expect(sector).toHaveValue("Healthcare");
  });

  test("Enter keeps what was typed; an arrow key first picks the highlighted sector", async ({ page }) => {
    const sector = page.getByRole("combobox", { name: "Sector" });
    await sector.fill("Food");
    await expect(page.getByRole("option", { name: /Food and beverage/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(sector).toHaveValue("Food");
    await expect(page.getByRole("listbox")).toBeHidden();
    await sector.fill("Foo");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(sector).toHaveValue("Food and beverage");
  });
});

test.describe("required fields", () => {
  test("a missing description says what to do, takes focus, and clears as soon as it's fixed", async ({ page }) => {
    const description = form(page).getByLabel("Description");
    await form(page).getByRole("button", { name: "Add task" }).click();
    await expect(form(page).getByText("Add a short description so the team knows what this is.")).toBeVisible();
    await expect(description).toHaveAttribute("aria-invalid", "true");
    await expect(description).toBeFocused();
    await description.pressSequentially("Call Pelita Foods");
    await expect(form(page).getByText("Add a short description so the team knows what this is.")).toBeHidden();
    await expect(description).not.toHaveAttribute("aria-invalid", "true");
  });

  test("every try with the error still there takes focus back to the field", async ({ page }) => {
    const description = form(page).getByLabel("Description");
    const add = form(page).getByRole("button", { name: "Add task" });
    await add.click();
    await expect(description).toBeFocused();
    await add.focus();
    await add.click();
    await expect(description).toBeFocused();
  });

  test("the Informed label names the add field", async ({ page }) => {
    await expect(form(page).getByLabel("Informed")).toHaveAttribute("placeholder", "Add someone to keep informed");
  });
});

test.describe("dates, choices and switches", () => {
  test("quick dates fill the date and press, and the × clears it", async ({ page }) => {
    const deadline = form(page).getByLabel("Deadline", { exact: false });
    await form(page).getByRole("button", { name: "Tomorrow" }).click();
    await expect(deadline).toHaveValue(isoDay(1));
    await expect(form(page).getByRole("button", { name: "Tomorrow" })).toHaveAttribute("aria-pressed", "true");
    await form(page).getByRole("button", { name: "Clear date" }).click();
    await expect(deadline).toHaveValue("");
    await expect(form(page).getByRole("button", { name: "Tomorrow" })).toHaveAttribute("aria-pressed", "false");
  });

  test("pressing the chosen priority again clears it", async ({ page }) => {
    const high = form(page).getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" });
    await high.click();
    await expect(high).toHaveAttribute("aria-pressed", "true");
    await high.click();
    await expect(high).toHaveAttribute("aria-pressed", "false");
  });

  test("a choice chip toggles with Space", async ({ page }) => {
    const call = form(page).getByRole("group", { name: "Touch point" }).getByRole("button", { name: "Call" });
    await call.focus();
    await page.keyboard.press("Space");
    await expect(call).toHaveAttribute("aria-pressed", "true");
  });

  test("a switch toggles", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Show finished tasks" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("filter buttons", () => {
  test("a filter opens its menu, shows the chosen value, and clears with its ×", async ({ page }) => {
    const filters = page.getByRole("region", { name: "Segmented controls and filter buttons" });
    const due = filters.getByRole("button", { name: /^Due/ });
    await due.click();
    await page.getByRole("menuitemradio", { name: "Overdue" }).click();
    await expect(due).toContainText("Overdue");
    await expect(due).toBeFocused();
    await filters.getByRole("button", { name: "Clear the due filter" }).click();
    await expect(filters.getByRole("button", { name: "Clear the due filter" })).toBeHidden();
    await expect(due).not.toContainText("Overdue");
  });
});
