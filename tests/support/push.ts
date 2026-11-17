import { createECDH } from "node:crypto";

const key = createECDH("prime256v1");
key.generateKeys();
export const PUSH_EMAIL = "audrey.wijaya@deushcs.com";
export const subscription = (device = "phone") => ({
  endpoint: `https://web.push.apple.com/${device}`,
  expirationTime: null,
  keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") },
});
export const message = { title: "Notifications work", body: "New tasks and the 09:00 summary will arrive here.", url: "/" };
