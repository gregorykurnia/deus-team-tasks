import { expect, type Page } from "@playwright/test";
import { readAll } from "../support/emulator";

export async function signInLeave(page: Page, next: string, email: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await enterLeaveCode(page, email);
}

export async function enterLeaveCode(page: Page, email: string) {
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
