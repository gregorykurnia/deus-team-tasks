import { describe, expect, it } from "vitest";
import { isQuotaError, QUOTA_NOT_SAVED, refuseOnQuota } from "@/lib/firestoreQuota";

describe("Firestore quota refusals", () => {
  it("recognises the web SDK code, the Admin SDK gRPC code and the raw status text", () => {
    expect(isQuotaError({ code: "resource-exhausted" })).toBe(true);
    expect(isQuotaError({ code: 8 })).toBe(true);
    expect(isQuotaError(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."))).toBe(true);
    for (const other of [{ code: "aborted" }, new Error("network"), null, "RESOURCE_EXHAUSTED"]) expect(isQuotaError(other)).toBe(false);
  });

  it("turns only a quota refusal into the caller's public error", async () => {
    class PublicError extends Error {}
    const quota = refuseOnQuota(() => Promise.reject({ code: "resource-exhausted" }), (message) => new PublicError(message));
    await expect(quota).rejects.toEqual(new PublicError(QUOTA_NOT_SAVED));
    await expect(quota).rejects.toBeInstanceOf(PublicError);
    const other = { code: "unavailable" };
    await expect(refuseOnQuota(() => Promise.reject(other), (message) => new PublicError(message))).rejects.toBe(other);
    await expect(refuseOnQuota(async () => 5, (message) => new PublicError(message))).resolves.toBe(5);
  });
});
