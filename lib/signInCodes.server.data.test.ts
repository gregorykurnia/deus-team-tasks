import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp as deleteClientApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { deleteApp } from "firebase-admin/app";
import { adminApp, adminAuth, adminDb } from "./admin";
import { CODE_COOLDOWN, CODE_LIFETIME, hashSignInCode, type SignInCodeState } from "./signInCodes";
import { requestSignInCode, verifySignInCode } from "./signInCodes.server";
import * as mailer from "./mailer";
import { POST as requestRoute } from "../app/api/auth/code/route";
import { POST as verifyRoute } from "../app/api/auth/verify/route";

const EMAIL = "audrey.wijaya@deushcs.com", SECRET = "test-only-code-secret-at-least-32-characters";
const client = initializeApp({ projectId: "demo-deus", apiKey: "fake-emulator-key" }, "sign-in-codes");
const auth = getAuth(client);
connectAuthEmulator(auth, "http://127.0.0.1:9199", { disableWarnings: true });
const ref = adminDb.doc(`signInCodes/${EMAIL}`);
const personRef = adminDb.doc(`people/${EMAIL}`);
const state = async () => (await ref.get()).data() as SignInCodeState;
const mails = async () => (await adminDb.collection("_fakeMail").get()).docs.map((d) => d.data());
const body = (data: unknown, signal?: AbortSignal) => new Request("http://localhost/api/auth/code", { method: "POST", body: JSON.stringify(data), signal });
async function allowResend() {
  const current = await state();
  await ref.set({ ...current, requests: current.requests.map((at) => at - CODE_COOLDOWN), codes: current.codes.map((c) => ({ ...c, createdAt: c.createdAt - CODE_COOLDOWN, expiresAt: c.expiresAt - CODE_COOLDOWN })) });
}

