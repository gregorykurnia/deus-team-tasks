import { expect, type Page } from "@playwright/test";
import { readAll } from "../support/emulator";

export async function signInLeave(page: Page, next: string, email: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await enterLeaveCode(page, email);
}

export async function enterLeaveCode(page: Page, email: string) {
  const send = page.getByRole("button", { name: "Send code", exact: true });
  const enterCode = page.getByRole("heading", { name: "Enter the code" });
  const unanswered = page.getByText(/^We couldn’t confirm the code was sent\./);
  const readCode = async () => (await readAll("tasks", "_fakeMail")).find((row) => row.to === email)?.code;
  await page.getByRole("textbox", { name: "Work email" }).fill(email);
  await send.click();
  await expect(enterCode.or(unanswered)).toBeVisible({ timeout: 20_000 });
  if (await unanswered.isVisible()) {
    // A cold route can deliver the code after the browser deadline. Require delivery before retrying through the UI.
    await expect.poll(async () => (await readCode()) ?? "", { timeout: 30_000 }).toMatch(/^\d{6}$/);
    await send.click();
  }
  await expect(enterCode).toBeVisible({ timeout: 20_000 });
  const code = await readCode();
  expect(code).toMatch(/^\d{6}$/);
  for (const [index, digit] of Array.from(String(code)).entries()) {
    await page.getByRole("textbox", { name: `Digit ${index + 1}`, exact: true }).pressSequentially(digit);
  }
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 30_000 });
  const notifications = page.getByRole("dialog", { name: "Notifications", exact: true });
  if (new URL(page.url()).searchParams.has("notifications")) {
    await notifications.getByRole("button", { name: "Close", exact: true }).click();
  }
}
