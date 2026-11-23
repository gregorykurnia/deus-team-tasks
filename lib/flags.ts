export function signInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SIGN_IN_ENABLED === "1";
}

export function leaveEnabled(): boolean {
  return signInEnabled() && process.env.NEXT_PUBLIC_LEAVE_ENABLED === "1";
}
