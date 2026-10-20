// Ways into the old UI. Phase 4 (task 4.3) rewrites the specs for the new UI
// and deletes this file.
import type { Locator, Page } from "@playwright/test";

// Side bar buttons are named with their icon, as in "⇄ Flow".
function navButton(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("button", { name: new RegExp(`(^|\\s)${name}(\\s|$)`) }).first();
}

export async function openArea(page: Page, name: string, group?: string) {
  const item = navButton(page, name);
  if (group && !(await item.isVisible())) await navButton(page, group).click();
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
