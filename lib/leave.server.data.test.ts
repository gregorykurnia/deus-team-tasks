import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { deleteApp as deleteClientApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate } from "firebase/firestore";
import { deleteApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/leave/me/route";
import { POST as askRoute } from "@/app/api/leave/requests/route";
import { POST as cancelRoute } from "@/app/api/leave/requests/[id]/cancel/route";
import { GET as teamRoute } from "@/app/api/leave/team/route";
import { GET as personRoute } from "@/app/api/leave/people/[email]/route";
import { POST as decideRoute } from "@/app/api/leave/requests/[id]/decide/route";
import { POST as adjustmentRoute } from "@/app/api/leave/adjustments/route";
import { PUT as detailsRoute } from "@/app/api/leave/profiles/[email]/route";
import { POST as addHolidayRoute, DELETE as removeHolidayRoute } from "@/app/api/leave/holidays/[date]/route";
import { clearProject } from "@/tests/support/emulator";
import { subscription } from "@/tests/support/push";
import { adminApp, adminAuth, adminDataApp, adminDb } from "./admin";
import { addDays } from "./dates";
import { isLeaveAdmin, leaveAdmins, leaveToday, type PersonLeave, type TeamLeave } from "./leave.server";
import type { LeaveProfile, LeaveRequest } from "./leave";
import holidaySeed from "./leaveHolidays.json";
import { savePushDevice } from "./push.server";
import * as transport from "./pushTransport.server";

const { afterResponse } = vi.hoisted(() => ({ afterResponse: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => { afterResponse.push(work); } }));

function deliverQueuedPushes() {
  return Promise.all(afterResponse.splice(0).map((work) => work()));
}

async function pushes() {
  return (await adminDb.collection("_fakePush").get()).docs.map((doc) => doc.data());
}

const AUDREY = "leave.audrey@deushcs.com";
const CALISTA = "leave.calista@deushcs.com";
const GREGORY = "leave.gregory@deushcs.com";
const TODAY = "2027-02-10";
const KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const KEY_TWO = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ANNUAL = { type: "annual", start: "2027-02-11", end: "2027-02-11" };
const NEW_PROFILE = { joinDate: "2026-01-01", accrualStart: "2026-01-01", openingDate: "2026-12-01", openingBalance: 6 };
const client = initializeApp({ projectId: "demo-deus", apiKey: "fake-emulator-key" }, "leave-auth");
const rulesClient = initializeApp({ projectId: "deus-team-tasks", apiKey: "fake-emulator-key" }, "leave-rules");
const clientAuth = getAuth(client), rulesAuth = getAuth(rulesClient), clientDb = getFirestore(rulesClient);
const requests = () => adminDb.collection("leaveRequests");
let audrey: string, calista: string, gregory: string;

async function tokenFor(email: string) {
  return (await signInWithCustomToken(clientAuth, await adminAuth.createCustomToken(email))).user.getIdToken();
}

function me(token?: string, search = "") {
  return GET(new Request(`http://localhost/api/leave/me${search}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
}

function ask(token?: string, input: unknown = ANNUAL, key?: string, signal?: AbortSignal) {
  return askRoute(new Request("http://localhost/api/leave/requests", {
    method: "POST", body: JSON.stringify(input), headers: {
      ...(token && { Authorization: `Bearer ${token}` }), ...(key && { "Idempotency-Key": key }),
    }, signal,
  }));
}

function cancel(token: string | undefined, id: string) {
  return cancelRoute(new Request("http://localhost/api/leave/requests/example/cancel", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), { params: Promise.resolve({ id }) });
}

async function withStatus(response: Response, status: number) {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return body;
}

function apiRequest(path: string, token: string | undefined, method = "GET", body?: unknown, headers?: Record<string, string>) {
  return new Request(`http://localhost/api/leave${path}`, {
    method, ...(body !== undefined && { body: JSON.stringify(body) }),
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...headers },
  });
}

function team(token?: string) {
  return teamRoute(apiRequest("/team", token));
}

function person(token: string | undefined, email: string) {
  return personRoute(apiRequest(`/people/${encodeURIComponent(email)}`, token), { params: Promise.resolve({ email }) });
}

function decide(token: string | undefined, id: string, input: unknown) {
  return decideRoute(apiRequest(`/requests/${id}/decide`, token, "POST", input), { params: Promise.resolve({ id }) });
}

function adjust(token: string | undefined, input: unknown, key = KEY) {
  return adjustmentRoute(apiRequest("/adjustments", token, "POST", input, { "Idempotency-Key": key }));
}

function details(token: string | undefined, email: string, input: unknown, version = 0) {
  return detailsRoute(apiRequest(`/profiles/${encodeURIComponent(email)}`, token, "PUT", input, { "If-Match": `"${version}"` }), { params: Promise.resolve({ email }) });
}

function holiday(token: string | undefined, date: string, name: string | null, version = 0) {
  const context = { params: Promise.resolve({ date }) };
  const path = `/holidays/${date}`;
  const headers = { "If-Match": `"${version}"` };
  return name === null
    ? removeHolidayRoute(apiRequest(path, token, "DELETE", undefined, headers), context)
    : addHolidayRoute(apiRequest(path, token, "POST", { name }, headers), context);
}

function readPersonLeave(email: string): Promise<PersonLeave> {
  return person(gregory, email).then((response) => withStatus(response, 200));
}

function readTeamLeave(): Promise<TeamLeave> {
  return team(gregory).then((response) => withStatus(response, 200));
}

async function seedRequest(id: string, email: string, fields: Partial<LeaveRequest> = {}) {
  await requests().doc(id).set({
    ...ANNUAL, email, name: "Team member", note: "", half: null, hours: null, event: null, reason: null,
    status: "approved", pay: "deduct", createdBy: email, createdAt: 1, decidedBy: GREGORY, decidedAt: 2,
    cancelledBy: null, cancelledAt: null, rejectReason: null, ...fields,
  });
}

function setHoliday(date: string) {
  return adminDb.doc(`leaveHolidays/${date}`).set({ date, name: `Holiday ${date}` });
}

beforeAll(async () => {
  if (adminApp.options.projectId !== "demo-deus" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180"
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") throw new Error("Leave tests require both local emulators.");
  setLogLevel("silent");
  connectFirestoreEmulator(clientDb, "127.0.0.1", 8180);
  connectAuthEmulator(clientAuth, "http://127.0.0.1:9199", { disableWarnings: true });
  connectAuthEmulator(rulesAuth, "http://127.0.0.1:9199", { disableWarnings: true });
  audrey = await tokenFor(AUDREY);
  calista = await tokenFor(CALISTA);
  gregory = await tokenFor(GREGORY);
});

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1");
  vi.stubEnv("NEXT_PUBLIC_LEAVE_ENABLED", "1");
  vi.stubEnv("LEAVE_ADMINS", ` , ${GREGORY.toUpperCase()} , ${GREGORY}, invalid, someone@else.test`);
  vi.stubEnv("LEAVE_TEST_DATE", TODAY);
  await clearProject("tasks");
  const batch = adminDb.batch();
  for (const [email, name] of [[AUDREY, "Audrey"], [CALISTA, "Calista"], [GREGORY, "Gregory"]]) {
    batch.set(adminDb.doc(`people/${email}`), { email, name, active: true });
    batch.set(adminDb.doc(`leaveProfiles/${email}`), {
      email, name, joinDate: "2026-02-01", accrualStart: "2027-02-01", openingDate: "2027-02-01",
      openingBalance: 5, openingCarried: 0, endDate: null, updatedAt: 1,
    });
  }
  await batch.commit();
});

