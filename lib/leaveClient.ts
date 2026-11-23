import type { LeaveInput, LeaveIssue, LeavePay, LeaveRequest } from "./leave";
import type { MyLeave } from "./leave.server";

export class LeaveApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly issues: LeaveIssue[] = []) {
    super(message);
  }
}

async function fetchLeave<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { clientAuth } = await import("./authClient");
  await clientAuth.authStateReady();
  const user = clientAuth.currentUser;
  if (!user) throw new LeaveApiError(401, "Sign in again.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  const response = await fetch(`/api/leave${path}`, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new LeaveApiError(response.ok ? 503 : response.status, body?.error ?? "Leave needs a connection. Try again.", body?.issues);
  }
  return body as T;
}

export function getMyLeave(): Promise<MyLeave> {
  return fetchLeave("/me");
}

// Generate a UUID for each new submission and reuse it if the response is lost.
export function askLeave(input: LeaveInput & { pay?: LeavePay }, key: string): Promise<{ request: LeaveRequest }> {
  return fetchLeave("/requests", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input),
  });
}

export function cancelLeave(id: string): Promise<{ request: LeaveRequest }> {
  return fetchLeave(`/requests/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
