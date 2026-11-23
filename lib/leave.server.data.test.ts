import { deleteApp as deleteClientApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate } from "firebase/firestore";
import { deleteApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/leave/me/route";
import { POST as askRoute } from "@/app/api/leave/requests/route";
import { POST as cancelRoute } from "@/app/api/leave/requests/[id]/cancel/route";
import { clearProject } from "@/tests/support/emulator";
import { adminApp, adminAuth, adminDataApp, adminDb } from "./admin";
import { addDays } from "./dates";
import { isLeaveAdmin, leaveAdmins, leaveToday } from "./leave.server";
import type { LeaveRequest } from "./leave";

const AUDREY = "leave.audrey@deushcs.com";
const CALISTA = "leave.calista@deushcs.com";
const GREGORY = "leave.gregory@deushcs.com";
const TODAY = "2027-02-10";
const KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ANNUAL = { type: "annual", start: "2027-02-11", end: "2027-02-11" };
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

function ask(token?: string, input: unknown = ANNUAL, key?: string) {
  return askRoute(new Request("http://localhost/api/leave/requests", {
    method: "POST", body: JSON.stringify(input), headers: {
      ...(token && { Authorization: `Bearer ${token}` }), ...(key && { "Idempotency-Key": key }),
    },
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

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

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
    await withStatus(await ask(gregory, { ...ANNUAL, email: CALISTA }), 403);
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
      isAdmin: true, waitingForMe: 1, profile: null, summary: null, ledger: [], requests: [],
    });
    await withStatus(await ask(gregory), 409);
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
