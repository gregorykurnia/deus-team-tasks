export function signInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SIGN_IN_ENABLED === "1";
}
