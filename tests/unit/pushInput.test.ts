import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateRequestDetails, generateVAPIDKeys } from "web-push";
import { pushDeviceId, pushEndpoint, pushSubscription } from "../../lib/pushInput.server";
import { message, subscription } from "../support/push";

describe("push subscription input", () => {
  it("reads the browser format, keeps endpoint case significant and hashes it to a stable id", () => {
    const value = subscription();
    expect(pushSubscription(value)).toEqual(value);
    expect(pushDeviceId(value.endpoint)).toBe(createHash("sha256").update(value.endpoint).digest("hex"));
    expect(pushDeviceId(value.endpoint)).not.toBe(pushDeviceId(value.endpoint.toUpperCase()));
    expect(pushSubscription({ endpoint: value.endpoint, keys: value.keys })).toEqual({ endpoint: value.endpoint, keys: value.keys });
  });
  it("builds an encrypted request with the installed real web-push exports without calling any service", () => {
    const vapid = generateVAPIDKeys();
    const request = generateRequestDetails(subscription(), JSON.stringify(message), {
      vapidDetails: { ...vapid, subject: "mailto:push@example.invalid" }, timeout: 10_000,
    });
    expect(request.endpoint).toBe(subscription().endpoint);
    expect(request.headers.Authorization).toMatch(/^vapid /);
    expect(Buffer.isBuffer(request.body)).toBe(true);
    expect(request.body!.toString()).not.toContain(message.title);
  });
  it.each(["web.push.apple.com", "fcm.googleapis.com", "updates.push.services.mozilla.com", "wns2.notify.windows.com"])("accepts browser push provider %s", (host) => {
    expect(pushEndpoint(`https://${host}/push/AbC?token=AbC`)).toBe(`https://${host}/push/AbC?token=AbC`);
  });
  it.each([undefined, null, 12, "", " ", "http://web.push.apple.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://169.254.169.254/a", "https://web.push.apple.com.evil.test/a", "https://evil.test/?next=https://web.push.apple.com", "https://u:p@web.push.apple.com/a", "https://web.push.apple.com:8443/a", "https://web.push.apple.com/a#hash", " https://web.push.apple.com/a", "https://web.push.apple.com/a\nb", "https://web.push.apple.com/a\\b", `https://web.push.apple.com/${"x".repeat(4096)}`])("rejects unsafe/blank/long endpoint %j", (value) => {
    expect(() => pushEndpoint(value)).toThrow();
  });
  it.each([null, [], {}, { ...subscription(), email: "other@deushcs.com" }, { ...subscription(), expirationTime: -1 }, { ...subscription(), keys: {} }, { ...subscription(), keys: { ...subscription().keys, auth: " " } }, { ...subscription(), keys: { ...subscription().keys, p256dh: Buffer.alloc(65).toString("base64url") } }, { ...subscription(), keys: { ...subscription().keys, auth: "x".repeat(1000) } }])("rejects missing, extra or invalid key data %#", (value) => {
    expect(() => pushSubscription(value)).toThrow();
  });
});