beforeAll(() => {
  if (adminApp.options.projectId !== "demo-deus" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") {
    throw new Error("Sign-in data tests require both local demo-deus emulators.");
  }
});
beforeEach(async () => {
  vi.stubEnv("CODE_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1");
  await signOut(auth);
  for (const endpoint of ["http://127.0.0.1:8180/emulator/v1/projects/demo-deus/databases/(default)/documents", "http://127.0.0.1:9199/emulator/v1/projects/demo-deus/accounts"]) {
    expect((await fetch(endpoint, { method: "DELETE" })).ok).toBe(true);
  }
  await personRef.set({ email: EMAIL, name: "Audrey", active: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await deleteClientApp(client); await deleteApp(adminApp); });

describe("transactional email sign-in on the emulators", () => {
  it("requests only for active canonical people; case/space duplicates share one cooldown", async () => {
    for (const email of ["", "bad@example.com", "a@deushcs.com.evil.test"]) expect(await requestSignInCode(email)).toEqual({ status: "wrongDomain" });
    expect(await requestSignInCode("unknown@deushcs.com")).toEqual({ status: "notAdded" });
    await personRef.update({ active: false });
    expect(await requestSignInCode(EMAIL)).toEqual({ status: "notAdded" });
    await personRef.update({ active: true, name: "" });
    expect(await requestSignInCode(EMAIL)).toEqual({ status: "notAdded" });
    expect((await adminDb.collection("signInCodes").get()).empty).toBe(true);
    expect(await mails()).toEqual([]);
    await personRef.update({ name: "Audrey" });
    expect(await requestSignInCode(`  ${EMAIL.toUpperCase()} `)).toEqual({ status: "sent" });
    expect(await requestSignInCode(EMAIL)).toMatchObject({ status: "wait" });
    expect(await mails()).toHaveLength(1);
  });

  it("writes only a bound HMAC, sends one fake email and returns a token accepted by Auth with the person's name", async () => {
    const sent = await requestRoute(body({ email: EMAIL }));
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ status: "sent" });
    const [mail] = await mails();
    expect(mail).toEqual({ to: EMAIL, code: expect.stringMatching(/^\d{6}$/), subject: `${mail.code} is your DEUS Space code` });
    const saved = await state();
    expect(saved.codes).toHaveLength(1);
    expect(saved.codes[0].hash).toBe(hashSignInCode(SECRET, EMAIL, saved.codes[0].id, mail.code));
    expect(saved.codes[0].expiresAt - saved.codes[0].createdAt).toBe(CODE_LIFETIME);
    expect(saved.codes[0]).not.toHaveProperty("code");
    expect(Object.keys(saved.codes[0]).sort()).toEqual(["createdAt", "expiresAt", "hash", "id", "used"]);
    const verified = await verifyRoute(body({ email: EMAIL.toUpperCase(), code: mail.code }));
    expect(verified.status).toBe(200);
    const { token } = await verified.json();
    expect(typeof token).toBe("string");
    const signedIn = await signInWithCustomToken(auth, token);
    expect(signedIn.user.uid).toBe(EMAIL);
    expect((await signedIn.user.getIdTokenResult()).claims.name).toBe("Audrey");
    expect(await verifySignInCode(EMAIL, mail.code)).toEqual({ status: "noCode" });
    expect((await state()).requests).toHaveLength(1);
  });

  it("serializes ten parallel wrong verifies, counts exactly five and refuses every later guess", async () => {
    await requestSignInCode(EMAIL);
    const results = await Promise.all(Array.from({ length: 10 }, () => verifySignInCode(EMAIL, "wrong")));
    expect(results.filter((r) => "status" in r && r.status === "wrong")).toHaveLength(4);
    expect(results.filter((r) => "status" in r && r.status === "tooMany")).toHaveLength(6);
    expect((await state()).wrongAttempts).toHaveLength(5);
    const [mail] = await mails();
    expect(await verifySignInCode(EMAIL, mail.code)).toMatchObject({ status: "tooMany" });
    expect(await requestSignInCode(EMAIL)).toMatchObject({ status: "tooMany" });
    expect((await state()).wrongAttempts).toHaveLength(5);
    expect(await mails()).toHaveLength(1);
  }, 40_000);

  it("serializes simultaneous code requests into one reservation and one email", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => requestSignInCode(i % 2 ? EMAIL.toUpperCase() : EMAIL)));
    expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(results.filter((r) => r.status === "wait")).toHaveLength(9);
    expect((await state()).requests).toHaveLength(1);
    expect(await mails()).toHaveLength(1);
  }, 40_000);

  it("allows just one token for two simultaneous correct verifies", async () => {
    await requestSignInCode(EMAIL);
    const [mail] = await mails();
    const results = await Promise.all([verifySignInCode(EMAIL, mail.code), verifySignInCode(EMAIL, mail.code)]);
    expect(results.filter((r) => "token" in r)).toHaveLength(1);
    expect(results.filter((r) => "status" in r && r.status === "noCode")).toHaveLength(1);
    expect((await state()).wrongAttempts).toEqual([]);
  }, 20_000);

  it("keeps both codes when an older mail finishes after a resend, even after its page closes", async () => {
    const original = mailer.sendSignInMail;
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(mailer, "sendSignInMail").mockImplementationOnce(async (...args) => { started(); await held; await original(...args); });
    const controller = new AbortController();
    const older = requestRoute(body({ email: EMAIL }, controller.signal));
    await ready;
    controller.abort();
    await allowResend();
    expect(await requestSignInCode(EMAIL)).toEqual({ status: "sent" });
    const [newerMail] = await mails();
    release();
    expect((await older).status).toBe(200);
    const all = await mails();
    expect(all).toHaveLength(2);
    expect((await state()).codes).toHaveLength(2);
    const olderMail = all.find((mail) => mail.code !== newerMail.code)!;
    expect(await verifySignInCode(EMAIL, olderMail.code)).toHaveProperty("token");
    expect(await verifySignInCode(EMAIL, newerMail.code)).toHaveProperty("token");
    expect((await state()).codes.every((c) => c.used)).toBe(true);
    expect((await state()).requests).toHaveLength(2);
  }, 20_000);

  it("retains a delivered code after an uncertain SMTP answer, without a duplicate on retry", async () => {
    const original = mailer.sendSignInMail;
    vi.spyOn(mailer, "sendSignInMail").mockImplementationOnce(async (...args) => { await original(...args); throw new Error("Connection lost after acceptance"); });
    const response = await requestRoute(body({ email: EMAIL }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "unavailable" });
    const [delivered] = await mails();
    expect(await requestSignInCode(EMAIL)).toMatchObject({ status: "wait" });
    expect(await mails()).toHaveLength(1);
    expect(await verifySignInCode(EMAIL, delivered.code)).toHaveProperty("token");
  });

  it("keeps the cooldown after an unanswered mail call but permits a fresh code after sixty seconds", async () => {
    vi.spyOn(mailer, "sendSignInMail").mockRejectedValueOnce(new Error("SMTP timeout"));
    await expect(requestSignInCode(EMAIL)).rejects.toThrow("SMTP timeout");
    expect(await mails()).toHaveLength(0);
    expect((await state()).codes).toHaveLength(1);
    expect(await requestSignInCode(EMAIL)).toMatchObject({ status: "wait" });
    await allowResend();
    expect(await requestSignInCode(EMAIL)).toEqual({ status: "sent" });
    expect(await mails()).toHaveLength(1);
    expect((await state()).requests).toHaveLength(2);
  });

  it("rolls back a failed code reservation and retries without sending an orphan email", async () => {
    vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("Firestore unavailable"));
    await expect(requestSignInCode(EMAIL)).rejects.toThrow("Firestore unavailable");
    expect((await ref.get()).exists).toBe(false);
    expect(await mails()).toHaveLength(0);
    expect(await requestSignInCode(EMAIL)).toEqual({ status: "sent" });
    expect(await mails()).toHaveLength(1);
  });

  it("does not consume a code when token signing fails; a retry succeeds once", async () => {
    await requestSignInCode(EMAIL);
    const [mail] = await mails();
    vi.spyOn(adminAuth, "createCustomToken").mockRejectedValueOnce(new Error("Signing unavailable"));
    expect((await verifyRoute(body({ email: EMAIL, code: mail.code }))).status).toBe(503);
    expect((await state()).codes[0].used).toBe(false);
    expect(await verifySignInCode(EMAIL, mail.code)).toHaveProperty("token");
    expect(await verifySignInCode(EMAIL, mail.code)).toEqual({ status: "noCode" });
  });

  it("rechecks active status at verification and refuses another email's code", async () => {
    await requestSignInCode(EMAIL);
    const [mail] = await mails();
    expect(await verifySignInCode("not@allowed.test", mail.code)).toEqual({ status: "noCode" });
    expect(await verifySignInCode("gregory.kurnia@deushcs.com", mail.code)).toEqual({ status: "noCode" });
    // Even copying the entire row cannot make Audrey's HMAC authenticate another person.
    const other = "gregory.kurnia@deushcs.com";
    await adminDb.doc(`people/${other}`).set({ email: other, name: "Gregory", active: true });
    await adminDb.doc(`signInCodes/${other}`).set(await state());
    expect(await verifySignInCode(other, mail.code)).toEqual({ status: "wrong", triesLeft: 4 });
    await personRef.update({ active: false });
    expect(await verifySignInCode(EMAIL, mail.code)).toEqual({ status: "noCode" });
    expect((await state()).codes[0].used).toBe(false);
    expect(await requestSignInCode(EMAIL)).toEqual({ status: "notAdded" });
  });

  it("enforces five sends independently of expiry/consumption, and preserves wrong-try history across a resend", async () => {
    for (let i = 0; i < 5; i++) {
      if (i > 0) await allowResend();
      expect(await requestSignInCode(EMAIL)).toEqual({ status: "sent" });
      const latest = (await state()).codes.at(-1)!;
      const mail = (await mails()).find((m) => hashSignInCode(SECRET, EMAIL, latest.id, m.code) === latest.hash)!;
      if (i === 0) {
        expect(await verifySignInCode(EMAIL, "wrong")).toEqual({ status: "wrong", triesLeft: 4 });
      }
      expect(await verifySignInCode(EMAIL, mail.code)).toHaveProperty("token");
    }
    expect(await requestSignInCode(EMAIL)).toMatchObject({ status: "tooMany" });
    expect(await mails()).toHaveLength(5);
    expect((await state()).wrongAttempts).toHaveLength(1);
  });

  it("does not reset damaged records or write without the code secret", async () => {
    vi.stubEnv("CODE_SECRET", "");
    expect((await requestRoute(body({ email: EMAIL }))).status).toBe(503);
    expect((await ref.get()).exists).toBe(false);
    vi.stubEnv("CODE_SECRET", SECRET);
    await ref.set({ wrongAttempts: [Date.now()] });
    expect((await requestRoute(body({ email: EMAIL }))).status).toBe(503);
    expect((await ref.get()).data()).toEqual({ wrongAttempts: [expect.any(Number)] });
    expect(await mails()).toEqual([]);
  });
});
