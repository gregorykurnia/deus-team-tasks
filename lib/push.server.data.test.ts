import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp as deleteClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { deleteApp } from "firebase-admin/app";
import { adminApp, adminDataApp, adminAuth, adminDb } from "./admin";
import { deactivatePerson } from "./people.server";
import { activePushPerson, pushDeviceId, pushIdentity, savePushDevice, removePushDevice, sendPushToDevice, sendPushToPerson, PushAccessError } from "./push.server";
import * as transport from "./pushTransport.server";
import { POST as save, DELETE as remove } from "../app/api/push/devices/route";
import { POST as testPush } from "../app/api/push/test/route";
import { message, PUSH_EMAIL as EMAIL, subscription } from "../tests/support/push";

const client = initializeApp({ projectId: "demo-deus", apiKey: "fake-emulator-key" }, "push-data");
const auth = getAuth(client);
connectAuthEmulator(auth, "http://127.0.0.1:9199", { disableWarnings: true });
const person = adminDb.doc(`people/${EMAIL}`), devices = person.collection("devices");
const id = (name = "phone") => pushDeviceId(subscription(name).endpoint);
const pushes = async () => (await adminDb.collection("_fakePush").get()).docs.map((d) => d.data());
let token: string;
const request = (body: unknown = subscription(), bearer = token) => new Request("http://localhost/api/push/devices", { method: "POST", headers: { Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
const endpointBody = (name = "phone") => ({ endpoint: subscription(name).endpoint });

beforeAll(() => {
  if (adminApp.options.projectId !== "demo-deus" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") throw new Error("Push data tests require both local demo-deus emulators.");
});
beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1");
  await signOut(auth);
  for (const endpoint of ["http://127.0.0.1:8180/emulator/v1/projects/deus-team-tasks/databases/(default)/documents", "http://127.0.0.1:9199/emulator/v1/projects/demo-deus/accounts"]) {
    expect((await fetch(endpoint, { method: "DELETE" })).ok).toBe(true);
  }
  await person.set({ email: EMAIL, name: "Audrey", active: true });
  const signedIn = await signInWithCustomToken(auth, await adminAuth.createCustomToken(EMAIL));
  token = await signedIn.user.getIdToken();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await deleteClientApp(client); await deleteApp(adminApp); await deleteApp(adminDataApp); });

describe("push devices and delivery on the emulators", () => {
  it("saves twice and in parallel to one stable device; reads the same complete payload for sending", async () => {
    for (const response of await Promise.all([save(request()), save(request()), save(request())])) {
      expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "saved", id: id() });
    }
    expect((await devices.get()).size).toBe(1);
    expect((await devices.doc(id()).get()).data()).toMatchObject({ ...subscription(), revision: expect.any(String) });
    const response = await testPush(request(endpointBody()));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "sent" });
    expect(await pushes()).toEqual([{ email: EMAIL, ...message }]);
  });

  it("tests only this device and never sends to another person's matching endpoint", async () => {
    const other = "gregory.kurnia@deushcs.com";
    await adminDb.doc(`people/${other}`).set({ email: other, name: "Gregory", active: true });
    await savePushDevice(other, subscription());
    await savePushDevice(EMAIL, subscription("laptop"));
    expect((await testPush(request(endpointBody()))).status).toBe(404);
    expect(await pushes()).toEqual([]);
    await savePushDevice(EMAIL, subscription());
    expect((await testPush(request(endpointBody()))).status).toBe(200);
    expect(await pushes()).toEqual([{ email: EMAIL, ...message }]);
    expect(await sendPushToPerson(EMAIL, message)).toEqual(["sent", "sent"]);
    expect(await pushes()).toHaveLength(3);
    expect((await pushes()).every((p) => p.email === EMAIL)).toBe(true);
  });

  it("removes only the signed-in person's device; repeated removal is harmless", async () => {
    await savePushDevice(EMAIL, subscription()); await savePushDevice(EMAIL, subscription("laptop"));
    const other = adminDb.doc(`people/gregory.kurnia@deushcs.com/devices/${id()}`);
    await other.set({ ...subscription(), revision: "other" });
    for (let n = 0; n < 2; n++) expect(await (await remove(request(endpointBody()))).json()).toEqual({ status: "removed" });
    expect((await devices.doc(id()).get()).exists).toBe(false);
    expect((await devices.doc(id("laptop")).get()).exists).toBe(true); expect((await other.get()).exists).toBe(true);
  });

  it.each([save, remove, testPush])("returns 403 for removed, missing or malformed people on every route", async (route) => {
    const body = route === save ? subscription() : endpointBody();
    await deactivatePerson(EMAIL);
    expect((await route(request(body))).status).toBe(403);
    await person.delete(); expect((await route(request(body))).status).toBe(403);
    await person.set({ email: EMAIL, active: true }); expect((await route(request(body))).status).toBe(403);
    expect((await devices.get()).empty).toBe(true); expect(await pushes()).toEqual([]);
  });

  it.each([save, remove, testPush])("returns 404 with the flag off, even with a bogus token and payload", async (route) => {
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "0");
    expect((await route(request(null, "bogus"))).status).toBe(404);
    expect((await devices.get()).empty).toBe(true); expect(await pushes()).toEqual([]);
  });

  it("rejects invalid/revoked/foreign identities and ignores an untrusted token email", async () => {
    expect((await save(request(subscription(), "bogus"))).status).toBe(401);
    expect(await pushIdentity("bogus")).toBeNull();
    const signed = await signInWithCustomToken(auth, await adminAuth.createCustomToken("other@example.com"));
    expect(await pushIdentity(await signed.user.getIdToken())).toBeNull();
    vi.spyOn(adminAuth, "verifyIdToken").mockRejectedValueOnce({ code: "auth/id-token-revoked" });
    expect((await save(request())).status).toBe(401);
    expect((await devices.get()).empty).toBe(true);
  });

  it("rejects a revoked session while active, then gives 403 on every removed-person route", async () => {
    // Auth revocation has second precision; make this a genuinely revoked token.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await adminAuth.revokeRefreshTokens(EMAIL);
    expect((await save(request())).status).toBe(401);
    await person.update({ active: false });
    for (const route of [save, remove, testPush]) expect((await route(request(route === save ? subscription() : endpointBody()))).status).toBe(403);
    expect((await devices.get()).empty).toBe(true); expect(await pushes()).toEqual([]);
  });

  it.each([404, 410])("deletes only a provider-expired device on %s and returns a retryable device message", async (statusCode) => {
    await savePushDevice(EMAIL, subscription()); await savePushDevice(EMAIL, subscription("laptop"));
    vi.spyOn(transport, "deliverPush").mockRejectedValue({ statusCode });
    const response = await testPush(request(endpointBody()));
    expect(response.status).toBe(410);
    expect((await devices.doc(id()).get()).exists).toBe(false); expect((await devices.doc(id("laptop")).get()).exists).toBe(true);
  });

  it("keeps a refreshed registration when an older send comes back expired", async () => {
    await savePushDevice(EMAIL, subscription());
    const revision = (await devices.doc(id()).get()).get("revision");
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async () => {
      await savePushDevice(EMAIL, subscription());
      throw { statusCode: 410 };
    });
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("gone");
    expect((await devices.doc(id()).get()).get("revision")).not.toBe(revision);
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("sent"); expect(await pushes()).toHaveLength(1);
  });

  it("retains transient/unanswered sends for retry, never throws, and logs no addresses or secrets", async () => {
    await savePushDevice(EMAIL, subscription());
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const sender = vi.spyOn(transport, "deliverPush");
    for (const error of [{ statusCode: 503, body: "secret", endpoint: subscription().endpoint }, new Error("timeout secret endpoint")]) {
      sender.mockRejectedValueOnce(error);
      expect((await testPush(request(endpointBody()))).status).toBe(503);
      expect((await devices.doc(id()).get()).exists).toBe(true);
    }
    expect(log.mock.calls).toEqual([["Push delivery failed.", 503], ["Push delivery failed.", "unavailable"]]);
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("sent"); expect(await pushes()).toHaveLength(1);
    expect(sender).toHaveBeenCalledTimes(3);
  });

  it("continues a person's other devices after one expires and another fails halfway", async () => {
    for (const name of ["phone", "laptop", "tablet"]) await savePushDevice(EMAIL, subscription(name));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deliver = transport.deliverPush;
    vi.spyOn(transport, "deliverPush").mockImplementation(async (email, sub, notification) => {
      if (sub.endpoint.endsWith("phone")) throw { statusCode: 410 };
      if (sub.endpoint.endsWith("laptop")) throw { statusCode: 503 };
      await deliver(email, sub, notification);
    });
    expect((await sendPushToPerson(EMAIL, message)).sort()).toEqual(["failed", "gone", "sent"]);
    expect((await devices.get()).size).toBe(2); expect(await pushes()).toEqual([{ email: EMAIL, ...message }]);
  });

  it("retries a failed save and an already-landed save without extra rows or premature success", async () => {
    vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("offline"));
    expect((await save(request())).status).toBe(503); expect((await devices.get()).size).toBe(0);
    expect((await save(request())).status).toBe(200); expect((await save(request())).status).toBe(200);
    expect((await devices.get()).size).toBe(1);
  });

  it("keeps a failed deletion visible as failure and allows retry", async () => {
    await savePushDevice(EMAIL, subscription());
    vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("offline"));
    expect((await remove(request(endpointBody()))).status).toBe(503); expect((await devices.get()).size).toBe(1);
    expect((await remove(request(endpointBody()))).status).toBe(200); expect((await devices.get()).size).toBe(0);
  });

  it("retries failed expired-device cleanup without deleting a working device", async () => {
    await savePushDevice(EMAIL, subscription());
    const transaction = adminDb.runTransaction.bind(adminDb);
    vi.spyOn(adminDb, "runTransaction").mockImplementationOnce(transaction).mockRejectedValueOnce(new Error("cleanup offline"));
    vi.spyOn(transport, "deliverPush").mockRejectedValue({ statusCode: 410 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("failed"); expect((await devices.get()).size).toBe(1);
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("gone"); expect((await devices.get()).size).toBe(0);
  });

  it("cannot leave devices behind when registration overlaps access removal", async () => {
    const results = await Promise.allSettled([savePushDevice(EMAIL, subscription()), savePushDevice(EMAIL, subscription("laptop")), deactivatePerson(EMAIL)]);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toBeInstanceOf(PushAccessError);
    expect(await activePushPerson(EMAIL)).toBe(false); expect((await devices.get()).empty).toBe(true);
    await expect(savePushDevice(EMAIL, subscription())).rejects.toBeInstanceOf(PushAccessError);
    await expect(removePushDevice(EMAIL, subscription().endpoint)).rejects.toBeInstanceOf(PushAccessError);
    expect(await sendPushToPerson(EMAIL, message)).toEqual([]); expect(await pushes()).toEqual([]);
  });

  it("a missing device or corrupt stored subscription never sends; storage errors never escape the caller", async () => {
    expect(await sendPushToDevice(EMAIL, "bad", message)).toBe("missing"); expect(await sendPushToDevice(EMAIL, id(), message)).toBe("missing");
    await devices.doc(id()).set({ endpoint: "https://127.0.0.1/private", keys: subscription().keys });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("failed"); expect(await pushes()).toEqual([]);
    vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("offline"));
    expect(await sendPushToDevice(EMAIL, id(), message)).toBe("failed");
    expect(await sendPushToPerson("not-an-email", message)).toEqual(["failed"]);
  });
});
