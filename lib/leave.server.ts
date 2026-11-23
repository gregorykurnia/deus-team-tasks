import "server-only";
import { createHash } from "node:crypto";
import type { DocumentSnapshot, QueryDocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { after } from "next/server";
import { adminDb } from "./admin";
import { addDays, isIsoDay, weekdayDate } from "./dates";
import { USE_EMULATOR } from "./emulator";
import { wibToday } from "./followupServer";
import {
  canCancelLeave, checkRequest, defaultLeavePay, nextMissingHolidayYear, requestDays, workingDates,
  type LeaveAdjustment, type LeaveAudit, type LeaveHoliday, type LeaveIssue, type LeaveProfile,
  type LeaveProfileDetails, type LeaveProfileField, type LeaveRequest,
} from "./leave";
import { buildLedger, type LeaveLedgerLine, type LeaveSummary } from "./leaveLedger";
import { leaveAddedMessage, leaveAdjustedMessage, leaveCancelledMessage, leaveDecidedMessage, leaveRequestedMessage } from "./leaveMessages";
import { readPerson, type Person } from "./people.server";
import { personEmail } from "./peopleInput";
import { sendPushToPerson, type PushMessage } from "./push.server";

interface LeaveHistory {
  profile: LeaveProfile | null;
  summary: LeaveSummary | null;
  ledger: LeaveLedgerLine[];
  requests: (LeaveRequest & { days: number })[];
}

type NamedLeaveAudit = LeaveAudit & { byName: string };
type LeaveHistoryChange = Pick<NamedLeaveAudit, "id" | "at" | "field" | "from" | "to" | "byName">;

export interface MyLeave extends LeaveHistory {
  today: string;
  isAdmin: boolean;
  waitingForMe: number;
  holidays: LeaveHoliday[];
  setupContact: string | null;
  actorNames: Record<string, string>;
  changes: LeaveHistoryChange[];
}

export interface PersonLeave extends LeaveHistory {
  today: string;
  person: Person;
  audit: NamedLeaveAudit[];
  holidays: LeaveHoliday[];
}

interface TeamLeavePerson extends Person {
  endDate: string | null;
  summary: LeaveSummary | null;
  counts: { annual: number; sick: number; other: number };
}

export interface TeamLeave {
  today: string;
  people: TeamLeavePerson[];
  waiting: (LeaveRequest & { days: number; availableAfter: number | null; alsoAway: { name: string; dates: string[] }[] })[];
  nextMissingHolidayYear: string | null;
  holidayVersion: number;
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
const waitingCountQuery = () => requests().where("status", "==", "waiting").count();
const adjustments = () => adminDb.collection("leaveAdjustments");
const auditRows = () => adminDb.collection("leaveAudit");
const holidayCollection = () => adminDb.collection("leaveHolidays");
// The settings document has no date and stays out of holiday queries.
const holidaySettings = () => holidayCollection().doc("_settings");
const holidays = () => holidayCollection().orderBy("date");
const setupActor = "Setup";

export async function countWaitingLeaveRequests(): Promise<number> {
  return (await waitingCountQuery().get()).data().count;
}

export function readLeaveBadge(email: string): Promise<{ waitingForMe: number | null }> {
  return adminDb.runTransaction(async (tx) => {
    requireActivePerson(await tx.get(people().doc(email)));
    const waiting = isLeaveAdmin(email) ? await tx.get(waitingCountQuery()) : null;
    return { waitingForMe: waiting?.data().count ?? null };
  }, { readOnly: true });
}

function queueLeavePush(actor: string, recipients: readonly string[], buildMessage: () => PushMessage): void {
  const others = recipients.filter((email) => email !== actor);
  if (!others.length) return;
  // Only a confirmed transaction queues a push. A slow delivery must not delay the saved response.
  try {
    after(async () => {
      try {
        const message = buildMessage();
        await Promise.all(others.map((email) => sendPushToPerson(email, message)));
      } catch {
        console.error("Leave notification could not be processed.");
      }
    });
  } catch {
    console.error("Leave notification could not be scheduled.");
  }
}

function requireActivePerson(snapshot: DocumentSnapshot) {
  const person = readPerson(snapshot);
  if (!person?.active) throw new LeaveError(403, "Leave access is unavailable.");
  return person;
}

function readRequest(doc: QueryDocumentSnapshot): LeaveRequest {
  return { ...doc.data(), id: doc.id } as LeaveRequest;
}

function readAdjustment(doc: QueryDocumentSnapshot): LeaveAdjustment {
  return { ...doc.data(), id: doc.id } as LeaveAdjustment;
}

function readHoliday(doc: DocumentSnapshot): LeaveHoliday | null {
  const data = doc.data();
  return data ? { date: data.date, name: data.name } : null;
}

function readProfile(doc: DocumentSnapshot): LeaveProfile | null {
  const profile = doc.data() as LeaveProfile | undefined;
  return profile ? { ...profile, openingCarried: profile.openingCarried ?? 0, endDate: profile.endDate ?? null } : null;
}

function buildHistory(
  profile: LeaveProfile | null, requestRows: LeaveRequest[], adjustmentRows: LeaveAdjustment[], daysOff: LeaveHoliday[], today: string,
): LeaveHistory {
  if (!profile) return { profile: null, summary: null, ledger: [], requests: [] };
  const { lines, summary } = buildLedger(profile, requestRows, adjustmentRows, daysOff, today);
  const ordered = requestRows.sort((a, b) => b.start.localeCompare(a.start) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return { profile, summary, ledger: lines, requests: ordered.map((request) => ({ ...request, days: requestDays(request, daysOff) })) };
}

function readHolidayRows(docs: QueryDocumentSnapshot[]): LeaveHoliday[] {
  return docs.map((doc) => ({ date: doc.get("date"), name: doc.get("name") }));
}

function readAuditRows(docs: QueryDocumentSnapshot[]): LeaveAudit[] {
  return docs.map((doc) => ({ ...doc.data(), id: doc.id }) as LeaveAudit)
    .sort((a, b) => b.at - a.at || a.field.localeCompare(b.field));
}

async function readActorNames(tx: Transaction, addresses: (string | null)[]): Promise<Record<string, string>> {
  const actors = [...new Set(addresses.filter((by): by is string => !!by && by !== setupActor))];
  const snapshots = actors.length ? await tx.getAll(...actors.map((by) => people().doc(by))) : [];
  return Object.fromEntries(snapshots.flatMap((doc) => {
    const person = readPerson(doc);
    return person ? [[doc.id, person.name]] : [];
  }));
}

function nameAudit(rows: LeaveAudit[], names: Record<string, string>): NamedLeaveAudit[] {
  return rows.map((row) => ({ ...row, byName: names[row.by] ?? row.by }));
}

function requireAdmin(email: string): void {
  if (!isLeaveAdmin(email)) throw new LeaveError(403, "Only a Leave admin can do this.");
}

function activeAdminTransaction<T>(email: string, action: (tx: Transaction) => Promise<T>, readOnly = false): Promise<T> {
  requireAdmin(email);
  return adminDb.runTransaction(async (tx) => {
    requireActivePerson(await tx.get(people().doc(email)));
    return action(tx);
  }, readOnly ? { readOnly: true } : undefined);
}

export function readMyLeave(email: string): Promise<MyLeave> {
  const today = leaveToday();
  const isAdmin = isLeaveAdmin(email);
  return adminDb.runTransaction(async (tx) => {
    const [person, profileDoc] = await tx.getAll(people().doc(email), profiles().doc(email));
    const current = requireActivePerson(person);
    const profile = readProfile(profileDoc);
    const [holidayRows, waiting] = await Promise.all([
      tx.get(holidays()),
      isAdmin ? tx.get(waitingCountQuery()) : null,
    ]);
    const allHolidays = readHolidayRows(holidayRows.docs);
    const through = addDays(today, 400);
    const common = {
      today, isAdmin, waitingForMe: waiting?.data().count ?? 0,
      holidays: allHolidays.filter(({ date }) => date >= today && date <= through),
    };
    if (!profile) {
      const firstAdmin = leaveAdmins()[0];
      const contact = firstAdmin === email ? current : firstAdmin && readPerson(await tx.get(people().doc(firstAdmin)));
      return {
        ...common, ...buildHistory(null, [], [], allHolidays, today),
        setupContact: contact ? contact.name.split(/\s+/, 1)[0] : null, actorNames: {}, changes: [],
      };
    }

    const [requestRows, adjustmentRows, detailsRows] = await Promise.all([
      tx.get(requests().where("email", "==", email)),
      tx.get(adjustments().where("email", "==", email)),
      tx.get(auditRows().where("email", "==", email)),
    ]);
    const history = buildHistory(profile, requestRows.docs.map(readRequest), adjustmentRows.docs.map(readAdjustment), allHolidays, today);
    const details = readAuditRows(detailsRows.docs);
    const actors = history.requests.flatMap((row) => [row.createdBy, row.decidedBy, row.cancelledBy]);
    const names = await readActorNames(tx, [...actors, ...details.map(({ by }) => by)].filter((by) => by !== email));
    names[email] = current.name;
    const actorNames = Object.fromEntries([...new Set([email, ...actors])].flatMap((by) => by && names[by] ? [[by, names[by]]] : []));
    const changes = details.map(({ id, at, field, from, to, by }) => ({
      id, at, field, from, to, byName: names[by] ?? (by === setupActor ? setupActor : "a Leave admin"),
    }));
    return { ...common, ...history, setupContact: null, actorNames, changes };
  }, { readOnly: true });
}

function inputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function invalid(field: LeaveIssue["field"], message: string): never {
  throw new LeaveError(400, message, [{ field, message }]);
}

function targetEmail(input: unknown): string {
  if (typeof input === "string") {
    try { return personEmail(input); } catch { /* Report on the field below. */ }
  }
  return invalid("email", "Use a deushcs.com email, at most 128 characters.");
}

function operationId(email: string, key: string | null): string | undefined {
  if (key === null) return undefined;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) throw new LeaveError(400, "Use a valid request key.");
  return createHash("sha256").update(`${email}\0${key.toLowerCase()}`).digest("hex");
}

function payChoice(value: unknown) {
  if (value === "paid" || value === "unpaid" || value === "deduct") return value;
  return invalid("pay", "Choose how this absence is paid.");
}

export async function createLeaveRequest(email: string, input: unknown, key: string | null): Promise<LeaveRequest> {
  const autoRef = requests().doc();
  const raw = inputRecord(input);
  const isAdmin = isLeaveAdmin(email);

  const { request, actorName, count, today } = await adminDb.runTransaction(async (tx) => {
    const actor = requireActivePerson(await tx.get(people().doc(email)));
    if (raw.email != null && !isAdmin && raw.email !== email) throw new LeaveError(403, "You can only ask for your own leave here.");
    const target = raw.email == null ? email : targetEmail(raw.email);
    const requestId = operationId(email, key);
    if (target !== email && !requestId) throw new LeaveError(400, "Use a request key when adding leave for someone.");
    const ref = requestId ? requests().doc(requestId) : autoRef;
    const [profileDoc, previous] = await tx.getAll(profiles().doc(target), ref);
    // A retry with a lost response must not recreate a request after its status changes.
    if (previous.exists) throw new LeaveError(409, "This request was already received. Refresh Leave to see its current status.");
    const profile = readProfile(profileDoc);
    if (!profile) throw new LeaveError(409, target === email ? "Leave is not set up for you yet." : "Leave is not set up for this person yet.");
    const person = target === email ? actor : readPerson(await tx.get(people().doc(target)));

    // The same transaction checks overlap and creates the request, including when the query is empty.
    const [existing, holidayRows] = await Promise.all([
      tx.get(requests().where("email", "==", target)),
      tx.get(holidays()),
    ]);
    const today = leaveToday();
    const checked = checkRequest(input, {
      today, isAdmin, existing: existing.docs.map(readRequest), holidays: readHolidayRows(holidayRows.docs),
    });
    if (!checked.request) throw new LeaveError(400, checked.errors[0].message, checked.errors);
    if (profile.endDate && checked.request.end > profile.endDate) {
      invalid("end", `Choose an end date on or before the last day (${weekdayDate(profile.endDate, today)}).`);
    }

    const pay = isAdmin ? defaultLeavePay(checked.request) ?? payChoice(raw.pay) : null;
    const now = Date.now();
    const data: Omit<LeaveRequest, "id"> = {
      ...checked.request, email: target, name: person?.name ?? profile.name, status: isAdmin ? "approved" : "waiting", pay,
      createdBy: email, createdAt: now, decidedBy: isAdmin ? email : null, decidedAt: isAdmin ? now : null,
      rejectReason: null, cancelledBy: null, cancelledAt: null,
    };
    tx.create(ref, data);
    return { request: { ...data, id: ref.id }, actorName: actor.name, count: checked.days, today };
  });
  if (request.status === "waiting") {
    queueLeavePush(email, leaveAdmins(), () => leaveRequestedMessage(request, count, today));
  } else {
    queueLeavePush(email, [request.email], () => leaveAddedMessage(request, actorName, today));
  }
  return request;
}

function requestRef(id: string) {
  if (!id || id.includes("/") || id === "." || id === ".." || Buffer.byteLength(id) > 1500 || /^__.*__$/.test(id)) {
    throw new LeaveError(404, "Not found");
  }
  return requests().doc(id);
}

export async function cancelLeaveRequest(email: string, id: string): Promise<LeaveRequest> {
  const ref = requestRef(id);
  const isAdmin = isLeaveAdmin(email);
  const { cancelled, previousStatus, actorName, today } = await adminDb.runTransaction(async (tx) => {
    const [person, stored] = await tx.getAll(people().doc(email), ref);
    const actor = requireActivePerson(person);
    const request = stored.data() as Omit<LeaveRequest, "id"> | undefined;
    if (!request || (!isAdmin && request.email !== email)) throw new LeaveError(404, "Not found");
    if (request.status === "cancelled") throw new LeaveError(409, "This request is already cancelled.");
    const today = leaveToday();
    if (!canCancelLeave(request, today, isAdmin)) throw new LeaveError(409, "This request can no longer be cancelled.");

    const change = { status: "cancelled", cancelledBy: email, cancelledAt: Date.now() } as const;
    tx.update(ref, change);
    return { cancelled: { ...request, ...change, id }, previousStatus: request.status, actorName: actor.name, today };
  });
  const ownRequest = cancelled.email === email;
  if (previousStatus === "approved" || (previousStatus === "waiting" && !ownRequest)) {
    queueLeavePush(email, ownRequest ? leaveAdmins() : [cancelled.email],
      () => leaveCancelledMessage(cancelled, actorName, ownRequest, today));
  }
  return cancelled;
}

export function readPersonLeave(email: string, target: string): Promise<PersonLeave> {
  const today = leaveToday();
  return activeAdminTransaction(email, async (tx) => {
    const address = targetEmail(target);
    const [personDoc, profileDoc] = await tx.getAll(people().doc(address), profiles().doc(address));
    const profile = readProfile(profileDoc);
    const person = readPerson(personDoc) ?? (profile && { email: address, name: profile.name, active: false });
    if (!person || (!profile && !person.active)) throw new LeaveError(404, "This person isn't available.");

    const holidayRows = await tx.get(holidays());
    const daysOff = readHolidayRows(holidayRows.docs);
    const common = { today, person, holidays: daysOff };
    if (!profile) return { ...common, audit: [], ...buildHistory(null, [], [], daysOff, today) };

    const [requestRows, adjustmentRows, detailsRows] = await Promise.all([
      tx.get(requests().where("email", "==", address)),
      tx.get(adjustments().where("email", "==", address)),
      tx.get(auditRows().where("email", "==", address)),
    ]);
    const details = readAuditRows(detailsRows.docs);
    const names = await readActorNames(tx, details.map(({ by }) => by));
    return {
      ...common,
      ...buildHistory(profile, requestRows.docs.map(readRequest), adjustmentRows.docs.map(readAdjustment), daysOff, today),
      audit: nameAudit(details, names),
    };
  }, true);
}

function leaveTaken(approved: LeaveRequest[], daysOff: LeaveHoliday[], today: string): TeamLeavePerson["counts"] {
  const january = `${today.slice(0, 4)}-01-01`;
  const counts = { annual: 0, sick: 0, other: 0 };
  for (const request of approved) {
    const start = request.start > january ? request.start : january;
    const end = request.end < today ? request.end : today;
    const taken = requestDays({ start, end, half: request.half }, daysOff);
    counts[request.type] += request.type === "other" ? Number(taken > 0) : taken;
  }
  return counts;
}

function alsoAway(waiting: LeaveRequest, approved: LeaveRequest[], daysOff: LeaveHoliday[]) {
  const peers = new Map<string, { name: string; dates: string[] }>();
  for (const request of approved) {
    if (request.email === waiting.email) continue;
    const start = request.start > waiting.start ? request.start : waiting.start;
    const end = request.end < waiting.end ? request.end : waiting.end;
    const dates = workingDates(start, end, daysOff);
    if (dates.length === 0) continue;
    const previous = peers.get(request.email);
    if (previous) previous.dates.push(...dates);
    else peers.set(request.email, { name: request.name, dates });
  }
  return [...peers.values()].map(({ name, dates }) => ({ name, dates: [...new Set(dates)].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readTeamLeave(email: string): Promise<TeamLeave> {
  const today = leaveToday();
  return activeAdminTransaction(email, async (tx) => {
    const [peopleRows, profileRows, requestRows, adjustmentRows, holidayRows, settings] = await Promise.all([
      tx.get(people()), tx.get(profiles()), tx.get(requests()), tx.get(adjustments()), tx.get(holidays()), tx.get(holidaySettings()),
    ]);
    const directory = peopleRows.docs.map(readPerson).filter((person) => person !== null);
    const currentPeople = new Map(directory.map((person) => [person.email, person]));
    const history = new Map<string, LeaveProfile>();
    for (const doc of profileRows.docs) {
      const profile = readProfile(doc);
      if (!profile) continue;
      history.set(doc.id, profile);
      if (!currentPeople.has(doc.id)) currentPeople.set(doc.id, { email: doc.id, name: profile.name, active: false });
    }
    const allRequests = requestRows.docs.map(readRequest);
    const allAdjustments = adjustmentRows.docs.map(readAdjustment);
    const daysOff = readHolidayRows(holidayRows.docs);
    const team = [...currentPeople.values()].filter((person) => person.active || history.has(person.email)).map((person) => {
      const profile = history.get(person.email);
      const own = allRequests.filter((request) => request.email === person.email);
      const ownAdjustments = allAdjustments.filter((adjustment) => adjustment.email === person.email);
      const summary = profile ? buildLedger(profile, own, ownAdjustments, daysOff, today).summary : null;
      return {
        ...person, endDate: profile?.endDate ?? null, summary,
        counts: leaveTaken(own.filter(({ status }) => status === "approved"), daysOff, today),
      };
    });
    const left = ({ endDate }: TeamLeavePerson) => Number(endDate !== null && endDate < today);
    team.sort((a, b) => left(a) - left(b) || a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
    const available = new Map(team.map(({ email, summary }) => [email, summary?.available ?? null]));
    const approved = allRequests.filter(({ status }) => status === "approved");
    const waiting = allRequests.filter(({ status }) => status === "waiting")
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((request) => ({
        ...request, days: requestDays(request, daysOff), availableAfter: available.get(request.email) ?? null,
        alsoAway: alsoAway(request, approved, daysOff),
      }));
    return { today, people: team, waiting, holidays: daysOff, holidayVersion: holidayVersion(settings), nextMissingHolidayYear: nextMissingHolidayYear(today, daysOff) };
  }, true);
}

function requiredText(value: unknown, field: "reason" | "name", label: string, max: number): string {
  if (typeof value === "string" && value.length <= max && value.trim()) return value.trim();
  return invalid(field, `Enter ${label} from 1 to ${max} characters.`);
}

export async function decideLeaveRequest(email: string, id: string, input: unknown): Promise<LeaveRequest> {
  const today = leaveToday();
  const decided = await activeAdminTransaction(email, async (tx) => {
    const ref = requestRef(id);
    const request = (await tx.get(ref)).data() as Omit<LeaveRequest, "id"> | undefined;
    if (!request) throw new LeaveError(404, "Not found");
    if (request.status !== "waiting") throw new LeaveError(409, "This request is no longer waiting.");

    const { decision, pay, reason } = inputRecord(input);
    if (decision !== "approve" && decision !== "reject") invalid("decision", "Choose approve or reject.");
    const change = {
      status: decision === "approve" ? "approved" : "rejected",
      pay: decision === "approve" ? defaultLeavePay(request) ?? payChoice(pay) : null,
      rejectReason: decision === "reject" ? requiredText(reason, "reason", "a reason", 300) : null,
      decidedBy: email, decidedAt: Date.now(),
    } as const;
    tx.update(ref, change);
    return { ...request, ...change, id };
  });
  queueLeavePush(email, [decided.email], () => leaveDecidedMessage(decided, today));
  return decided;
}

function halfSteps(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value * 2);
}

export async function adjustLeaveBalance(email: string, input: unknown, key: string | null): Promise<LeaveAdjustment> {
  const adjustment = await activeAdminTransaction(email, async (tx) => {
    const id = operationId(email, key);
    if (!id) throw new LeaveError(400, "Use a request key when adjusting a balance.");
    const raw = inputRecord(input);
    const address = targetEmail(raw.email);
    const ref = adjustments().doc(id);
    const [profileDoc, previous] = await tx.getAll(profiles().doc(address), ref);
    if (previous.exists) throw new LeaveError(409, "This adjustment was already received. Refresh Leave to see the current balance.");
    if (!profileDoc.exists) throw new LeaveError(404, "Leave isn't set up for this person.");
    const days = raw.days;
    if (!halfSteps(days) || days === 0 || days < -30 || days > 30) invalid("days", "Enter a non-zero adjustment in half days, from −30 to 30.");
    const reason = requiredText(raw.reason, "reason", "a reason", 300);
    const date = raw.date === undefined ? leaveToday() : raw.date;
    if (!isIsoDay(date)) invalid("date", "Enter a valid adjustment date.");
    const data = { email: address, days, reason, date, by: email, at: Date.now() };
    tx.create(ref, data);
    return { ...data, id };
  });
  queueLeavePush(email, [adjustment.email], () => leaveAdjustedMessage(adjustment));
  return adjustment;
}

const detailFields = ["joinDate", "accrualStart", "openingBalance", "openingDate", "openingCarried", "endDate"] as const;

function detailsFrom(input: unknown, before: LeaveProfile | null): LeaveProfileDetails {
  const raw = inputRecord(input);
  const value = (field: LeaveProfileField, fallback?: unknown) => Object.hasOwn(raw, field) ? raw[field] : fallback;
  if (!detailFields.some((field) => Object.hasOwn(raw, field))) invalid("joinDate", "Enter the leave details to save.");
  const joinDate = value("joinDate", before?.joinDate);
  const accrualStart = value("accrualStart", before?.accrualStart);
  const openingBalance = value("openingBalance", before?.openingBalance);
  const openingDate = value("openingDate", before?.openingDate);
  const endDate = value("endDate", before?.endDate ?? null);
  if (!isIsoDay(joinDate)) invalid("joinDate", "Enter a valid join date.");
  if (!isIsoDay(accrualStart) || !accrualStart.endsWith("-01")) invalid("accrualStart", "Choose the 1st of a month.");
  if (!halfSteps(openingBalance)) invalid("openingBalance", "Enter an opening balance in half days.");
  if (!isIsoDay(openingDate) || openingDate < joinDate) invalid("openingDate", "Choose an opening date on or after the join date.");
  if (endDate !== null && (!isIsoDay(endDate) || endDate < joinDate)) invalid("endDate", "Choose a last day on or after the join date.");
  const canCarry = /^\d{4}-0[12]-/.test(openingDate);
  const openingCarried = value("openingCarried", canCarry ? before?.openingCarried ?? 0 : 0);
  if (!halfSteps(openingCarried) || openingCarried < 0 || openingCarried > Math.max(0, openingBalance) || (!canCarry && openingCarried !== 0)) {
    invalid("openingCarried", "Enter the days carried from last year in half days, within the opening balance in January or February.");
  }
  return { joinDate, accrualStart, openingBalance, openingDate, openingCarried, endDate };
}

function changedFields(before: LeaveProfile | null, details: LeaveProfileDetails): LeaveProfileField[] {
  return detailFields.filter((field) => (before?.[field] ?? null) !== details[field]);
}

function writeProfile(tx: Transaction, after: LeaveProfile, before: LeaveProfile | null, fields: LeaveProfileField[], by: string): void {
  tx.set(profiles().doc(after.email), after);
  for (const field of fields) {
    const row: Omit<LeaveAudit, "id"> = { email: after.email, by, at: after.updatedAt, field, from: before?.[field] ?? null, to: after[field] };
    tx.create(auditRows().doc(), row);
  }
}

export function saveLeaveProfile(email: string, target: string, input: unknown, version: number): Promise<LeaveProfile> {
  return activeAdminTransaction(email, async (tx) => {
    const address = targetEmail(target);
    const [personDoc, profileDoc] = await tx.getAll(people().doc(address), profiles().doc(address));
    const before = readProfile(profileDoc);
    const person = readPerson(personDoc);
    const name = before?.name ?? (person?.active ? person.name : null);
    if (!name) throw new LeaveError(404, "This person isn't available.");
    const details = detailsFrom(input, before);
    const fields = changedFields(before, details);
    if (before && fields.length === 0) return before;
    if (version !== (before?.updatedAt ?? 0)) throw new LeaveError(409, "These leave details changed. Reload them before saving.");

    if (fields.includes("endDate") && details.endDate) {
      const lastDay = details.endDate;
      const existing = await tx.get(requests().where("email", "==", address));
      const count = existing.docs.map(readRequest).filter((request) => request.end > lastDay
        && (request.status === "waiting" || request.status === "approved")).length;
      if (count) {
        const message = `Cancel ${name}'s ${count === 1 ? "request" : `${count} requests`} after ${weekdayDate(lastDay, leaveToday())} first.`;
        throw new LeaveError(409, message, [{ field: "endDate", message }]);
      }
    }

    const after = { ...details, email: address, name, updatedAt: Math.max(Date.now(), (before?.updatedAt ?? 0) + 1) };
    writeProfile(tx, after, before, fields, email);
    return after;
  });
}

function holidayVersion(settings: DocumentSnapshot): number {
  return settings.get("version") ?? 0;
}

function validatedHoliday(date: unknown, name: unknown): LeaveHoliday {
  if (!isIsoDay(date)) invalid("date", "Enter a valid holiday date.");
  return { date, name: requiredText(name, "name", "a holiday name", 60) };
}

export function changeLeaveHoliday(email: string, date: string, input: unknown, version: number, remove = false) {
  return activeAdminTransaction(email, async (tx) => {
    if (!isIsoDay(date)) invalid("date", "Enter a valid holiday date.");
    const holiday = remove ? null : validatedHoliday(date, inputRecord(input).name);
    const ref = holidayCollection().doc(date);
    const [row, settings] = await tx.getAll(ref, holidaySettings());
    const current = readHoliday(row);
    const currentVersion = holidayVersion(settings);
    if (holiday?.name === current?.name) return { holiday: current, holidayVersion: currentVersion };
    if (version !== currentVersion) throw new LeaveError(409, "The holiday list changed. Reload it before saving.");
    if (holiday) {
      if (current) throw new LeaveError(409, "There is already a holiday on this date.", [{ field: "date", message: "There is already a holiday on this date." }]);
      tx.create(ref, holiday);
    } else {
      tx.delete(ref);
    }
    tx.set(holidaySettings(), { version: currentVersion + 1 }, { merge: true });
    return { holiday, holidayVersion: currentVersion + 1 };
  });
}

export function setupLeaveProfiles(input: unknown, apply: boolean) {
  if (!Array.isArray(input) || !input.length) throw new LeaveError(400, "Supply a JSON array of people to set up.");
  const seen = new Set<string>();
  const entries = input.map((entry) => {
    const { email, joinDate, accrualStart, openingBalance, openingDate, openingCarried = 0 } = inputRecord(entry);
    const address = targetEmail(email);
    if (seen.has(address)) throw new LeaveError(400, `The setup file lists ${address} more than once.`);
    seen.add(address);
    return { email: address, details: detailsFrom({ joinDate, accrualStart, openingBalance, openingDate, openingCarried }, null) };
  });

  return adminDb.runTransaction(async (tx) => {
    const [directory, existing] = await Promise.all([
      tx.getAll(...entries.map(({ email }) => people().doc(email))),
      tx.getAll(...entries.map(({ email }) => profiles().doc(email))),
    ]);
    const changes = entries.map(({ email, details }, index) => {
      const person = readPerson(directory[index]);
      if (!person?.active) throw new LeaveError(404, `No active people record for ${email}.`);
      const before = readProfile(existing[index]);
      if (before && changedFields(before, { ...details, endDate: before.endDate }).length) {
        throw new LeaveError(409, `Leave is already set up for ${email}. Edit their current details in Leave.`);
      }
      const after = before ?? { ...details, email, name: person.name, updatedAt: Date.now() };
      return { before, after };
    });
    if (apply) for (const { before, after } of changes) {
      if (!before) writeProfile(tx, after, null, changedFields(null, after), setupActor);
    }
    return changes;
  }, apply ? undefined : { readOnly: true });
}

export function seedLeaveHolidays(input: unknown, apply: boolean) {
  const { source, holidays: rows } = inputRecord(input);
  if (typeof source !== "string" || !source.trim() || !Array.isArray(rows) || !rows.length) {
    throw new LeaveError(400, "The holiday seed must include a source and a list of holidays.");
  }
  const seeded = rows.map((row) => validatedHoliday(inputRecord(row).date, inputRecord(row).name));
  if (new Set(seeded.map(({ date }) => date)).size !== seeded.length) {
    throw new LeaveError(400, "The seed lists a holiday date more than once.");
  }

  return adminDb.runTransaction(async (tx) => {
    const [settings, ...docs] = await tx.getAll(holidaySettings(), ...seeded.map(({ date }) => holidayCollection().doc(date)));
    const alreadySeeded = settings.get("seedSource") === source;
    const changes = seeded.map((holiday, index) => {
      const before = readHoliday(docs[index]);
      return { date: holiday.date, before, after: alreadySeeded ? before : before ?? holiday };
    });
    if (apply && !alreadySeeded) {
      const additions = changes.flatMap(({ before, after }) => !before && after ? [after] : []);
      for (const holiday of additions) tx.create(holidayCollection().doc(holiday.date), holiday);
      tx.set(holidaySettings(), { version: holidayVersion(settings) + Number(additions.length > 0), seedSource: source }, { merge: true });
    }
    return changes;
  }, apply ? undefined : { readOnly: true });
}
