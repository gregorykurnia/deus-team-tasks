import "server-only";
import { createHash, ECDH } from "node:crypto";
import type { PushSubscription } from "web-push";
import { z } from "zod";

// A subscription must point at a browser push service, never an arbitrary server
// (the endpoint is later fetched with the server's network access).
const providers = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
export function pushEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\s\u0000-\u001f\u007f\\]/.test(value)) throw new Error("Invalid push endpoint.");
  const url = new URL(value);
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
    || !(providers.includes(host) || host.endsWith(".notify.windows.com"))) throw new Error("Invalid push endpoint.");
  return value;
}

export function pushDeviceId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function key(value: string, bytes: number): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").length === bytes
    && Buffer.from(value, "base64url").toString("base64url") === value;
}
const subscription = z.object({
  endpoint: z.string().transform(pushEndpoint),
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.object({ p256dh: z.string().refine((s) => key(s, 65)), auth: z.string().refine((s) => key(s, 16)) }).strict(),
}).strict();

export function pushSubscription(value: unknown): PushSubscription {
  const parsed = subscription.parse(value);
  // Check the point too: correctly sized random bytes are not a P-256 public key.
  ECDH.convertKey(Buffer.from(parsed.keys.p256dh, "base64url"), "prime256v1");
  return parsed;
}
