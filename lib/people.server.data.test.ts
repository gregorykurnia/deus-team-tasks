import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp as deleteClientApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { connectFirestoreEmulator, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate } from "firebase/firestore";
import { deleteApp } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { adminApp, adminAuth, adminDb } from "./admin";
import { addPerson, deactivatePerson, getActivePerson, getPersonByName, listActivePeople, previewPersonAddition } from "./people.server";

const EMAIL = "audrey.wijaya@deushcs.com";
const exec = promisify(execFile);
const client = initializeApp({ projectId: "demo-deus", apiKey: "fake-emulator-key" }, "people-rules");
const clientDb = getFirestore(client), clientAuth = getAuth(client);
setLogLevel("silent");
connectFirestoreEmulator(clientDb, "127.0.0.1", 8180);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9199", { disableWarnings: true });

async function snapshot() {
  const rows = await Promise.all(["people", "assignNotices", "tasks"].map(async (name) => (
    await adminDb.collection(name).get()
  ).docs.map((d) => ({ id: d.id, ...d.data() }))));
  return rows;
}

async function cli(command: string, ...args: string[]) {
  const { stdout, stderr } = await exec(process.execPath, ["scripts/people.mjs", command, ...args], {
    env: { ...process.env, NEXT_PUBLIC_USE_EMULATOR: "1", FIREBASE_ADMIN_KEY: "" }, timeout: 20000,
  });
  expect(stderr).toBe("");
  return stdout;
}

beforeAll(() => {
  if (adminApp.options.projectId !== "demo-deus" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") {
    throw new Error("Person tests require both local emulators and the demo-deus project.");
  }
});
beforeEach(async () => {
  await signOut(clientAuth);
  for (const endpoint of ["http://127.0.0.1:8180/emulator/v1/projects/demo-deus/databases/(default)/documents", "http://127.0.0.1:9199/emulator/v1/projects/demo-deus/accounts"]) {
    const response = await fetch(endpoint, { method: "DELETE" });
    expect(response.ok).toBe(true);
  }
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await terminate(clientDb);
  await deleteClientApp(client);
  await deleteApp(adminApp);
});