afterEach(async () => {
  try { await deliverQueuedPushes(); }
  finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
});

afterAll(async () => {
  await terminate(clientDb);
  await Promise.all([deleteClientApp(client), deleteClientApp(rulesClient), deleteApp(adminApp), deleteApp(adminDataApp)]);
});

describe("leave privacy", () => {
  it("denies device reads, lists and writes for every leave collection even when signed in", async () => {
    const collections = ["leaveProfiles", "leaveRequests", "leaveAdjustments", "leaveHolidays", "leaveAudit"];
    for (const name of collections) await adminDb.doc(`${name}/private`).set({ note: "Private" });
    await signOut(rulesAuth);
    for (const signedIn of [false, true]) {
      if (signedIn) {
        await signInWithCustomToken(rulesAuth, await getAdminAuth(adminDataApp).createCustomToken(GREGORY));
        expect(rulesAuth.currentUser?.uid).toBe(GREGORY);
      }
      for (const name of collections) {
        const ref = doc(clientDb, name, "private");
        await expect(getDoc(ref)).rejects.toHaveProperty("code", "permission-denied");
        await expect(getDocs(collection(clientDb, name))).rejects.toHaveProperty("code", "permission-denied");
        await expect(setDoc(ref, { note: "Device write" })).rejects.toHaveProperty("code", "permission-denied");
        expect((await adminDb.doc(`${name}/private`).get()).data()).toEqual({ note: "Private" });
      }
    }
  });

  it.each(["NEXT_PUBLIC_LEAVE_ENABLED", "NEXT_PUBLIC_SIGN_IN_ENABLED"])("returns 404 on every route with %s off", async (flag) => {
    vi.stubEnv(flag, "0");
    for (const response of await Promise.all([me(gregory), ask(gregory), cancel(gregory, "private")])) {
      expect(await withStatus(response, 404)).toEqual({ error: "Not found" });
    }
    expect((await requests().get()).size).toBe(0);
  });

  it("requires a valid, unrevoked token on all three routes", async () => {
    const email = "leave.revoked@deushcs.com";
    await adminDb.doc(`people/${email}`).set({ email, name: "Revoked", active: true });
    const revoked = await tokenFor(email);
    // Revocation and auth-time comparison have second precision.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await adminAuth.revokeRefreshTokens(email);
    await expect(adminAuth.verifyIdToken(revoked, true)).rejects.toHaveProperty("code", "auth/id-token-revoked");
    for (const token of [undefined, "invalid-token", revoked]) {
      for (const response of await Promise.all([me(token), ask(token), cancel(token, "private")])) {
        expect(await withStatus(response, 401)).toEqual({ error: "Sign in again." });
      }
    }
  });

  it("requires an active person even for an email on the admin list", async () => {
    await adminDb.doc(`people/${GREGORY}`).update({ active: false });
    await expect(adminAuth.verifyIdToken(gregory, true)).resolves.toMatchObject({ uid: GREGORY });
    for (const response of await Promise.all([me(gregory), ask(gregory), cancel(gregory, "private")])) {
      await withStatus(response, 403);
    }
    await adminDb.doc(`people/${AUDREY}`).delete();
    await withStatus(await me(audrey), 403);
    expect((await requests().get()).size).toBe(0);
  });

  it("does not expose another person's request by query, guessed ID or a supplied email", async () => {
    await seedRequest("private", CALISTA, { note: "Calista's private note" });
    expect(await withStatus(await me(audrey, `?email=${encodeURIComponent(CALISTA)}`), 200)).toMatchObject({
      profile: { email: AUDREY }, requests: [], isAdmin: false, waitingForMe: 0,
    });
    const hidden = await withStatus(await cancel(audrey, "private"), 404);
    expect(hidden).toEqual(await withStatus(await cancel(audrey, "missing"), 404));
    expect(hidden).toEqual(await withStatus(await cancel(audrey, "other/path"), 404));
    await withStatus(await ask(audrey, { ...ANNUAL, email: CALISTA }), 403);
    expect((await requests().doc("private").get()).get("status")).toBe("approved");
    expect((await requests().get()).size).toBe(1);
  });
});

