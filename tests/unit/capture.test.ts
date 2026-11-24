import { describe, expect, it, vi } from "vitest";
import { captureFailed, captureUserAgent, openCapturePage } from "../../scripts/compare/capture.mjs";
import { isRenderingCrawler } from "@/lib/crawlers";

const url = "http://localhost:3100/plan";

describe("local browser captures", () => {
  it("uses the smoke browser's identity and preserves the iPhone install state", () => {
    const chrome = captureUserAgent(false);
    const iphone = captureUserAgent(true);
    expect(chrome).toContain("Chrome/");
    expect(iphone).toContain("iPhone");
    expect([chrome, iphone].map(isRenderingCrawler)).toEqual([false, false]);
    expect(isRenderingCrawler("HeadlessChrome")).toBe(true);
  });

  it.each([
    [403, "HTTP 403"],
    [500, "HTTP 500"],
    [null, "no HTTP response"],
  ])("ends a failed %s navigation and allows a fresh capture", async (status, message) => {
    const close = vi.fn();
    const blocked = { goto: vi.fn().mockResolvedValue(status === null ? null : { ok: () => false, status: () => status }), context: () => ({ close }) };
    await expect(openCapturePage(blocked, url)).rejects.toThrow(message);
    expect(close).toHaveBeenCalledOnce();

    const fresh = { goto: vi.fn().mockResolvedValue({ ok: () => true }), context: () => ({ close: vi.fn() }) };
    await expect(openCapturePage(fresh, url)).resolves.toBeUndefined();
    expect(fresh.goto).toHaveBeenCalledWith(url);
  });

  it("closes the context when navigation throws", async () => {
    const close = vi.fn();
    const timeout = new Error("navigation timed out");
    const page = { goto: vi.fn().mockRejectedValue(timeout), context: () => ({ close }) };
    await expect(openCapturePage(page, url)).rejects.toBe(timeout);
    expect(close).toHaveBeenCalledOnce();
  });

  it("fails comparison entries that report a capture or runtime error", () => {
    expect(captureFailed({ failed: "HTTP 403" })).toBe(true);
    expect(captureFailed({ errors: ["never went live"] })).toBe(true);
    expect(captureFailed({ errors: [] })).toBe(false);
  });
});