describe("person records, owner commands and closed device rules", () => {
  it("adds and loads the canonical person, backfills every old assignment and preserves tasks and other notice names", async () => {
    const tasks = [
      { id: "main", responsible: ["Audrey", "Gregory"], endDate: "2026-12-01" },
      { id: "child", parentId: "main", responsible: ["Audrey"], completed: true },
      { id: "parked", responsible: ["Audrey"], parkedAt: 1 },
      { id: "unrelated", responsible: ["Gregory"] },
      { id: "missing" },
    ];
    for (const { id, ...task } of tasks) await adminDb.doc(`tasks/${id}`).set(task);
    await adminDb.doc("assignNotices/main").set({ notified: ["Gregory"], other: "kept" });
    const before = (await snapshot())[2];
    const preview = await previewPersonAddition("  AUDREY.WIJAYA@DEUSHCS.COM ", " Audrey ");
    expect({ total: preview.total, open: preview.open }).toEqual({ total: 3, open: 1 });
    await addPerson("  AUDREY.WIJAYA@DEUSHCS.COM ", " Audrey ");
    const expected = { email: EMAIL, name: "Audrey", active: true };
    expect(await getActivePerson(EMAIL.toUpperCase())).toEqual(expected);
    expect(await getPersonByName("Audrey")).toEqual(expected);
    expect(await getPersonByName("Gregory")).toBeNull();
    expect(await listActivePeople()).toEqual([expected]);
    expect((await snapshot())[2]).toEqual(before);
    expect((await adminDb.doc("assignNotices/main").get()).data()).toEqual({ notified: ["Gregory", "Audrey"], other: "kept" });
    for (const id of ["child", "parked"]) expect((await adminDb.doc(`assignNotices/${id}`).get()).data()).toEqual({ notified: ["Audrey"] });
    expect((await adminDb.doc("assignNotices/unrelated").get()).exists).toBe(false);
  });

  it("repeated and concurrent adds never duplicate notices or suppress a later assignment", async () => {
    await adminDb.doc("tasks/old").set({ responsible: ["Audrey", "Audrey", "Gregory"] });
    await Promise.all([addPerson(EMAIL, "Audrey"), addPerson(EMAIL.toUpperCase(), "Audrey"), addPerson("gregory.kurnia@deushcs.com", "Gregory")]);
    await adminDb.doc("tasks/new").set({ responsible: ["Audrey"] });
    await addPerson(EMAIL, "Audrey");
    expect((await adminDb.collection("people").get()).size).toBe(2);
    expect((await adminDb.doc("assignNotices/old").get()).data()?.notified.sort()).toEqual(["Audrey", "Gregory"]);
    expect((await adminDb.doc("assignNotices/new").get()).exists).toBe(false);
  }, 20000);

  it("rejects competing emails for the same name, including case and spacing variants, and refuses a rename", async () => {
    const results = await Promise.allSettled([addPerson(EMAIL, "Audrey Wijaya"), addPerson("other@deushcs.com", "AUDREY   WIJAYA")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const [person] = await listActivePeople();
    await expect(addPerson(person.email, "Changed name")).rejects.toThrow("Renaming");
    await expect(previewPersonAddition(person.email, "Changed name")).rejects.toThrow("Renaming");
    await expect(previewPersonAddition("third@deushcs.com", person.name.toLowerCase())).rejects.toThrow("another active email");
    expect(await getActivePerson(person.email)).toEqual(person);
  }, 20000);

  it("backfills more than 500 existing tasks before activation", async () => {
    for (let offset = 0; offset < 501; offset += 250) {
      const batch = adminDb.batch();
      for (let i = offset; i < Math.min(offset + 250, 501); i++) batch.set(adminDb.doc(`tasks/task-${i}`), { responsible: ["Audrey"] });
      await batch.commit();
    }
    await addPerson(EMAIL, "Audrey");
    const notices = await adminDb.collection("assignNotices").get();
    expect(notices.size).toBe(501);
    expect(notices.docs.every((d) => JSON.stringify(d.data().notified) === '["Audrey"]')).toBe(true);
    expect(await getActivePerson(EMAIL)).toMatchObject({ active: true });
  }, 20000);

  it("rolls back a halfway backfill failure and safely retries after both a failure and a confirmed commit", async () => {
    for (const id of ["one", "two"]) await adminDb.doc(`tasks/${id}`).set({ responsible: ["Audrey"] });
    const arrayUnion = FieldValue.arrayUnion;
    const fail = vi.spyOn(FieldValue, "arrayUnion")
      .mockImplementationOnce((...names) => arrayUnion(...names))
      .mockImplementationOnce(() => { throw new Error("Backfill interrupted"); });
    await expect(addPerson(EMAIL, "Audrey")).rejects.toThrow("Backfill interrupted");
    expect((await adminDb.collection("people").get()).empty).toBe(true);
    expect((await adminDb.collection("assignNotices").get()).empty).toBe(true);
    fail.mockRestore();
    await addPerson(EMAIL, "Audrey");
    const committed = await snapshot();
    await addPerson(EMAIL, "Audrey");
    expect(await snapshot()).toEqual(committed);
  });

  it("deactivates a signed-in person, deletes every device, hides the person and revokes the actual ID token", async () => {
    await addPerson(EMAIL, "Audrey");
    const signedIn = await signInWithCustomToken(clientAuth, await adminAuth.createCustomToken(EMAIL));
    const token = await signedIn.user.getIdToken();
    expect((await adminAuth.verifyIdToken(token, true)).uid).toBe(EMAIL);
    for (const id of ["phone", "laptop"]) await adminDb.doc(`people/${EMAIL}/devices/${id}`).set({ endpoint: "fake" });
    // Auth revocation timestamps have second precision; ensure this token is older.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await deactivatePerson(EMAIL.toUpperCase());
    expect((await adminDb.doc(`people/${EMAIL}`).get()).data()).toMatchObject({ active: false, name: "Audrey" });
    expect((await adminDb.collection(`people/${EMAIL}/devices`).get()).empty).toBe(true);
    expect(await getActivePerson(EMAIL)).toBeNull();
    expect(await getPersonByName("Audrey")).toBeNull();
    expect(await listActivePeople()).toEqual([]);
    await expect(adminAuth.verifyIdToken(token, true)).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });

  it("deactivates someone who never signed in, and repeated or unknown removal succeeds without inventing a record", async () => {
    await addPerson(EMAIL, "Audrey");
    await deactivatePerson(EMAIL);
    await deactivatePerson(EMAIL);
    await deactivatePerson("unknown@deushcs.com");
    expect(await getActivePerson(EMAIL)).toBeNull();
    expect((await adminDb.collection("people").get()).size).toBe(1);
  });

  it("an Auth failure leaves access closed, reports the unfinished step and can be retried", async () => {
    await addPerson(EMAIL, "Audrey");
    await adminAuth.createUser({ uid: EMAIL, email: EMAIL });
    await adminDb.doc(`people/${EMAIL}/devices/old`).set({ endpoint: "fake" });
    const revoke = vi.spyOn(adminAuth, "revokeRefreshTokens").mockRejectedValueOnce(new Error("No Auth response"));
    await expect(deactivatePerson(EMAIL)).rejects.toThrow("token revocation failed. Retry people:remove");
    expect(await getActivePerson(EMAIL)).toBeNull();
    expect((await adminDb.collection(`people/${EMAIL}/devices`).get()).empty).toBe(true);
    await deactivatePerson(EMAIL);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("a failed Firestore removal changes nothing, never revokes tokens and can be retried", async () => {
    await addPerson(EMAIL, "Audrey");
    await adminDb.doc(`people/${EMAIL}/devices/phone`).set({ endpoint: "fake" });
    const revoke = vi.spyOn(adminAuth, "revokeRefreshTokens");
    const unavailable = vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("Firestore unavailable"));
    await expect(deactivatePerson(EMAIL)).rejects.toThrow("Firestore unavailable");
    expect(revoke).not.toHaveBeenCalled();
    expect(await getActivePerson(EMAIL)).toMatchObject({ active: true });
    expect((await adminDb.doc(`people/${EMAIL}/devices/phone`).get()).exists).toBe(true);
    unavailable.mockRestore();
    await deactivatePerson(EMAIL);
    expect(await getActivePerson(EMAIL)).toBeNull();
  });

  it("late Auth completion cannot deactivate a later reactivation or delete its new device", async () => {
    await addPerson(EMAIL, "Audrey");
    let started!: () => void, finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const ready = new Promise<void>((resolve) => { started = resolve; });
    vi.spyOn(adminAuth, "revokeRefreshTokens").mockImplementationOnce(async () => { started(); await pending; });
    const removal = deactivatePerson(EMAIL);
    await ready;
    await addPerson(EMAIL, "Audrey");
    await adminDb.doc(`people/${EMAIL}/devices/new`).set({ endpoint: "new" });
    finish();
    await removal;
    expect(await getActivePerson(EMAIL)).toMatchObject({ active: true });
    expect((await adminDb.doc(`people/${EMAIL}/devices/new`).get()).exists).toBe(true);
  });

  it("actual owner scripts default to a write-free preview; --apply adds and removes on the emulator", async () => {
    await adminDb.doc("tasks/old").set({ responsible: ["Audrey"] });
    const before = await snapshot();
    expect(await cli("add", EMAIL.toUpperCase(), "Audrey")).toContain("DRY RUN: 1 tasks carry Audrey in Responsible; 1 open.");
    expect(await snapshot()).toEqual(before);
    expect(await cli("add", EMAIL, "Audrey", "--apply")).toContain("Applied:");
    expect(await getActivePerson(EMAIL)).toMatchObject({ name: "Audrey" });
    expect((await adminDb.doc("assignNotices/old").get()).data()).toEqual({ notified: ["Audrey"] });
    await adminAuth.createUser({ uid: EMAIL, email: EMAIL });
    await adminDb.doc(`people/${EMAIL}/devices/phone`).set({ endpoint: "fake" });
    const accountBefore = (await adminAuth.getUser(EMAIL)).tokensValidAfterTime;
    const linked = await snapshot();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await cli("remove", EMAIL)).toContain("delete 1 devices");
    expect(await snapshot()).toEqual(linked);
    expect((await adminDb.doc(`people/${EMAIL}/devices/phone`).get()).exists).toBe(true);
    expect((await adminAuth.getUser(EMAIL)).tokensValidAfterTime).toBe(accountBefore);
    expect(await cli("remove", EMAIL, "--apply")).toContain("Applied:");
    expect(await getActivePerson(EMAIL)).toBeNull();
    expect((await adminDb.collection(`people/${EMAIL}/devices`).get()).empty).toBe(true);
  }, 30000);

  it("the no-task warning leads the preview, offers close names and still permits adding someone who gives tasks", async () => {
    await adminDb.doc("tasks/old").set({ responsible: ["Audrey", "Gregory"] });
    const before = await snapshot();
    expect((await cli("add", "giver@deushcs.com", "Audry")).split("\n")[0]).toBe("DRY RUN: No tasks carry Audry in Responsible. Closest names: Audrey, Gregory.");
    expect(await snapshot()).toEqual(before);
    expect(await cli("add", "giver@deushcs.com", "Audry", "--apply")).toContain("Applied:");
    expect(await getActivePerson("giver@deushcs.com")).toMatchObject({ name: "Audry" });
    expect((await adminDb.collection("assignNotices").get()).empty).toBe(true);
  }, 30000);

  it.each(["add", "remove"])("%s refuses a foreign email even with --apply and returns a failing exit code", async (command) => {
    const before = await snapshot();
    const args = ["scripts/people.mjs", command, "audrey@other.test", ...(command === "add" ? ["Audrey"] : []), "--apply"];
    await expect(exec(process.execPath, args, { timeout: 20000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("deushcs.com email") });
    expect(await snapshot()).toEqual(before);
  });

  it("both anonymous and signed-in device SDKs are denied reads, queries, writes and deletes on every server-only collection", async () => {
    const paths = [`people/${EMAIL}`, `people/${EMAIL}/devices/phone`, `signInCodes/${EMAIL}`, "devices/phone", "assignNotices/task"];
    for (const path of paths) await adminDb.doc(path).set({ email: EMAIL, name: "Audrey", active: true, secret: "private" });
    for (const signedIn of [false, true]) {
      if (signedIn) {
        const result = await signInWithCustomToken(clientAuth, await adminAuth.createCustomToken(EMAIL));
        expect(result.user.uid).toBe(EMAIL);
      }
      // A successful task write prevents an unreachable emulator or blanket-deny rules from passing this test.
      await setDoc(doc(clientDb, "tasks/control"), { responsible: [] });
      expect((await getDoc(doc(clientDb, "tasks/control"))).exists()).toBe(true);
      for (const path of paths) {
        const ref = doc(clientDb, path);
        await expect(getDoc(ref)).rejects.toMatchObject({ code: "permission-denied" });
        await expect(getDocs(collection(clientDb, path.slice(0, path.lastIndexOf("/"))))).rejects.toMatchObject({ code: "permission-denied" });
        await expect(setDoc(ref, { secret: "tampered" })).rejects.toMatchObject({ code: "permission-denied" });
        const newRef = doc(clientDb, `${path.slice(0, path.lastIndexOf("/"))}/attempt-${signedIn}`);
        await expect(setDoc(newRef, { secret: "invented" })).rejects.toMatchObject({ code: "permission-denied" });
        await expect(deleteDoc(ref)).rejects.toMatchObject({ code: "permission-denied" });
      }
    }
  }, 20000);
});
