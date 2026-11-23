import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addLeaveHoliday, adjustLeave, askLeave, cancelLeave, decideLeave, getLeaveBadge, getLeaveTeam, getMyLeave, getPersonLeave,
  removeLeaveHoliday, saveLeaveDetails,
} from "@/lib/leaveClient";
import type { LeaveInput } from "@/lib/leave";
import { withLeaveDeadline } from "@/features/leave/LeaveData";

const auth = vi.hoisted(() => ({
  authStateReady: vi.fn(async () => {}),
  currentUser: null as { email?: string; uid?: string; getIdToken: () => Promise<string> } | null,
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

  it("does not send an older Leave action with a replacement account's token", async () => {
    const controller = new AbortController();
    const email = "audrey@deushcs.com";
    const session = { email, signal: controller.signal };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    auth.currentUser = { uid: "other@deushcs.com", getIdToken: async () => "other-token" };
    await expect(getLeaveBadge(session)).rejects.toMatchObject({ status: 401 });
    await expect(askLeave(input, key, session)).rejects.toMatchObject({ status: 401 });

    const token = Promise.withResolvers<string>();
    const reading = Promise.withResolvers<void>();
    auth.currentUser = { uid: email, getIdToken: () => { reading.resolve(); return token.promise; } };
    const reply = cancelLeave("old-request", session);
    await reading.promise;
    auth.currentUser = { uid: "other@deushcs.com", getIdToken: async () => "other-token" };
    token.resolve("old-token");
    await expect(reply).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("releases the caller after a request never replies and lets it retry", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    try {
      const controller = new AbortController();
      const deadline = expect(withLeaveDeadline(() => new Promise(() => {}), controller)).rejects.toThrow("Leave request timed out.");
      await vi.advanceTimersByTimeAsync(12_000);
      await deadline;
      expect(controller.signal.aborted).toBe(true);
      await expect(withLeaveDeadline(async () => "saved")).resolves.toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses authenticated admin paths and forwards the request keys and versions from the caller", async () => {
    auth.currentUser = { getIdToken: async () => "firebase-token" };
    const fetch = vi.fn<(path: string, options: RequestInit) => Promise<Response>>()
      .mockImplementation(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    const email = "person+leave@deushcs.com";
    const encoded = "person%2Bleave%40deushcs.com";
    const date = "2027-03-10";
    const days = { email, days: 1.5, reason: "Correction" };
    const decision = { decision: "approve", pay: "paid" } as const;
    await getLeaveTeam();
    await getPersonLeave(email);
    await askLeave({ ...input, email }, key);
    await decideLeave("request id", decision);
    await adjustLeave(days, key);
    await saveLeaveDetails(email, { endDate: null }, 42);
    await addLeaveHoliday({ date, name: "Idulfitri" }, 3);
    await removeLeaveHoliday(date, 4);

    expect(fetch.mock.calls.map(([path, options]) => [path, options.method ?? "GET", options.body && JSON.parse(String(options.body))])).toEqual([
      ["/api/leave/team", "GET", undefined], [`/api/leave/people/${encoded}`, "GET", undefined],
      ["/api/leave/requests", "POST", { ...input, email }], ["/api/leave/requests/request%20id/decide", "POST", decision],
      ["/api/leave/adjustments", "POST", days], [`/api/leave/profiles/${encoded}`, "PUT", { endDate: null }],
      [`/api/leave/holidays/${date}`, "POST", { name: "Idulfitri" }], [`/api/leave/holidays/${date}`, "DELETE", undefined],
    ]);
    const headers = fetch.mock.calls.map(([, options]) => new Headers(options.headers));
    expect(headers.every((header) => header.get("Authorization") === "Bearer firebase-token")).toBe(true);
    expect([headers[2], headers[4]].map((header) => header.get("Idempotency-Key"))).toEqual([key, key]);
    expect(headers.slice(5).map((header) => header.get("If-Match"))).toEqual(['"42"', '"3"', '"4"']);
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
