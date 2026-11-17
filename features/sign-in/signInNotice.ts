import type { ToastApi } from "@/ui/Toaster";

let dismiss: (() => void) | undefined;

export function showSignInNotice(toast: ToastApi, name: string) {
  dismissSignInNotice();
  const id = toast(`Signed in as ${name}`);
  dismiss = () => toast.dismiss(id);
}

// Once an account panel is opened, its identity confirms sign-in. The old toast mustn't cover its rows.
export function dismissSignInNotice() { dismiss?.(); dismiss = undefined; }