describe("reading leave", () => {
  it("recounts history from all holidays and adjustments and returns only the 400-day holiday window", async () => {
    const through = addDays(TODAY, 400);
    await Promise.all([
      seedRequest("history", AUDREY, { start: "2027-02-08", end: "2027-02-09" }),
      seedRequest("waiting", AUDREY, { status: "waiting", pay: null, half: "morning", start: "2027-02-12", end: "2027-02-12" }),
      seedRequest("other", CALISTA, { status: "waiting" }),
      adminDb.doc("leaveAdjustments/own").set({ email: AUDREY, date: "2027-02-04", days: 0.5, reason: "Correction" }),
      adminDb.doc("leaveAdjustments/other").set({ email: CALISTA, date: TODAY, days: -30, reason: "Private correction" }),
      ...["2027-02-08", TODAY, through, addDays(through, 1)].map(setHoliday),
    ]);
    const body = await withStatus(await me(audrey), 200);
    expect(body).toMatchObject({ today: TODAY, profile: { email: AUDREY }, summary: { balance: 4.5, waiting: 0.5, available: 4 }, waitingForMe: 0 });
    expect(body.requests.map(({ id, days }: { id: string; days: number }) => [id, days])).toEqual([["waiting", 0.5], ["history", 1]]);
    expect(body.holidays.map(({ date }: { date: string }) => date)).toEqual([TODAY, through]);
    expect(body.ledger.map(({ kind }: { kind: string }) => kind)).toEqual(["opening", "adjustment", "request"]);

    await setHoliday("2027-02-09");
    expect(await withStatus(await me(audrey), 200)).toMatchObject({
      summary: { balance: 5.5, waiting: 0.5, available: 5 }, requests: [{ id: "waiting", days: 0.5 }, { id: "history", days: 0 }],
    });
  });

  it("shows a not-set-up state and counts waiting requests for an admin without a profile", async () => {
    await adminDb.doc(`leaveProfiles/${GREGORY}`).delete();
    await seedRequest("waiting", AUDREY, { status: "waiting" });
    await seedRequest("approved", CALISTA);
    expect(leaveAdmins()).toEqual([GREGORY]);
    expect(isLeaveAdmin(` ${GREGORY.toUpperCase()} `)).toBe(true);
    expect(await withStatus(await me(gregory), 200)).toMatchObject({
      isAdmin: true, waitingForMe: 1, profile: null, summary: null, ledger: [], requests: [], setupContact: "Gregory",
    });
    await withStatus(await ask(gregory), 409);
  });

  it("returns only the badge count to active admins and does not share other people's history", async () => {
    await seedRequest("waiting", AUDREY, { status: "waiting", createdBy: GREGORY });
    await adminDb.doc("leaveAudit/alex").set({ email: AUDREY, by: GREGORY, at: 90, field: "accrualStart", from: "2027-02-01", to: "2027-03-01" });
    await adminDb.doc("leaveAudit/private").set({ email: CALISTA, by: GREGORY, at: 91, field: "openingBalance", from: 0, to: 1 });
    expect(await withStatus(await me(gregory, "?view=badge"), 200)).toEqual({ waitingForMe: 1 });
    expect(await withStatus(await me(audrey, "?view=badge"), 200)).toEqual({ waitingForMe: null });
    await withStatus(await me(undefined, "?view=badge"), 401);
    const mine = await withStatus(await me(audrey), 200);
    expect(mine.actorNames).toEqual({ [AUDREY]: "Audrey", [GREGORY]: "Gregory" });
    expect(mine.changes).toEqual([{ id: "alex", at: 90, field: "accrualStart", from: "2027-02-01", to: "2027-03-01", byName: "Gregory" }]);
    expect(mine).not.toHaveProperty("audit");
    await adminDb.doc(`people/${GREGORY}`).update({ active: false });
    await withStatus(await me(gregory, "?view=badge"), 403);
  });

  it("falls back to the Jakarta day when the emulator pin is invalid", () => {
    const beforeMidnight = new Date("2027-02-10T16:59:59Z");
    const midnight = new Date("2027-02-10T17:00:00Z");
    expect(leaveToday(midnight)).toBe(TODAY);
    vi.stubEnv("LEAVE_TEST_DATE", "2027-02-30");
    expect(leaveToday(beforeMidnight)).toBe(TODAY);
    expect(leaveToday(midnight)).toBe("2027-02-11");
  });
});

describe("asking and cancelling", () => {
  it("saves an employee request as waiting and reads the same request and reserved balance back", async () => {
    const { request } = await withStatus(await ask(audrey, {
      ...ANNUAL, half: "afternoon", note: "  doctor  ", isAdmin: true, status: "approved", pay: "paid", createdBy: GREGORY, name: "Someone else",
    }), 200);
    expect(request).toMatchObject({ email: AUDREY, name: "Audrey", createdBy: AUDREY, note: "doctor", status: "waiting", pay: null, decidedBy: null });
    expect(await withStatus(await me(audrey), 200)).toMatchObject({
      requests: [{ ...request, days: 0.5 }], summary: { balance: 5, waiting: 0.5, available: 4.5 },
    });
  });

  it("auto-approves the admin's own request and requires pay for Something else", async () => {
    const { request } = await withStatus(await ask(gregory, { ...ANNUAL, pay: "unpaid" }), 200);
    expect(request).toMatchObject({ email: GREGORY, status: "approved", pay: "deduct", decidedBy: GREGORY, decidedAt: request.createdAt });
    const other = { type: "other", reason: "else", start: "2027-02-12", end: "2027-02-12", note: "An appointment" };
    expect(await withStatus(await ask(gregory, other), 400)).toMatchObject({ error: "Choose how this absence is paid." });
    expect((await withStatus(await ask(gregory, { ...other, pay: "paid" }), 200)).request).toMatchObject({ status: "approved", pay: "paid" });
    expect((await requests().get()).size).toBe(2);
  });

  it("refuses missing dates, blank required notes, oversized notes, and a holiday without saving", async () => {
    await setHoliday(ANNUAL.start);
    const cases = [
      { body: null, field: "type" },
      { body: { ...ANNUAL, type: "other", reason: "else", note: "   " }, field: "note" },
      { body: { ...ANNUAL, note: "a".repeat(501) }, field: "note" },
      { body: { ...ANNUAL, start: "2027-02-30" }, field: "start" },
      { body: ANNUAL, field: "end" },
    ];
    for (const { body, field } of cases) {
      expect((await withStatus(await ask(audrey, body), 400)).issues).toContainEqual(expect.objectContaining({ field }));
    }
    expect((await requests().get()).size).toBe(0);
  });

  it("serializes two different asks sharing a day and allows that day for a different person", async () => {
    const answers = await Promise.all([ask(audrey), ask(audrey, { ...ANNUAL, end: "2027-02-12" })]);
    expect(answers.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect((await withStatus(answers.find(({ status }) => status === 400)!, 400)).error).toMatch(/already have leave/);
    expect((await requests().where("email", "==", AUDREY).get()).size).toBe(1);
    await withStatus(await ask(calista), 200);
  });

  it("retries a failed transaction without writing twice or publishing success before commit", async () => {
    const run = adminDb.runTransaction.bind(adminDb);
    vi.spyOn(adminDb, "runTransaction").mockImplementationOnce((work) => run(async (tx) => {
      await work(tx);
      throw new Error("Connection lost before commit");
    }));
    await withStatus(await ask(audrey, ANNUAL, KEY), 503);
    expect((await requests().get()).size).toBe(0);
    expect(afterResponse).toHaveLength(0);
    await withStatus(await ask(audrey, ANNUAL, KEY), 200);
    expect((await requests().get()).size).toBe(1);
  });

  it("keeps the latest status when an ask lands but its response is lost and the key is retried", async () => {
    const run = adminDb.runTransaction.bind(adminDb);
    vi.spyOn(adminDb, "runTransaction").mockImplementationOnce(async (work) => {
      await run(work);
      throw new Error("Response lost after commit");
    });
    await withStatus(await ask(audrey, ANNUAL, KEY), 503);
    expect(afterResponse).toHaveLength(0);
    const { requests: [saved] } = await withStatus(await me(audrey), 200);
    await withStatus(await cancel(audrey, saved.id), 200);
    const cancelled = (await requests().doc(saved.id).get()).data();
    await withStatus(await ask(audrey, ANNUAL, KEY.toUpperCase()), 409);
    await withStatus(await ask(audrey, { ...ANNUAL, end: "2027-02-12" }, KEY), 409);
    expect((await requests().get()).docs.map((row) => row.data())).toEqual([cancelled]);
    await withStatus(await ask(audrey), 200);
  });

  it("cancels waiting leave once even with simultaneous taps and releases the balance reservation", async () => {
    const { request } = await withStatus(await ask(audrey), 200);
    const answers = await Promise.all([cancel(audrey, request.id), cancel(audrey, request.id)]);
    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const { request: cancelled } = await withStatus(answers.find(({ status }) => status === 200)!, 200);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: AUDREY, cancelledAt: expect.any(Number) });
    await withStatus(await cancel(audrey, request.id), 409);
    expect(await withStatus(await me(audrey), 200)).toMatchObject({ requests: [cancelled], summary: { waiting: 0, available: 5 } });
  });

  it("lets the person cancel an approved future request and only the admin cancel one already started", async () => {
    await seedRequest("future", AUDREY);
    await seedRequest("started", AUDREY, { start: TODAY, end: TODAY });
    expect((await withStatus(await cancel(audrey, "future"), 200)).request).toMatchObject({ status: "cancelled", cancelledBy: AUDREY });
    await withStatus(await cancel(audrey, "started"), 409);
    expect((await requests().doc("started").get()).get("status")).toBe("approved");
    vi.stubEnv("LEAVE_TEST_DATE", "2027-02-12");
    await withStatus(await cancel(audrey, "started"), 409);
    expect((await withStatus(await cancel(gregory, "started"), 200)).request).toMatchObject({
      status: "cancelled", cancelledBy: GREGORY, decidedBy: GREGORY, decidedAt: 2, pay: "deduct",
    });
  });
});

