import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ fetch: vi.fn(), enabled: vi.fn(), ready: vi.fn(), token: vi.fn(), user: null as null | { getIdToken: () => Promise<string> } }));
vi.mock("@/lib/flags", () => ({ signInEnabled: io.enabled }));
vi.mock("@/lib/authClient", () => ({ clientAuth: { authStateReady: io.ready, get currentUser() { return io.user; } } }));
import { requestAssignNotify } from "@/lib/assignNotifyRequests";

beforeEach(() => {
  vi.resetAllMocks(); io.enabled.mockReturnValue(true); io.ready.mockResolvedValue(undefined); io.token.mockResolvedValue("signed-token");
  io.fetch.mockResolvedValue({ ok: true }); io.user = null; vi.stubGlobal("fetch", io.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("nonblocking assignment pings", () => {
  it("does nothing with the flag off or no valid IDs", async () => {
    io.enabled.mockReturnValue(false); requestAssignNotify(["task"]);
    io.enabled.mockReturnValue(true); requestAssignNotify([]); requestAssignNotify(["", "a/b"]);
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(io.ready).not.toHaveBeenCalled(); expect(io.fetch).not.toHaveBeenCalled();
  });
  it("deduplicates, chunks to 50, sends only IDs and includes the optional token", async () => {
    io.user = { getIdToken: io.token };
    requestAssignNotify([...Array.from({ length: 101 }, (_, i) => `t${i}`), "t0"]);
    await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledTimes(3));
    expect(io.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).taskIds.length)).toEqual([50, 50, 1]);
    for (const [url, init] of io.fetch.mock.calls) {
      expect(url).toBe("/api/notify/assigned");
      expect(init).toMatchObject({ method: "POST", keepalive: true, headers: { Authorization: "Bearer signed-token", "Content-Type": "application/json" } });
      expect(Object.keys(JSON.parse(init.body))).toEqual(["taskIds"]);
    }
  });
  it("keeps even long multibyte IDs below the keepalive byte limit", async () => {
    requestAssignNotify(Array.from({ length: 50 }, (_, i) => "é".repeat(740) + i));
    await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledTimes(2));
    expect(io.fetch.mock.calls.flatMap(([, init]) => JSON.parse(init.body).taskIds)).toHaveLength(50);
    for (const [, init] of io.fetch.mock.calls) expect(new TextEncoder().encode(init.body).length).toBeLessThan(60_000);
  });
  it("keeps working across synchronous/offline failures and never retries an ambiguous response", async () => {
    io.fetch.mockImplementationOnce(() => { throw new Error("unavailable"); }).mockRejectedValueOnce(new Error("reply lost"));
    requestAssignNotify(Array.from({ length: 101 }, (_, i) => `t${i}`));
    await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledTimes(3));
    expect(io.fetch.mock.calls[2][1].headers).not.toHaveProperty("Authorization");
  });
  it("does not send anonymously after a signed-in token or Auth restoration fails", async () => {
    io.user = { getIdToken: io.token }; io.token.mockRejectedValueOnce(new Error("offline"));
    requestAssignNotify(["task"]); await vi.waitFor(() => expect(io.token).toHaveBeenCalledOnce());
    io.ready.mockRejectedValueOnce(new Error("unavailable")); requestAssignNotify(["other"]);
    await vi.waitFor(() => expect(io.ready).toHaveBeenCalledTimes(2)); expect(io.fetch).not.toHaveBeenCalled();
  });
  it("does not block the caller on a missing reply or token", async () => {
    io.user = { getIdToken: io.token }; io.token.mockReturnValue(new Promise(() => {}));
    expect(requestAssignNotify(["task"])).toBeUndefined();
    await vi.waitFor(() => expect(io.token).toHaveBeenCalledOnce()); expect(io.fetch).not.toHaveBeenCalled();
  });
});
