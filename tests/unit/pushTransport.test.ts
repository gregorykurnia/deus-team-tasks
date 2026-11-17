import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { message, PUSH_EMAIL as EMAIL, subscription } from "../support/push";
const { send, add, mode } = vi.hoisted(() => ({ send: vi.fn(), add: vi.fn(), mode: { emulator: false } }));
vi.mock("web-push", () => ({ sendNotification: send }));
vi.mock("../../lib/emulator", () => ({ get USE_EMULATOR() { return mode.emulator; } }));
vi.mock("../../lib/admin", () => ({ adminDb: { collection: () => ({ add }) } }));
import { deliverPush } from "../../lib/pushTransport.server";

beforeEach(() => {
  vi.resetAllMocks(); mode.emulator = false;
  for (const key of ["NEXT_PUBLIC_USE_EMULATOR", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) vi.stubEnv(key, "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@deushcs.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("isolated push transport", () => {
  it("uses per-request VAPID options and a bounded socket timeout, without mutable global keys", async () => {
    await deliverPush(EMAIL, subscription(), message);
    expect(send).toHaveBeenCalledExactlyOnceWith(subscription(), JSON.stringify(message), {
      vapidDetails: { publicKey: "test-public", privateKey: "test-private", subject: "mailto:push@deushcs.com" }, timeout: 10_000,
    });
    expect(add).not.toHaveBeenCalled();
  });
  it("writes only the approved fake payload on the emulator, even with real configuration present", async () => {
    mode.emulator = true;
    await deliverPush(EMAIL, subscription(), message);
    expect(add).toHaveBeenCalledExactlyOnceWith({ email: EMAIL, ...message });
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])("fails closed without %s", async (key) => {
    vi.stubEnv(key, "");
    await expect(deliverPush(EMAIL, subscription(), message)).rejects.toThrow("Configure");
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["NEXT_PUBLIC_USE_EMULATOR", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])("cannot fall through to real push with %s configured", async (key) => {
    vi.stubEnv(key, key === "NEXT_PUBLIC_USE_EMULATOR" ? "1" : "127.0.0.1:8180");
    await expect(deliverPush(EMAIL, subscription(), message)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled();
  });
  it("refuses fake delivery in production", async () => {
    mode.emulator = true; vi.stubEnv("NODE_ENV", "production");
    await expect(deliverPush(EMAIL, subscription(), message)).rejects.toThrow("non-production");
    expect(send).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled();
  });
  it("does not automatically retry an unconfirmed push or report success before acceptance", async () => {
    let reject!: (error: Error) => void;
    send.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const pending = deliverPush(EMAIL, subscription(), message);
    const checked = expect(pending).rejects.toThrow("timeout");
    reject(new Error("timeout")); await checked;
    expect(send).toHaveBeenCalledOnce();
  });
});