describe("admin leave routes", () => {
  it("gates every admin route and lets an active admin without a leave profile use them", async () => {
    await adminDb.doc(`leaveProfiles/${GREGORY}`).delete();
    await seedRequest("waiting", AUDREY, { status: "waiting", pay: null, decidedBy: null, decidedAt: null });
    const actions = [
      team,
      (token?: string) => person(token, AUDREY),
      (token?: string) => decide(token, "waiting", { decision: "approve" }),
      (token?: string) => ask(token, { ...ANNUAL, email: CALISTA }, KEY),
      (token?: string) => adjust(token, { email: AUDREY, days: 1, reason: "Correction" }),
      (token?: string) => details(token, AUDREY, { openingBalance: 6 }, 1),
      (token?: string) => holiday(token, "2027-02-15", "Office holiday"),
      (token?: string) => holiday(token, "2027-02-15", null, 1),
    ];
    vi.stubEnv("NEXT_PUBLIC_LEAVE_ENABLED", "0");
    for (const action of actions) await withStatus(await action(gregory), 404);
    vi.stubEnv("NEXT_PUBLIC_LEAVE_ENABLED", "1");
    for (const action of actions) {
      await withStatus(await action(), 401);
      await withStatus(await action(audrey), 403);
    }
    await adminDb.doc(`people/${GREGORY}`).update({ active: false });
    for (const action of actions) await withStatus(await action(gregory), 403);
    await adminDb.doc(`people/${GREGORY}`).update({ active: true });

    for (const action of actions) await withStatus(await action(gregory), 200);
    expect(await readTeamLeave()).toMatchObject({
      waiting: [], holidays: [], people: expect.arrayContaining([{ email: GREGORY, name: "Gregory", active: true,
        endDate: null, summary: null, counts: { annual: 0, sick: 0, other: 0 } }]),
    });
    expect(await readPersonLeave(GREGORY)).toMatchObject({ profile: null, summary: null, requests: [] });
    expect(await readPersonLeave(AUDREY)).toMatchObject({ summary: { balance: 7, upcoming: 1, available: 6 } });
    await withStatus(await person(gregory, "missing@deushcs.com"), 404);
    await withStatus(await person(gregory, "x".repeat(129) + "@deushcs.com"), 400);
    expect((await readPersonLeave(CALISTA)).requests).toMatchObject([{ email: CALISTA, createdBy: GREGORY, status: "approved" }]);
  });

  it("reproduces all three worked balances through the profile, request, decision and adjustment routes", async () => {
    vi.stubEnv("LEAVE_TEST_DATE", "2026-12-01");
    await Promise.all([CALISTA, AUDREY, GREGORY].map((email) => adminDb.doc(`leaveProfiles/${email}`).delete()));
    for (const [email, profile] of [
      [CALISTA, { ...NEW_PROFILE, accrualStart: "2027-02-01", openingBalance: 0 }],
      [AUDREY, NEW_PROFILE],
      [GREGORY, { ...NEW_PROFILE, joinDate: "2020-01-01", accrualStart: "2020-01-01", openingBalance: 10 }],
    ] as const) await withStatus(await details(gregory, email, profile), 200);
    for (const [version, entry] of holidaySeed.holidays.slice(0, 3).entries()) {
      await withStatus(await holiday(gregory, entry.date, entry.name, version), 200);
    }

    const { request } = await withStatus(await ask(calista, { ...ANNUAL, start: "2027-01-12", end: "2027-01-14" }), 200);
    await withStatus(await decide(gregory, request.id, { decision: "approve" }), 200);
    for (const [index, input] of [
      { start: "2026-12-24", end: "2026-12-24" },
      { start: "2027-01-04", end: "2027-01-06" },
      { start: "2027-02-05", end: "2027-02-05", half: "morning" },
    ].entries()) {
      await withStatus(await ask(gregory, { ...ANNUAL, ...input, email: AUDREY }, `${index}${KEY.slice(1)}`), 200);
    }
    await withStatus(await ask(gregory, { ...ANNUAL, start: "2027-02-25", end: "2027-03-02" }), 200);
    await withStatus(await adjust(gregory, { email: GREGORY, days: -5, reason: "Correction", date: "2027-01-20" }), 200);

    for (const [date, expected] of [
      ["2026-12-31", [[AUDREY, 5]]],
      ["2027-01-06", [[AUDREY, 4]]],
      ["2027-01-31", [[CALISTA, -3]]],
      ["2027-02-01", [[CALISTA, -2]]],
      ["2027-02-10", [[AUDREY, 4.5]]],
      ["2027-02-28", [[AUDREY, 4.5], [GREGORY, 5]]],
      ["2027-03-01", [[CALISTA, -1], [AUDREY, 3], [GREGORY, 1]]],
    ] as const) {
      vi.stubEnv("LEAVE_TEST_DATE", date);
      for (const [email, balance] of expected) {
        const result = await readPersonLeave(email);
        expect(result.summary?.balance, `${email} on ${date}`).toBe(balance);
        if (date === "2027-02-10") expect(result.summary?.lapseWarning).toBe(2.5);
        if (date === "2027-03-01") {
          const expectedLapses = email === AUDREY ? [-2.5] : email === GREGORY ? [-3] : [];
          expect(result.ledger.filter(({ kind }) => kind === "lapse").map(({ days }) => days)).toEqual(expectedLapses);
          if (email === GREGORY) expect(result.ledger.filter(({ kind }) => kind === "request")).toMatchObject([
            { date: "2027-02-25", days: -2 }, { date: "2027-03-01", days: -2 },
          ]);
          if (email === AUDREY) {
            expect(result.requests.map(({ days }) => days)).toEqual([0.5, 2, 1]);
            expect(await withStatus(await me(audrey), 200)).toMatchObject({ summary: result.summary, ledger: result.ledger, requests: result.requests });
          }
        }
      }
    }
    expect((await readTeamLeave()).people.find(({ email }) => email === AUDREY)?.counts).toEqual({ annual: 2.5, sick: 0, other: 0 });
  }, 15_000);

  it("requires a reason to reject and a pay choice for Something else, and applies only one decision", async () => {
    const other = { ...ANNUAL, type: "other", reason: "else", note: "Personal appointment" };
    const { request } = await withStatus(await ask(audrey, other), 200);
    const { request: toReject } = await withStatus(await ask(calista), 200);
    for (const reason of [undefined, "   ", "r".repeat(301)]) {
      expect(await withStatus(await decide(gregory, toReject.id, { decision: "reject", reason }), 400))
        .toMatchObject({ issues: [{ field: "reason" }] });
    }
    expect(await withStatus(await decide(gregory, request.id, { decision: "approve" }), 400)).toMatchObject({ issues: [{ field: "pay" }] });
    expect((await readTeamLeave()).waiting).toHaveLength(2);
    const answers = await Promise.all([
      decide(gregory, request.id, { decision: "approve", pay: "deduct" }),
      decide(gregory, request.id, { decision: "approve", pay: "deduct" }),
    ]);
    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await readPersonLeave(AUDREY)).toMatchObject({
      summary: { upcoming: 1, waiting: 0, available: 4 }, requests: [{ status: "approved", pay: "deduct", decidedBy: GREGORY }],
    });
    const reason = "r".repeat(300);
    expect(await withStatus(await decide(gregory, toReject.id, { decision: "reject", reason }), 200))
      .toMatchObject({ request: { status: "rejected", pay: null, rejectReason: reason } });
    expect(await withStatus(await me(calista), 200)).toMatchObject({ summary: { balance: 5, available: 5 }, requests: [{ rejectReason: reason }] });
    await withStatus(await cancel(gregory, request.id), 200);
    await withStatus(await decide(gregory, request.id, { decision: "approve", pay: "deduct" }), 409);
    expect((await readPersonLeave(AUDREY)).requests[0].status).toBe("cancelled");
  });

  it("adds for the normalized target and keeps a late retry from recreating leave after cancellation", async () => {
    const input = { ...ANNUAL, email: ` ${CALISTA.toUpperCase()} `, name: "Forged name" };
    await withStatus(await ask(audrey, input, "invalid key"), 403);
    await withStatus(await ask(gregory, input), 400);
    const { request } = await withStatus(await ask(gregory, input, KEY), 200);
    expect(request).toMatchObject({ email: CALISTA, name: "Calista", createdBy: GREGORY, status: "approved", pay: "deduct" });
    await withStatus(await ask(calista), 400);
    await withStatus(await cancel(gregory, request.id), 200);
    await withStatus(await ask(gregory, input, KEY.toUpperCase()), 409);
    await withStatus(await ask(gregory, input, KEY_TWO), 200);
    expect((await readPersonLeave(CALISTA)).requests.map(({ status }) => status).sort()).toEqual(["approved", "cancelled"]);
    expect((await readPersonLeave(GREGORY)).requests).toEqual([]);
  });

  it("validates adjustments and applies each key once across a failed transaction, a lost reply and concurrent submits", async () => {
    const input = { email: AUDREY, days: 1.5, reason: "  Correction  " };
    for (const [fields, field] of [
      [{ days: 0 }, "days"], [{ days: 0.3 }, "days"], [{ days: -30.5 }, "days"], [{ days: 1e30 }, "days"],
      [{ reason: "  " }, "reason"], [{ reason: "r".repeat(301) }, "reason"], [{ date: "2027-02-29" }, "date"],
    ] as const) {
      expect(await withStatus(await adjust(gregory, { ...input, ...fields }), 400)).toMatchObject({ issues: [{ field }] });
    }
    const run = adminDb.runTransaction.bind(adminDb);
    vi.spyOn(adminDb, "runTransaction").mockImplementationOnce((work) => run(async (tx) => {
      await work(tx);
      throw new Error("Connection lost before commit");
    }));
    await withStatus(await adjust(gregory, input), 503);
    expect((await readPersonLeave(AUDREY)).summary?.balance).toBe(5);
    vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (work) => {
      await run(work);
      throw new Error("Response lost after commit");
    });
    await withStatus(await adjust(gregory, input), 503);
    vi.stubEnv("LEAVE_TEST_DATE", "2027-02-11");
    await withStatus(await adjust(gregory, input, KEY.toUpperCase()), 409);
    const answers = await Promise.all([adjust(gregory, input, KEY_TWO), adjust(gregory, input, KEY_TWO)]);
    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const result = await readPersonLeave(AUDREY);
    expect(result.summary?.balance).toBe(8);
    expect(result.ledger.filter(({ kind }) => kind === "adjustment")).toMatchObject([
      { date: TODAY, days: 1.5, label: "Correction" }, { date: "2027-02-11", days: 1.5, label: "Correction" },
    ]);
    expect((await adminDb.collection("leaveAdjustments").get()).size).toBe(2);
  });
});

