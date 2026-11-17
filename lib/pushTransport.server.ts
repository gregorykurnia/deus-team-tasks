import "server-only";
import { sendNotification, type PushSubscription } from "web-push";
import { USE_EMULATOR } from "./emulator";

export interface PushMessage { title: string; body: string; url: string }

export async function deliverPush(email: string, subscription: PushSubscription, message: PushMessage): Promise<void> {
  if (process.env.NEXT_PUBLIC_USE_EMULATOR === "1" && !USE_EMULATOR || USE_EMULATOR && process.env.NODE_ENV === "production") {
    throw new Error("Fake push requires a non-production emulator process.");
  }
  if (USE_EMULATOR) {
    const { adminDb } = await import("./admin");
    await adminDb.collection("_fakePush").add({ email, ...message });
    return;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Real push is disabled when Firebase emulators are configured.");
  }
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject) throw new Error("Configure the VAPID keys and subject.");
  await sendNotification(subscription, JSON.stringify(message), {
    vapidDetails: { publicKey, privateKey, subject }, timeout: 10_000,
  });
}
