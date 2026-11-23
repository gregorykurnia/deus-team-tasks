import { afterEach, describe, expect, it, vi } from "vitest";
import { askLeave, cancelLeave, getMyLeave } from "@/lib/leaveClient";
import type { LeaveInput } from "@/lib/leave";

const auth = vi.hoisted(() => ({
  authStateReady: vi.fn(async () => {}),
  currentUser: null as { getIdToken: () => Promise<string> } | null,
}));
vi.mock("@/lib/authClient", () => ({ clientAuth: auth }));

const input: LeaveInput = {
  type: "annual", start: "2027-02-11", end: "2027-02-11", half: "morning", reason: null, event: null, hours: null, note: "",
};
const key = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

afterEach(() => { vi.unstubAllGlobals(); auth.currentUser = null; });

describe("leave client", () => {
  it("waits for auth and uses the ID token for uncached reads and both writes", async () => {
    const user = { getIdToken: vi.fn(async () => "firebase-token") };
    auth.authStateReady.mockImplementationOnce(async () => { auth.currentUser = user; });
    const fetch = vi.fn<(path: string, options: RequestInit) => Promise<Response>>()
      .mockImplementation(async () => Response.json({ request: { id: "saved" } }));
    vi.stubGlobal("fetch", fetch);

    await getMyLeave();
    await askLeave(input, key);
    await cancelLeave("saved");
    const calls = fetch.mock.calls;
    expect(calls.map(([path]) => path)).toEqual(["/api/leave/me", "/api/leave/requests", "/api/leave/requests/saved/cancel"]);
    for (const [, { headers, cache }] of calls) {
      expect(new Headers(headers).get("authorization")).toBe("Bearer firebase-token");
      expect(cache).toBe("no-store");
    }
    expect(new Headers(calls[1][1].headers).get("idempotency-key")).toBe(key);
    expect(JSON.parse(calls[1][1].body as string)).toEqual(input);
    expect(calls.slice(1).map(([, { method }]) => method)).toEqual(["POST", "POST"]);
  });

  it("never fetches anonymously when the session or token is missing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(getMyLeave()).rejects.toMatchObject({ status: 401, message: "Sign in again." });
    auth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error("Auth offline")) };
    await expect(askLeave(input, key)).rejects.toThrow("Auth offline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the retry key after losing the answer and surfaces a refusal as an error", async () => {
    auth.currentUser = { getIdToken: async () => "firebase-token" };
    const issues = [{ field: "start", message: "You already have leave on Thu 11 Feb." }];
    const fetch = vi.fn<(path: string, options: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(Response.json({ error: issues[0].message, issues }, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(askLeave(input, key)).rejects.toThrow("Connection lost");
    await expect(askLeave(input, key)).rejects.toMatchObject({ status: 400, issues });
    expect(fetch.mock.calls.map(([, options]) => new Headers(options.headers).get("idempotency-key"))).toEqual([key, key]);
  });
});