describe("post-commit leave pushes", () => {
  beforeEach(async () => {
    await Promise.all([AUDREY, CALISTA, GREGORY].map((email) => savePushDevice(email, subscription(email))));
  });

  it("sends once per active admin for a request and sends nothing for its owner's waiting cancellation", async () => {
    const inactive = "leave.inactive@deushcs.com";
    const record = adminDb.doc(`people/${inactive}`);
    await record.set({ email: inactive, name: "Inactive admin", active: true });
    await savePushDevice(inactive, subscription("inactive"));
    await record.update({ active: false });
    vi.stubEnv("LEAVE_ADMINS", ` , ${GREGORY.toUpperCase()}, ${GREGORY}, ${CALISTA}, ${inactive}, invalid`);
    await setHoliday("2027-02-12");
    const input = { ...ANNUAL, end: "2027-02-12" };

    vi.stubEnv("NEXT_PUBLIC_LEAVE_ENABLED", "0");
    await withStatus(await ask(audrey, input, KEY), 404);
    expect(afterResponse).toHaveLength(0);
    vi.stubEnv("NEXT_PUBLIC_LEAVE_ENABLED", "1");
    const replies = await Promise.all([ask(audrey, input, KEY), ask(audrey, input, KEY)]);
    expect(replies.map(({ status }) => status).sort()).toEqual([200, 409]);
    const { request } = await withStatus(replies.find(({ status }) => status === 200)!, 200);
    expect(await pushes()).toEqual([]);
    expect(afterResponse).toHaveLength(1);
    expect((await requests().doc(request.id).get()).get("status")).toBe("waiting");
    await deliverQueuedPushes();
    const expected = [CALISTA, GREGORY].map((email) => ({
      email, title: "Leave request", body: "Audrey: Annual leave, Thu 11 – Fri 12 Feb (1 day)",
      url: `/leave?view=team&request=${request.id}`,
    }));
    expect((await pushes()).sort((a, b) => a.email.localeCompare(b.email))).toEqual(expected);

    await withStatus(await cancel(audrey, request.id), 200);
    await withStatus(await ask(audrey, input, KEY.toUpperCase()), 409);
    expect(afterResponse).toHaveLength(0);
    expect((await requests().doc(request.id).get()).get("status")).toBe("cancelled");
  }, 15_000);

  it("sends each decision only to the requester even when two admins decide concurrently", async () => {
    vi.stubEnv("LEAVE_ADMINS", `${GREGORY}, ${CALISTA}`);
    await Promise.all([
      seedRequest("approve", AUDREY, { status: "waiting", pay: null }),
      seedRequest("reject", CALISTA, { type: "sick", status: "waiting", pay: null }),
      seedRequest("self", GREGORY, { status: "waiting", pay: null }),
    ]);
    const approve = { decision: "approve" };
    const replies = await Promise.all([decide(gregory, "approve", approve), decide(calista, "approve", approve)]);
    expect(replies.map(({ status }) => status).sort()).toEqual([200, 409]);
    await withStatus(await decide(gregory, "reject", { decision: "reject", reason: " Pick another day\nfor coverage. " }), 200);
    await withStatus(await decide(gregory, "self", approve), 200);
    await deliverQueuedPushes();
    expect((await pushes()).sort((a, b) => a.email.localeCompare(b.email))).toEqual([
      { email: AUDREY, title: "Annual leave approved", body: "Thu 11 Feb", url: "/leave?request=approve" },
      { email: CALISTA, title: "Sick not approved", body: "Thu 11 Feb\nPick another day for coverage.", url: "/leave?request=reject" },
    ]);
    expect((await requests().doc("approve").get()).get("status")).toBe("approved");
    expect((await requests().doc("reject").get()).get("rejectReason")).toBe("Pick another day\nfor coverage.");
  }, 15_000);

  it("tells admins about an owner's approved cancellation and tells the person about an admin's cancellation", async () => {
    vi.stubEnv("LEAVE_ADMINS", `${GREGORY}, ${CALISTA}`);
    await Promise.all([
      seedRequest("owner", AUDREY),
      seedRequest("admin-own", GREGORY),
      seedRequest("admin-waiting", AUDREY, { status: "waiting" }),
      seedRequest("admin-approved", CALISTA),
      seedRequest("admin-rejected", AUDREY, { status: "rejected" }),
    ]);
    for (const [token, id] of [
      [audrey, "owner"], [gregory, "admin-own"], [gregory, "admin-waiting"], [gregory, "admin-approved"], [gregory, "admin-rejected"],
    ]) await withStatus(await cancel(token, id), 200);
    await withStatus(await cancel(audrey, "owner"), 409);
    await deliverQueuedPushes();
    const sent = await pushes();
    expect(sent).toHaveLength(5);
    expect(sent).toEqual(expect.arrayContaining([
      ...[CALISTA, GREGORY].map((email) => ({
        email, title: "Audrey cancelled leave", body: "Annual leave, Thu 11 Feb",
        url: `/leave?view=team&person=${encodeURIComponent(AUDREY)}`,
      })),
      { email: CALISTA, title: "Gregory cancelled leave", body: "Annual leave, Thu 11 Feb", url: `/leave?view=team&person=${encodeURIComponent(GREGORY)}` },
      { email: AUDREY, title: "Gregory cancelled your leave", body: "Annual leave, Thu 11 Feb", url: "/leave?request=admin-waiting" },
      { email: CALISTA, title: "Gregory cancelled your leave", body: "Annual leave, Thu 11 Feb", url: "/leave?request=admin-approved" },
    ]));
  }, 15_000);

  it("tells the target once for added leave and a balance adjustment, excluding admin self-service", async () => {
    const input = { ...ANNUAL, email: ` ${CALISTA.toUpperCase()} ` };
    const { request } = await withStatus(await ask(gregory, input, KEY), 200);
    await withStatus(await ask(gregory, input, KEY.toUpperCase()), 409);
    await withStatus(await ask(gregory), 200);
    const adjustment = { days: 1.5, reason: "Opening balance correction" };
    await withStatus(await adjust(gregory, { ...adjustment, email: CALISTA }), 200);
    await withStatus(await adjust(gregory, { ...adjustment, email: CALISTA }, KEY.toUpperCase()), 409);
    await withStatus(await adjust(gregory, { ...adjustment, email: GREGORY }, KEY_TWO), 200);
    await deliverQueuedPushes();
    expect((await pushes()).sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { email: CALISTA, title: "Gregory added leave for you", body: "Annual leave, Thu 11 Feb", url: `/leave?request=${request.id}` },
      { email: CALISTA, title: "Your leave balance changed", body: "+1.5 days: Opening balance correction", url: "/leave?view=history" },
    ]);
  }, 15_000);

  it("logs a lost provider reply, delivers to the other admin and never repeats the committed push", async () => {
    vi.stubEnv("LEAVE_ADMINS", `${GREGORY}, ${CALISTA}`);
    const deliver = transport.deliverPush;
    const provider = vi.spyOn(transport, "deliverPush").mockImplementation(async (...args) => {
      await deliver(...args);
      if (args[0] === GREGORY) throw new Error("Reply lost after delivery");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { request } = await withStatus(await ask(audrey, ANNUAL, KEY), 200);
    await deliverQueuedPushes();
    expect(log).toHaveBeenCalledWith("Push delivery failed.", "unavailable");
    expect((await pushes()).map(({ email }) => email).sort()).toEqual([CALISTA, GREGORY]);
    await withStatus(await ask(audrey, ANNUAL, KEY), 409);
    await deliverQueuedPushes();
    expect(provider).toHaveBeenCalledTimes(2);
    expect((await requests().doc(request.id).get()).get("status")).toBe("waiting");
  });

  it("confirms the save before a slow push and keeps a later cancellation when the caller closes", async () => {
    const deliver = transport.deliverPush;
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      await deliver(...args);
    });
    const controller = new AbortController();
    const { request } = await withStatus(await ask(audrey, ANNUAL, KEY, controller.signal), 200);
    controller.abort();
    const delivery = deliverQueuedPushes();
    try {
      await started.promise;
      expect(await pushes()).toEqual([]);
      await withStatus(await cancel(audrey, request.id), 200);
    } finally {
      release.resolve();
      await delivery;
    }
    expect(await pushes()).toEqual([{
      email: GREGORY, title: "Leave request", body: "Audrey: Annual leave, Thu 11 Feb (1 day)",
      url: `/leave?view=team&request=${request.id}`,
    }]);
    expect((await readPersonLeave(AUDREY)).requests).toMatchObject([{ id: request.id, status: "cancelled" }]);
  });
});

