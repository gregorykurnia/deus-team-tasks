import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as save, DELETE as remove } from "../../app/api/push/devices/route";
import { POST as testPush } from "../../app/api/push/test/route";
import { message, PUSH_EMAIL as EMAIL, subscription } from "../support/push";
import { pushDeviceId, pushEndpoint, pushSubscription } from "../../lib/pushInput.server";
const { enabled, identity, active, store, erase, send, AccessError } = vi.hoisted(() => ({
  enabled: vi.fn(), identity: vi.fn(), active: vi.fn(), store: vi.fn(), erase: vi.fn(), send: vi.fn(), AccessError: class extends Error {},
}));
vi.mock("../../lib/flags", () => ({ signInEnabled: enabled }));
vi.mock("../../lib/push.server", () => ({
  pushDeviceId, pushEndpoint, pushSubscription,
  pushIdentity: identity, activePushPerson: active, savePushDevice: store, removePushDevice: erase, sendPushToDevice: send, PushAccessError: AccessError,
}));
const request = (body: unknown = subscription(), token = "Bearer test-token", signal?: AbortSignal) => new Request("http://localhost/api/push/devices", { method: "POST", headers: { Authorization: token }, body: JSON.stringify(body), signal });
beforeEach(() => {
  vi.resetAllMocks(); enabled.mockReturnValue(true); identity.mockResolvedValue({ email: EMAIL, revoked: false }); active.mockResolvedValue(true); store.mockResolvedValue("device-id"); send.mockResolvedValue("sent");
});
afterEach(() => vi.restoreAllMocks());

describe("flag-gated and authenticated push routes", () => {
  it.each([save, remove, testPush])("returns 404 before reading credentials/body or initializing Admin with the flag off", async (route) => {
    enabled.mockReturnValue(false);
    const input = request();
    const read = vi.spyOn(input, "text").mockRejectedValue(new Error("must not read"));
    expect((await route(input)).status).toBe(404);
    expect(read).not.toHaveBeenCalled(); expect(identity).not.toHaveBeenCalled(); expect(store).not.toHaveBeenCalled();
  });
  it.each(["", "Basic token", "Bearer", "Bearer a b", `Bearer ${"x".repeat(8193)}`])("refuses missing/malformed authentication %#", async (token) => {
    expect((await save(request(subscription(), token))).status).toBe(401); expect(identity).not.toHaveBeenCalled();
  });
  it.each([save, remove, testPush])("refuses invalid tokens and inactive people before touching data", async (route) => {
    identity.mockResolvedValueOnce(null);
    expect((await route(request())).status).toBe(401);
    active.mockResolvedValueOnce(false);
    expect((await route(request())).status).toBe(403);
    expect(store).not.toHaveBeenCalled(); expect(erase).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("a revoked identity can report removed access but can never authorize a request", async () => {
    identity.mockResolvedValue({ email: EMAIL, revoked: true });
    expect((await save(request())).status).toBe(401);
    active.mockResolvedValue(false); expect((await save(request())).status).toBe(403);
    expect(store).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...subscription(), email: EMAIL }, { ...subscription(), endpoint: "x".repeat(9000) }])("rejects malformed or oversized registration %#", async (value) => {
    expect((await save(request(value))).status).toBe(400); expect(store).not.toHaveBeenCalled();
  });
  it.each([remove, testPush])("accepts only this device's endpoint, never an email, message or target id", async (route) => {
    for (const value of [null, [], {}, { endpoint: "" }, { endpoint: subscription().endpoint, email: EMAIL }, { endpoint: subscription().endpoint, title: "spoof" }]) expect((await route(request(value))).status).toBe(400);
    expect(send).not.toHaveBeenCalled(); expect(erase).not.toHaveBeenCalled();
  });
  it("rejects non-JSON without exposing parser details", async () => {
    const input = new Request("http://localhost", { method: "POST", headers: { Authorization: "Bearer token" }, body: "{" });
    expect((await save(input)).status).toBe(400);
  });
  it("confirms saving only after the write, and finishes a received write after the page closes", async () => {
    let finish!: (value: string) => void;
    store.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    let done = false;
    const pending = save(request(subscription(), "Bearer token", controller.signal)).then((response) => { done = true; return response; });
    await vi.waitFor(() => expect(store).toHaveBeenCalledWith(EMAIL, subscription()));
    controller.abort(); expect(done).toBe(false); finish("device-id");
    const response = await pending;
    expect(await response.json()).toEqual({ status: "saved", id: "device-id" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("awaits removal and sends the server's exact test message only to the requesting device", async () => {
    expect(await (await remove(request({ endpoint: subscription().endpoint }))).json()).toEqual({ status: "removed" });
    expect(erase).toHaveBeenCalledWith(EMAIL, subscription().endpoint);
    expect(await (await testPush(request({ endpoint: subscription().endpoint }))).json()).toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledWith(EMAIL, expect.stringMatching(/^[a-f0-9]{64}$/), message);
  });
  it.each([["failed", 503], ["gone", 410], ["missing", 404], ["inactive", 403]])("never claims success after sender result %s", async (result, status) => {
    send.mockResolvedValue(result);
    const response = await testPush(request({ endpoint: subscription().endpoint }));
    expect(response.status).toBe(status); expect(await response.json()).not.toHaveProperty("status", "sent");
  });
  it("does not report a test sent before acceptance", async () => {
    let finish!: (value: string) => void;
    send.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let done = false;
    const pending = testPush(request({ endpoint: subscription().endpoint })).then((r) => { done = true; return r; });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce()); expect(done).toBe(false);
    finish("failed"); expect((await pending).status).toBe(503);
  });
  it.each([save, remove])("reports removal racing a write as 403", async (route) => {
    store.mockRejectedValue(new AccessError()); erase.mockRejectedValue(new AccessError());
    expect((await route(request(route === save ? subscription() : { endpoint: subscription().endpoint }))).status).toBe(403);
  });
  it("reports a failed save and a successful retry without credentials or provider addresses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    store.mockRejectedValueOnce(new Error("secret endpoint/private key")).mockResolvedValueOnce("second");
    // Actual parallel route requests run in push.server.data.test.ts: Vitest's
    // concurrent dynamic imports can bypass a mocked module during resolution.
    const bad = await save(request());
    const good = await save(request(subscription("laptop")));
    expect(identity).toHaveBeenCalledTimes(2);
    expect(bad.status).toBe(503); expect(JSON.stringify(await bad.json())).not.toMatch(/secret|private|endpoint/);
    expect(await good.json()).toEqual({ status: "saved", id: "second" }); expect(log).not.toHaveBeenCalled();
  });
});
