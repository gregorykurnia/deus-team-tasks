import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ enabled: vi.fn(), today: vi.fn(), send: vi.fn(), emulator: false }));
vi.mock("@/lib/emulator", () => ({ get USE_EMULATOR() { return io.emulator; } }));
vi.mock("@/lib/flags", () => ({ signInEnabled: io.enabled }));
vi.mock("@/lib/followupServer", () => ({ wibToday: io.today }));
vi.mock("@/lib/morningSummary.server", () => ({ sendMorningSummaries: io.send }));
import { GET } from "@/app/api/notify/morning/route";

const request = (authorization?: string, signal?: AbortSignal) => new Request("http://localhost/api/notify/morning", {
  ...(authorization === undefined ? {} : { headers: { Authorization: authorization } }), signal,
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "cron-test-secret");
  io.emulator = false;
  io.enabled.mockReturnValue(true); io.today.mockReturnValue("2026-11-17");
  io.send.mockResolvedValue([{ email: "audrey@deushcs.com", count: 3, status: "sent" }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("morning cron boundary", () => {
  it.each([undefined, "Bearer wrong", "Basic cron-test-secret", "Bearer undefined"])("refuses unauthorized requests before reading data %#", async (authorization) => {
    expect((await GET(request(authorization))).status).toBe(401);
    expect(io.today).not.toHaveBeenCalled(); expect(io.send).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "   "])("refuses an unset/empty secret, including Bearer undefined %#", async (secret) => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(401); expect(io.send).not.toHaveBeenCalled();
  });
  it("stays off without initializing Firebase, even with the right secret", async () => {
    io.enabled.mockReturnValue(false);
    expect((await GET(request("Bearer cron-test-secret"))).status).toBe(404);
    expect(io.today).not.toHaveBeenCalled(); expect(io.send).not.toHaveBeenCalled();
  });
  it.each(["2026-11-21", "2026-11-22"])("skips Jakarta weekend %s without loading the sender", async (today) => {
    io.today.mockReturnValue(today);
    const response = await GET(request("Bearer cron-test-secret"));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ date: today, results: [] });
    expect(io.send).not.toHaveBeenCalled();
  });
  it("returns only the per-person result and prevents caching", async () => {
    const response = await GET(request("Bearer cron-test-secret"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(io.send).toHaveBeenCalledWith("2026-11-17");
    expect(await response.json()).toEqual({ date: "2026-11-17", results: [{ email: "audrey@deushcs.com", count: 3, status: "sent" }] });
  });
  it("pins Tuesday only on the emulator, even when the actual day is a weekend", async () => {
    io.emulator = true; vi.stubEnv("MORNING_TEST_DATE", "2026-11-17"); io.today.mockReturnValue("2026-11-22");
    expect(await (await GET(request("Bearer cron-test-secret"))).json()).toHaveProperty("date", "2026-11-17");
    expect(io.send).toHaveBeenCalledWith("2026-11-17");
  });
  it.each([undefined, "", "2026-02-30", "Tuesday"])("ignores an invalid emulator day %s", async (day) => {
    io.emulator = true; vi.stubEnv("MORNING_TEST_DATE", day);
    expect(await (await GET(request("Bearer cron-test-secret"))).json()).toHaveProperty("date", "2026-11-17");
    expect(io.today).toHaveBeenCalled();
  });
  it("ignores the test clock outside the emulator", async () => {
    vi.stubEnv("MORNING_TEST_DATE", "2026-11-17"); io.today.mockReturnValue("2026-11-22");
    expect(await (await GET(request("Bearer cron-test-secret"))).json()).toEqual({ date: "2026-11-22", results: [] });
    expect(io.send).not.toHaveBeenCalled();
  });
  it("waits for delivery after the requester closes and reports failures truthfully", async () => {
    let finish!: (value: object[]) => void;
    io.send.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController(); let done = false;
    const pending = GET(request("Bearer cron-test-secret", controller.signal)).then((response) => { done = true; return response; });
    await vi.waitFor(() => expect(io.send).toHaveBeenCalledOnce()); controller.abort(); expect(done).toBe(false);
    finish([{ email: "audrey@deushcs.com", count: 3, status: "failed" }]); expect((await pending).status).toBe(503);
    io.send.mockRejectedValueOnce(new Error("private task name, endpoint and secret"));
    const failed = await GET(request("Bearer cron-test-secret")); expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private");
  });
  it("schedules only weekday 02:00 UTC calls (09:00 Jakarta)", () => {
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).crons).toEqual([{ path: "/api/notify/morning", schedule: "0 2 * * 1-5" }]);
  });
});
