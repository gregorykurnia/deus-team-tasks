import "server-only";
import { createHash } from "node:crypto";
import type { DocumentSnapshot, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { addDays, isIsoDay } from "./dates";
import { USE_EMULATOR } from "./emulator";
import { wibToday } from "./followupServer";
import { checkRequest, defaultLeavePay, requestDays, type LeaveAdjustment, type LeaveHoliday, type LeaveIssue, type LeaveProfile, type LeaveRequest } from "./leave";
import { buildLedger, type LeaveLedgerLine, type LeaveSummary } from "./leaveLedger";
import { readPerson } from "./people.server";
import { personEmail } from "./peopleInput";

export interface MyLeave {
  today: string;
  isAdmin: boolean;
  waitingForMe: number;
  profile: LeaveProfile | null;
  summary: LeaveSummary | null;
  ledger: LeaveLedgerLine[];
  requests: (LeaveRequest & { days: number })[];
  holidays: LeaveHoliday[];
}

export class LeaveError extends Error {
  constructor(public readonly status: number, message: string, public readonly issues?: LeaveIssue[]) {
    super(message);
  }
}

export function leaveAdmins(): string[] {
  const emails = new Set<string>();
  for (const entry of (process.env.LEAVE_ADMINS ?? "").split(",")) {
    try { emails.add(personEmail(entry)); } catch { /* Ignore invalid entries. */ }
  }
  return [...emails];
}

export function isLeaveAdmin(email: string): boolean {
  return leaveAdmins().includes(email.trim().toLowerCase());
}

export function leaveToday(now: Date = new Date()): string {
  const testDay = USE_EMULATOR ? process.env.LEAVE_TEST_DATE : undefined;
  return isIsoDay(testDay) ? testDay : wibToday(now);
}

const people = () => adminDb.collection("people");
const profiles = () => adminDb.collection("leaveProfiles");
const requests = () => adminDb.collection("leaveRequests");
const adjustments = () => adminDb.collection("leaveAdjustments");
const holidays = () => adminDb.collection("leaveHolidays").orderBy("date");

function requireActivePerson(snapshot: DocumentSnapshot) {
  const person = readPerson(snapshot);
  if (!person?.active) throw new LeaveError(403, "Leave access is unavailable.");
  return person;
}

function readRequest(doc: QueryDocumentSnapshot): LeaveRequest {
  return { ...doc.data(), id: doc.id } as LeaveRequest;
}

export function readMyLeave(email: string): Promise<MyLeave> {
  const today = leaveToday();
  const isAdmin = isLeaveAdmin(email);
  return adminDb.runTransaction(async (tx) => {
    const [person, profileDoc] = await tx.getAll(people().doc(email), profiles().doc(email));
    requireActivePerson(person);
    const profile = profileDoc.data() as LeaveProfile | undefined;
    const [holidayRows, waiting] = await Promise.all([
      tx.get(holidays()),
      isAdmin ? tx.get(requests().where("status", "==", "waiting").count()) : null,
    ]);
    const allHolidays = holidayRows.docs.map((doc) => doc.data() as LeaveHoliday);
    const through = addDays(today, 400);
    const common = {
      today, isAdmin, waitingForMe: waiting?.data().count ?? 0,
      holidays: allHolidays.filter(({ date }) => date >= today && date <= through),
    };
    if (!profile) return { ...common, profile: null, summary: null, ledger: [], requests: [] };

    const [requestRows, adjustmentRows] = await Promise.all([
      tx.get(requests().where("email", "==", email)),
      tx.get(adjustments().where("email", "==", email)),
    ]);
    const ownRequests = requestRows.docs.map(readRequest)
      .sort((a, b) => b.start.localeCompare(a.start) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const ownAdjustments = adjustmentRows.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as LeaveAdjustment);
    const { lines, summary } = buildLedger(profile, ownRequests, ownAdjustments, allHolidays, today);
    return {
      ...common, profile, summary, ledger: lines,
      requests: ownRequests.map((request) => ({ ...request, days: requestDays(request, allHolidays) })),
    };
  }, { readOnly: true });
}

export function createLeaveRequest(email: string, input: unknown, key: string | null): Promise<LeaveRequest> {
  if (key !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) {
    throw new LeaveError(400, "Use a valid request key.");
  }
  const requestId = key ? createHash("sha256").update(`${email}\0${key.toLowerCase()}`).digest("hex") : null;
  const ref = requestId ? requests().doc(requestId) : requests().doc();
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const isAdmin = isLeaveAdmin(email);

  return adminDb.runTransaction(async (tx) => {
    const [personDoc, profileDoc, previous] = await tx.getAll(people().doc(email), profiles().doc(email), ref);
    const person = requireActivePerson(personDoc);
    if (raw.email != null && raw.email !== email) throw new LeaveError(403, "You can only ask for your own leave here.");
    // A retry with a lost response must not recreate a request after its status changes.
    if (previous.exists) throw new LeaveError(409, "This request was already received. Refresh Leave to see its current status.");
    if (!profileDoc.exists) throw new LeaveError(409, "Leave is not set up for you yet.");

    // The same transaction checks overlap and creates the request, including when the query is empty.
    const [existing, holidayRows] = await Promise.all([
      tx.get(requests().where("email", "==", email)),
      tx.get(holidays()),
    ]);
    const checked = checkRequest(input, {
      today: leaveToday(), isAdmin, existing: existing.docs.map(readRequest),
      holidays: holidayRows.docs.map((doc) => doc.data() as LeaveHoliday),
    });
    if (!checked.request) throw new LeaveError(400, checked.errors[0].message, checked.errors);

    const chosenPay = raw.pay === "paid" || raw.pay === "unpaid" || raw.pay === "deduct" ? raw.pay : null;
    const pay = isAdmin ? defaultLeavePay(checked.request) ?? chosenPay : null;
    if (isAdmin && !pay) throw new LeaveError(400, "Choose how this absence is paid.");
    const now = Date.now();
    const data: Omit<LeaveRequest, "id"> = {
      ...checked.request, email, name: person.name, status: isAdmin ? "approved" : "waiting", pay,
      createdBy: email, createdAt: now, decidedBy: isAdmin ? email : null, decidedAt: isAdmin ? now : null,
      rejectReason: null, cancelledBy: null, cancelledAt: null,
    };
    tx.create(ref, data);
    return { ...data, id: ref.id };
  });
}

export function cancelLeaveRequest(email: string, id: string): Promise<LeaveRequest> {
  if (!id || id.includes("/") || id === "." || id === ".." || Buffer.byteLength(id) > 1500 || /^__.*__$/.test(id)) {
    throw new LeaveError(404, "Not found");
  }
  const ref = requests().doc(id);
  const isAdmin = isLeaveAdmin(email);
  return adminDb.runTransaction(async (tx) => {
    const [person, stored] = await tx.getAll(people().doc(email), ref);
    requireActivePerson(person);
    const request = stored.data() as Omit<LeaveRequest, "id"> | undefined;
    if (!request || (!isAdmin && request.email !== email)) throw new LeaveError(404, "Not found");
    if (request.status === "cancelled") throw new LeaveError(409, "This request is already cancelled.");
    const canCancel = request.status === "waiting" || (request.status === "approved" && request.start > leaveToday());
    if (!isAdmin && !canCancel) throw new LeaveError(409, "This request can no longer be cancelled.");

    const change = { status: "cancelled", cancelledBy: email, cancelledAt: Date.now() } as const;
    tx.update(ref, change);
    return { ...request, ...change, id };
  });
}
