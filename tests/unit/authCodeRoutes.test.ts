import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as requestCode } from "../../app/api/auth/code/route";
import { POST as verifyCode } from "../../app/api/auth/verify/route";

const { enabled, send, verify } = vi.hoisted(() => ({ enabled: vi.fn(), send: vi.fn(), verify: vi.fn() }));
vi.mock("../../lib/flags", () => ({ signInEnabled: enabled }));
vi.mock("../../lib/signInCodes.server", () => ({ requestSignInCode: send, verifySignInCode: verify }));
const EMAIL = "audrey.wijaya@deushcs.com";
const request = (body: unknown) => new Request("http://localhost/api/auth/code", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); enabled.mockReturnValue(true); });
afterEach(() => vi.unstubAllEnvs());

describe("flag-gated code routes", () => {
  it.each([requestCode, verifyCode])("returns 404 before reading input or loading secrets when disabled", async (route) => {
    enabled.mockReturnValue(false);
    vi.stubEnv("FIREBASE_ADMIN_KEY", "");
    vi.stubEnv("CODE_SECRET", "");
    const input = request(null);
    const read = vi.spyOn(input, "text").mockRejectedValue(new Error("must not read"));
    const response = await route(input);
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { email: 1 }, { email: EMAIL, extra: true }, { email: "x".repeat(1100) }])("refuses malformed code request %j", async (body) => {
    expect((await requestCode(request(body))).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses non-JSON, missing/numeric codes and extra verify fields", async () => {
    expect((await requestCode(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    for (const body of [{ email: EMAIL }, { email: EMAIL, code: 123456 }, { email: EMAIL, code: "123456", extra: 1 }]) {
      expect((await verifyCode(request(body))).status).toBe(400);
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns sent only after the mail operation settles, and carries safe reasons and retry headers", async () => {
    let finish!: (value: { status: string }) => void;
    send.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let done = false;
    const pending = requestCode(request({ email: EMAIL })).then((response) => { done = true; return response; });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(EMAIL));
    expect(done).toBe(false);
    finish({ status: "sent" });
    const sent = await pending;
    expect(await sent.json()).toEqual({ status: "sent" });
    expect(sent.headers.get("cache-control")).toBe("no-store");
    for (const answer of [{ status: "wrongDomain" }, { status: "notAdded" }, { status: "wait", seconds: 31 }, { status: "tooMany", minutes: 15 }]) {
      send.mockResolvedValue(answer);
      const response = await requestCode(request({ email: EMAIL }));
      expect(response.status).toBe("seconds" in answer || "minutes" in answer ? 429 : 200);
      expect(await response.json()).toEqual(answer);
      if ("seconds" in answer) expect(response.headers.get("retry-after")).toBe("31");
      if ("minutes" in answer) expect(response.headers.get("retry-after")).toBe("900");
    }
  });

  it("returns only the custom token or verify reason, without caching", async () => {
    for (const answer of [{ token: "custom-token" }, { status: "wrong", triesLeft: 4 }, { status: "expired" }, { status: "noCode" }, { status: "tooMany", minutes: 5 }]) {
      verify.mockResolvedValue(answer);
      const response = await verifyCode(request({ email: EMAIL, code: "001234" }));
      expect(verify).toHaveBeenCalledWith(EMAIL, "001234");
      expect(await response.json()).toEqual(answer);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it.each([requestCode, verifyCode])("reports an unavailable service without logging or echoing secrets", async (route) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("SMTP password and code 001234"));
    verify.mockRejectedValue(new Error("private key and token"));
    const response = await route(request(route === requestCode ? { email: EMAIL } : { email: EMAIL, code: "001234" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", error: "We couldn’t finish that request. Try again shortly." });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
