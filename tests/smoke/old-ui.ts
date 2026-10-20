// Ways into the old UI. Phase 4 (task 4.3) rewrites the specs for the new UI
// and deletes this file.
import type { Locator, Page } from "@playwright/test";

// Side bar buttons are named with their icon, as in "⇄ Flow".
function navButton(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("button", { name: new RegExp(`(^|\\s)${name}(\\s|$)`) }).first();
}

export async function openArea(page: Page, name: string, group?: string) {
  const item = navButton(page, name);
  if (group && !(await item.isVisible())) {
    // A group's button ends with its ▸, which tells "Clients" the group from "Clients" the task list.
    await page.getByRole("navigation").getByRole("button", { name: new RegExp(`${group}\\s*▸$`) }).click();
  }
  await item.click();
}

// The element right after a field's label in the old forms.
export function field(scope: Locator, label: string) {
  return scope.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]`);
}

export function taskModal(page: Page, title: "New Task" | "Edit Task") {
  return page.locator("div.fixed.inset-0").filter({ has: page.getByRole("heading", { name: title }) });
}

export async function addPerson(people: Locator, name: string) {
  const input = people.locator("input");
  await input.fill(name);
  await input.press("Enter");
}

export function taskRow(page: Page, title: string) {
  return page.locator("tr").filter({ hasText: title });
}

// A dialog of the client areas, found by its heading.
export function dialog(page: Page, title: string) {
  return page.locator("div.fixed.inset-0").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

// The small panel a company cell opens, found by its title.
export function panel(page: Page, title: string) {
  return page.locator('div[style*="position: fixed"]').filter({ hasText: title });
}

// A cell of a company row, found by its column heading.
export async function cell(page: Page, rowText: string, heading: string) {
  const row = page.locator("tbody tr").filter({ hasText: rowText });
  await row.first().waitFor();
  const headings = (await page.locator("thead th").allTextContents()).map((t) => t.trim());
  const index = headings.findIndex((h) => h.startsWith(heading));
  if (index < 0) throw new Error(`No column "${heading}" in ${headings.join(", ")}`);
  return row.locator("td").nth(index);
}

export function companyTab(page: Page, label: string) {
  return page.locator("div.cursor-pointer").filter({ hasText: label });
}
