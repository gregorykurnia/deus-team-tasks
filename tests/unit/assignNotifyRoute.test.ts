import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ enabled: vi.fn(), dispatch: vi.fn(), identity: vi.fn(), active: vi.fn() }));
vi.mock("@/lib/flags", () => ({ signInEnabled: io.enabled }));
vi.mock("@/lib/assignNotifyDispatch.server", () => ({ notifyAssignments: io.dispatch }));
vi.mock("@/lib/push.server", () => ({ pushIdentity: io.identity, activePushPerson: io.active }));
import { POST } from "@/app/api/notify/assigned/route";
const request = (body: unknown = { taskIds: ["task"] }, token?: string, signal?: AbortSignal) => new Request("http://localhost/api/notify/assigned", {
  method: "POST", body: JSON.stringify(body), ...(token === undefined ? {} : { headers: { Authorization: token } }), signal,
});
beforeEach(() => {
  vi.resetAllMocks(); io.enabled.mockReturnValue(true); io.dispatch.mockResolvedValue([{ taskId: "task", status: "processed" }]);
  io.identity.mockResolvedValue({ email: "audrey@deushcs.com", revoked: false }); io.active.mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());
describe("assignment route", () => {
  it("returns 404 before reading a body or initializing credentials with the flag off", async () => {
    io.enabled.mockReturnValue(false); const input = request(); const body = vi.spyOn(input, "text").mockRejectedValue(new Error());
    expect((await POST(input)).status).toBe(404); expect(body).not.toHaveBeenCalled(); expect(io.dispatch).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { taskIds: [] }, { taskIds: ["../task"] }, { taskIds: ["x".repeat(1501)] }, { taskIds: [null] },
    { taskIds: Array(51).fill("task") }, { taskIds: ["task"], email: "spoof" }, { taskIds: ["task"], notified: ["Audrey"] }])("rejects invalid or forged input %#", async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(io.dispatch).not.toHaveBeenCalled();
  });
  it("accepts only IDs from unsigned requests, deduplicating before dispatch", async () => {
    const response = await POST(request({ taskIds: ["task", "task"] }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(io.dispatch).toHaveBeenCalledWith(["task"], undefined); expect(io.identity).not.toHaveBeenCalled();
  });
  it("uses only the server-verified active identity for self suppression", async () => {
    expect((await POST(request(undefined, "Bearer token"))).status).toBe(200);
    expect(io.dispatch).toHaveBeenCalledWith(["task"], "audrey@deushcs.com");
  });
  it.each(["", "Basic token", "Bearer a b", `Bearer ${"a".repeat(8193)}`])("refuses malformed optional credentials %#", async (token) => {
    expect((await POST(request(undefined, token))).status).toBe(401); expect(io.dispatch).not.toHaveBeenCalled();
  });
  it("refuses an invalid identity", async () => {
    io.identity.mockResolvedValueOnce(null); expect((await POST(request(undefined, "Bearer token"))).status).toBe(401);
    expect(io.dispatch).not.toHaveBeenCalled();
  });
  it("still tells the others when a revoked or removed sender saved the task, never the sender", async () => {
    io.identity.mockResolvedValueOnce({ email: "sam@deushcs.com", revoked: true });
    expect((await POST(request(undefined, "Bearer token"))).status).toBe(200);
    io.identity.mockResolvedValueOnce({ email: "sam@deushcs.com", revoked: false }); io.active.mockResolvedValue(false);
    expect((await POST(request(undefined, "Bearer token"))).status).toBe(200);
    expect(io.dispatch.mock.calls).toEqual([[["task"], "sam@deushcs.com"], [["task"], "sam@deushcs.com"]]);
  });
  it("awaits processing even when the received request's page closes", async () => {
    let finish!: (value: object[]) => void;
    io.dispatch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController(); let done = false;
    const pending = POST(request(undefined, undefined, controller.signal)).then((r) => { done = true; return r; });
    await vi.waitFor(() => expect(io.dispatch).toHaveBeenCalledOnce()); controller.abort(); expect(done).toBe(false);
    finish([{ taskId: "task", status: "processed" }]); expect((await pending).status).toBe(200);
  });
  it("reports unconfirmed work as failed without claiming delivery or exposing errors", async () => {
    io.dispatch.mockResolvedValueOnce([{ taskId: "task", status: "failed" }]); expect((await POST(request())).status).toBe(503);
    io.dispatch.mockRejectedValueOnce(new Error("private endpoint")); const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
