import type { LeaveAdjustment, LeaveAdjustmentInput, LeaveDecision, LeaveHoliday, LeaveInput, LeaveIssue, LeavePay, LeaveProfile, LeaveProfileDetails, LeaveRequest } from "./leave";
import type { MyLeave, PersonLeave, TeamLeave } from "./leave.server";

export class LeaveApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly issues: LeaveIssue[] = []) {
    super(message);
  }
}

type LeaveSession = { email: string; signal: AbortSignal };

async function fetchLeave<T>(path: string, init: RequestInit = {}, session?: LeaveSession): Promise<T> {
  const { clientAuth } = await import("./authClient");
  await clientAuth.authStateReady();
  const user = clientAuth.currentUser;
  if (!user || (session && (user.email || user.uid).toLowerCase() !== session.email)) {
    throw new LeaveApiError(401, "Sign in again.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  if (clientAuth.currentUser !== user) throw new LeaveApiError(401, "Sign in again.");
  const response = await fetch(`/api/leave${path}`, { ...init, headers, cache: "no-store", signal: session?.signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new LeaveApiError(response.ok ? 503 : response.status, body?.error ?? "Leave needs a connection. Try again.", body?.issues);
  }
  return body as T;
}

export function getMyLeave(session?: LeaveSession): Promise<MyLeave> {
  return fetchLeave("/me", {}, session);
}

export function getLeaveBadge(session: LeaveSession): Promise<{ waitingForMe: number | null }> {
  return fetchLeave("/me?view=badge", {}, session);
}

export function getLeaveTeam(): Promise<TeamLeave> {
  return fetchLeave("/team");
}

export function getPersonLeave(email: string): Promise<PersonLeave> {
  return fetchLeave(`/people/${encodeURIComponent(email)}`);
}

function writeLeave<T>(path: string, method: "POST" | "PUT", input: object, headers: Record<string, string> = {}, session?: LeaveSession) {
  return fetchLeave<T>(path, { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(input) }, session);
}

// Generate a UUID for each new submission and reuse it if the response is lost.
export function askLeave(input: LeaveInput & { pay?: LeavePay; email?: string }, key: string, session?: LeaveSession) {
  return writeLeave<{ request: LeaveRequest }>("/requests", "POST", input, { "Idempotency-Key": key }, session);
}

export function cancelLeave(id: string, session?: LeaveSession): Promise<{ request: LeaveRequest }> {
  return fetchLeave(`/requests/${encodeURIComponent(id)}/cancel`, { method: "POST" }, session);
}

export function decideLeave(id: string, input: LeaveDecision) {
  return writeLeave<{ request: LeaveRequest }>(`/requests/${encodeURIComponent(id)}/decide`, "POST", input);
}

// Reuse this key when retrying the same adjustment.
export function adjustLeave(input: LeaveAdjustmentInput, key: string) {
  return writeLeave<{ adjustment: LeaveAdjustment }>("/adjustments", "POST", input, { "Idempotency-Key": key });
}

// Use the profile's updatedAt (0 if missing) or the Team response's holidayVersion from the edit's initial read.
export function saveLeaveDetails(email: string, input: Partial<LeaveProfileDetails>, version: number) {
  return writeLeave<{ profile: LeaveProfile }>(`/profiles/${encodeURIComponent(email)}`, "PUT", input, { "If-Match": `"${version}"` });
}

type HolidayChange = { holiday: LeaveHoliday | null; holidayVersion: number };

export function addLeaveHoliday(holiday: LeaveHoliday, version: number) {
  return writeLeave<HolidayChange>(`/holidays/${encodeURIComponent(holiday.date)}`, "POST", { name: holiday.name }, { "If-Match": `"${version}"` });
}

export function removeLeaveHoliday(date: string, version: number): Promise<HolidayChange> {
  return fetchLeave(`/holidays/${encodeURIComponent(date)}`, { method: "DELETE", headers: { "If-Match": `"${version}"` } });
}
