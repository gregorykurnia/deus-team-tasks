import "server-only";
import { randomUUID } from "node:crypto";
import { adminAuth, adminDb } from "./admin";
import { personEmail } from "./peopleInput";
import { readPerson } from "./people.server";
import { pushDeviceId, pushEndpoint, pushSubscription } from "./pushInput.server";
import { deliverPush, type PushMessage } from "./pushTransport.server";

export { pushDeviceId, pushEndpoint, pushSubscription } from "./pushInput.server";
export type { PushMessage } from "./pushTransport.server";
export type PushResult = "sent" | "gone" | "failed" | "missing" | "inactive";
export class PushAccessError extends Error {}

export async function pushIdentity(token: string): Promise<{ email: string; revoked: boolean } | null> {
  let uid: unknown, revoked = false;
  try {
    uid = (await adminAuth.verifyIdToken(token, true)).uid;
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "auth/id-token-revoked") return null;
    // Admin verifies the JWT before reporting revocation (also on the emulator).
    // Read its verified subject only to distinguish removed access from a stale
    // session. A revoked token can never authorize a write or delivery.
    try { uid = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub; revoked = true; }
    catch { return null; }
  }
  try {
    if (typeof uid !== "string") return null;
    const email = personEmail(uid);
    return email === uid ? { email, revoked } : null;
  } catch { return null; }
}

const personRef = (email: string) => adminDb.collection("people").doc(personEmail(email));

export async function activePushPerson(email: string): Promise<boolean> {
  return readPerson(await personRef(email).get())?.active === true;
}

export async function savePushDevice(email: string, value: unknown): Promise<string> {
  const subscription = pushSubscription(value), id = pushDeviceId(subscription.endpoint);
  const person = personRef(email);
  const revision = randomUUID();
  await adminDb.runTransaction(async (transaction) => {
    if (!readPerson(await transaction.get(person))?.active) throw new PushAccessError();
    transaction.set(person.collection("devices").doc(id), { ...subscription, revision });
  });
  return id;
}

export async function removePushDevice(email: string, endpoint: string): Promise<void> {
  const person = personRef(email), id = pushDeviceId(pushEndpoint(endpoint));
  await adminDb.runTransaction(async (transaction) => {
    if (!readPerson(await transaction.get(person))?.active) throw new PushAccessError();
    transaction.delete(person.collection("devices").doc(id));
  });
}

function logFailure(error: unknown) {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  // Provider errors contain endpoints, keys and response bodies. Log only a numeric status.
  console.error("Push delivery failed.", typeof code === "number" && Number.isInteger(code) ? code : "unavailable");
}

export async function sendPushToDevice(email: string, id: string, message: PushMessage): Promise<PushResult> {
  try {
    if (!/^[a-f0-9]{64}$/.test(id)) return "missing";
    const person = personRef(email), device = person.collection("devices").doc(id);
    const snapshot = await adminDb.runTransaction(async (transaction) => {
      if (!readPerson(await transaction.get(person))?.active) return null;
      return transaction.get(device);
    });
    if (!snapshot) return "inactive";
    if (!snapshot.exists) return "missing";
    const data = snapshot.data()!;
    // Validate again on reads, so malformed/legacy records cannot become arbitrary network requests.
    const subscription = pushSubscription({ endpoint: data.endpoint, keys: data.keys, ...(data.expirationTime === undefined ? {} : { expirationTime: data.expirationTime }) });
    try {
      await deliverPush(email, subscription, message);
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: unknown } | null)?.statusCode;
      if (status !== 404 && status !== 410) throw error;
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(device);
        // A refresh during delivery is a new registration, even with the same endpoint/keys.
        if (current.exists && current.data()?.revision === data.revision && current.updateTime?.isEqual(snapshot.updateTime!)) transaction.delete(device);
      });
      return "gone";
    }
  } catch (error) {
    logFailure(error);
    return "failed";
  }
}

export async function sendPushToPerson(email: string, message: PushMessage): Promise<PushResult[]> {
  try {
    const person = personRef(email);
    if (!readPerson(await person.get())?.active) return [];
    const devices = await person.collection("devices").get();
    return await Promise.all(devices.docs.map((device) => sendPushToDevice(email, device.id, message)));
  } catch (error) {
    logFailure(error);
    return ["failed"];
  }
}