describe("leave details and holidays", () => {
  it("validates details and saves exactly one audit row per field, atomically and without overwriting newer edits", async () => {
    for (const [fields, field] of [
      [{}, "joinDate"], [{ joinDate: "" }, "joinDate"], [{ accrualStart: "2027-01-02" }, "accrualStart"],
      [{ openingDate: "2026-01-31" }, "openingDate"], [{ endDate: "2026-01-31" }, "endDate"],
      [{ openingBalance: 1e30 }, "openingBalance"], [{ openingCarried: 6 }, "openingCarried"],
    ] as const) {
      expect(await withStatus(await details(gregory, AUDREY, fields, 1), 400)).toMatchObject({ issues: [{ field }] });
    }
    const change = { openingBalance: 6.5, accrualStart: "2027-03-01" };
    const run = adminDb.runTransaction.bind(adminDb);
    vi.spyOn(adminDb, "runTransaction").mockImplementationOnce((work) => run(async (tx) => {
      await work(tx);
      throw new Error("Connection lost before the audit and details commit");
    }));
    await withStatus(await details(gregory, AUDREY, change, 1), 503);
    expect(await readPersonLeave(AUDREY)).toMatchObject({ profile: { updatedAt: 1, openingBalance: 5 }, audit: [] });

    const { profile }: { profile: LeaveProfile } = await withStatus(await details(gregory, AUDREY.toUpperCase(), change, 1), 200);
    expect(profile).toMatchObject({ ...change, name: "Audrey", email: AUDREY });
    expect(await readPersonLeave(AUDREY)).toMatchObject({
      profile, summary: { balance: 6.5 }, audit: [
        { field: "accrualStart", from: "2027-02-01", to: "2027-03-01", by: GREGORY, byName: "Gregory", at: profile.updatedAt },
        { field: "openingBalance", from: 5, to: 6.5, by: GREGORY, byName: "Gregory", at: profile.updatedAt },
      ],
    });
    expect(await withStatus(await details(gregory, AUDREY, change, 1), 200)).toEqual({ profile });
    const [a, b] = await Promise.all([
      details(gregory, AUDREY, { openingBalance: 7 }, profile.updatedAt),
      details(gregory, AUDREY, { openingBalance: 8 }, profile.updatedAt),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const { profile: current } = await withStatus(a.ok ? a : b, 200);
    await withStatus(await details(gregory, AUDREY, change, 1), 409);
    expect(await readPersonLeave(AUDREY)).toMatchObject({ profile: current, audit: expect.arrayContaining([{ field: "openingBalance", from: 6.5, to: current.openingBalance, id: expect.any(String), by: GREGORY, byName: "Gregory", at: current.updatedAt, email: AUDREY }]) });
    expect((await adminDb.collection("leaveAudit").get()).size).toBe(3);
    const mine = await withStatus(await me(audrey), 200);
    expect(mine.summary.balance).toBe(current.openingBalance);
    expect(mine).not.toHaveProperty("audit");
  });

  it("reports one or two requests past the last day and allows saving after they are cancelled", async () => {
    await seedRequest("approved", AUDREY);
    const end = { endDate: TODAY };
    const blocked = (count: string) => ({ issues: [{ field: "endDate", message: `Cancel Audrey's ${count} after Wed 10 Feb first.` }] });
    expect(await withStatus(await details(gregory, AUDREY, end, 1), 409)).toMatchObject(blocked("request"));
    const { request } = await withStatus(await ask(audrey, { ...ANNUAL, start: "2027-02-12", end: "2027-02-12" }), 200);
    expect(await withStatus(await details(gregory, AUDREY, end, 1), 409)).toMatchObject(blocked("2 requests"));
    expect((await readPersonLeave(AUDREY)).audit).toEqual([]);
    await withStatus(await cancel(gregory, "approved"), 200);
    await withStatus(await cancel(gregory, request.id), 200);
    expect(await withStatus(await details(gregory, AUDREY, end, 1), 200)).toMatchObject({ profile: end });
    expect(await withStatus(await ask(gregory, { ...ANNUAL, email: AUDREY }, KEY), 400)).toMatchObject({ issues: [{ field: "end" }] });
  });

  it("keeps a concurrent last-day change and add from leaving approved dates past the last day", async () => {
    const [save, askFor] = await Promise.all([
      details(gregory, AUDREY, { endDate: TODAY }, 1),
      ask(gregory, { ...ANNUAL, email: AUDREY }, KEY),
    ]);
    expect(Number(save.ok) + Number(askFor.ok)).toBe(1);
    await withStatus(save, save.ok ? 200 : 409);
    await withStatus(askFor, askFor.ok ? 200 : 400);
    const { profile, requests, audit } = await readPersonLeave(AUDREY);
    expect(profile?.endDate).toBe(save.ok ? TODAY : null);
    expect(requests).toHaveLength(save.ok ? 0 : 1);
    expect(audit).toHaveLength(save.ok ? 1 : 0);
  });

  it("clips Team totals to this year through today, shows who is also away and puts people who left last", async () => {
    await setHoliday("2027-01-01");
    await seedRequest("year", AUDREY, { start: "2026-12-31", end: "2027-01-04" });
    await seedRequest("sick", AUDREY, { name: "Audrey", type: "sick", pay: "paid", start: "2027-02-09", end: "2027-02-12" });
    await seedRequest("other", AUDREY, { type: "other", reason: "law", pay: "paid", start: "2027-01-20", end: "2027-01-22" });
    await seedRequest("future", AUDREY, { type: "other", reason: "else", pay: "paid", start: "2027-02-18", end: "2027-02-18" });
    const { request } = await withStatus(await ask(calista), 200);
    await withStatus(await details(gregory, GREGORY, { endDate: "2027-02-09" }, 1), 200);
    await adminDb.doc(`people/${GREGORY}`).update({ active: false, name: "Aaron" });
    vi.stubEnv("LEAVE_ADMINS", AUDREY);
    const { people, waiting }: TeamLeave = await withStatus(await team(audrey), 200);
    expect(people.map(({ name }) => name)).toEqual(["Audrey", "Calista", "Aaron"]);
    expect(people[0].counts).toEqual({ annual: 1, sick: 2, other: 1 });
    expect(people[2]).toMatchObject({ active: false, endDate: "2027-02-09", summary: { nextPlusOne: null } });
    expect(waiting).toMatchObject([{ id: request.id, days: 1, availableAfter: 4, alsoAway: [{ name: "Audrey", dates: [ANNUAL.start] }] }]);
    expect(await withStatus(await person(audrey, GREGORY), 200)).toMatchObject({ person: { active: false }, profile: { endDate: "2027-02-09" } });
  });

  it("recounts requests, balances, Team totals and the next-year notice when holidays change", async () => {
    vi.stubEnv("LEAVE_TEST_DATE", "2027-09-30");
    await seedRequest("taken", AUDREY);
    expect((await readTeamLeave()).nextMissingHolidayYear).toBeNull();
    vi.stubEnv("LEAVE_TEST_DATE", "2027-10-01");
    const before = await readPersonLeave(AUDREY);
    expect(before.requests[0].days).toBe(1);
    expect(await readTeamLeave()).toMatchObject({ nextMissingHolidayYear: "2028", holidayVersion: 0, people: [{ counts: { annual: 1 } }, {}, {}] });
    for (const [date, name, field] of [["2028-02-30", "Holiday", "date"], [ANNUAL.start, " ", "name"], [ANNUAL.start, "a".repeat(61), "name"]]) {
      expect(await withStatus(await holiday(gregory, date, name), 400)).toMatchObject({ issues: [{ field }] });
    }
    await withStatus(await holiday(gregory, "2028-01-01", "New Year"), 200);
    expect((await readTeamLeave()).nextMissingHolidayYear).toBeNull();
    await withStatus(await holiday(gregory, ANNUAL.start, "  Office holiday  ", 1), 200);
    const after = await readPersonLeave(AUDREY);
    expect(after).toMatchObject({ summary: { balance: before.summary!.balance + 1 }, requests: [{ id: "taken", days: 0, status: "approved" }] });
    expect(after.holidays).toContainEqual({ date: ANNUAL.start, name: "Office holiday" });
    expect(await withStatus(await me(audrey), 200)).toMatchObject({ summary: after.summary, requests: after.requests });
    expect((await readTeamLeave()).people[0].counts.annual).toBe(0);
    await withStatus(await holiday(gregory, ANNUAL.start, null, 2), 200);
    expect(await readPersonLeave(AUDREY)).toMatchObject({ summary: before.summary, requests: before.requests });
    await withStatus(await holiday(gregory, "2028-01-01", null, 3), 200);
    expect(await readTeamLeave()).toMatchObject({ nextMissingHolidayYear: "2028", holidayVersion: 4, holidays: [] });
  });

  it("prevents a lost holiday reply or stale concurrent edit from restoring or deleting a newer holiday", async () => {
    const date = "2027-02-15";
    const run = adminDb.runTransaction.bind(adminDb);
    vi.spyOn(adminDb, "runTransaction").mockImplementationOnce(async (work) => {
      await run(work);
      throw new Error("Response lost after commit");
    });
    await withStatus(await holiday(gregory, date, "First"), 503);
    expect(await readTeamLeave()).toMatchObject({ holidays: [{ date, name: "First" }], holidayVersion: 1 });
    await withStatus(await holiday(gregory, date, null, 1), 200);
    await withStatus(await holiday(gregory, date, "First", 0), 409);
    expect((await readTeamLeave()).holidays).toEqual([]);

    const results = await Promise.all([holiday(gregory, date, "New", 2), holiday(gregory, date, "Replacement", 2)]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const saved = await withStatus(results.find(({ ok }) => ok)!, 200);
    await withStatus(await holiday(gregory, date, null, 1), 409);
    await withStatus(await holiday(gregory, date, saved.holiday.name.toUpperCase(), 3), 409);
    expect(await readTeamLeave()).toMatchObject({ holidays: [saved.holiday], holidayVersion: 3 });
  });
});

describe("leave setup command", () => {
  const run = (...args: string[]) => promisify(execFile)(process.execPath, ["scripts/leave-setup.mjs", ...args], {
    timeout: 15_000, env: { ...process.env, FIREBASE_ADMIN_KEY: "" },
  });

  it("previews profiles without writes, refuses unusable people and applies each new profile once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leave-setup-test-"));
    try {
      const file = join(dir, "leave-setup.json");
      const input = { ...NEW_PROFILE, email: ` ${AUDREY.toUpperCase()} `, openingBalance: 6.5 };
      const profile = adminDb.doc(`leaveProfiles/${AUDREY}`);
      const audit = adminDb.collection("leaveAudit");
      await profile.delete();
      await writeFile(file, JSON.stringify([input]));
      expect((await run(file)).stdout).toMatch(/— → 6\.5[\s\S]+DRY RUN\. Nothing written/);
      expect((await profile.get()).exists).toBe(false);
      expect((await audit.get()).size).toBe(0);

      await writeFile(file, JSON.stringify([input, { ...input, email: "missing@deushcs.com" }]));
      await expect(run(file, "--apply")).rejects.toMatchObject({ stderr: expect.stringContaining("No active people record for missing@deushcs.com.") });
      expect((await profile.get()).exists).toBe(false);
      await writeFile(file, JSON.stringify([input, { ...input, email: AUDREY }]));
      await expect(run(file, "--apply")).rejects.toMatchObject({ stderr: expect.stringContaining("more than once") });
      expect((await audit.get()).size).toBe(0);

      await writeFile(file, JSON.stringify([input]));
      expect((await run(file, "--apply")).stdout).toContain("Apply confirmed.");
      const applied = (await readPersonLeave(AUDREY)).profile!;
      expect(applied).toMatchObject({ email: AUDREY, name: "Audrey", openingBalance: 6.5, openingCarried: 0, endDate: null });
      expect((await run(file, "--apply")).stdout).toContain("6.5 → 6.5");
      expect((await audit.get()).size).toBe(5);
      await withStatus(await details(gregory, AUDREY, { openingBalance: 7 }, applied.updatedAt), 200);
      await expect(run(file, "--apply")).rejects.toMatchObject({ stderr: expect.stringContaining("already set up") });
      expect((await readPersonLeave(AUDREY)).profile?.openingBalance).toBe(7);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 40_000);

  it("previews and applies the national holiday seed without replacing custom rows or undoing a later deletion", async () => {
    await withStatus(await holiday(gregory, "2026-12-25", "Custom Christmas"), 200);
    const preview = (await run("--holidays")).stdout;
    expect(preview).toContain(holidaySeed.source);
    expect(preview).toContain("DRY RUN. Nothing written");
    expect((await readTeamLeave()).holidays).toEqual([{ date: "2026-12-25", name: "Custom Christmas" }]);
    expect((await run("--holidays", "--apply")).stdout).toContain("Apply confirmed.");
    const seeded = await readTeamLeave();
    expect(seeded.holidays).toEqual([{ date: "2026-12-25", name: "Custom Christmas" }, ...holidaySeed.holidays.slice(1)]);
    expect(seeded.holidays.some(({ date }) => date === "2026-12-24")).toBe(false);
    await withStatus(await holiday(gregory, "2027-01-05", null, seeded.holidayVersion), 200);
    await run("--holidays", "--apply");
    expect(await readTeamLeave()).toMatchObject({
      holidays: seeded.holidays.filter(({ date }) => date !== "2027-01-05"), holidayVersion: seeded.holidayVersion + 1,
    });
  }, 25_000);
});
