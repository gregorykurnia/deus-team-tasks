import { describe, expect, it, vi } from "vitest";
import { groupHref } from "@/desk/areas";
import { captureFailed, captureUserAgent, openCapturePage } from "../../scripts/compare/capture.mjs";
import { recipe } from "../../scripts/compare/recipes.mjs";
import { protoData } from "../../scripts/compare/seed.mjs";
import { parseMap, plan } from "../../scripts/compare/states.mjs";
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
    [404, "HTTP 404"],
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

  it.each([
    ["049-task-groups-q4-planning", "q4"],
    ["056-task-groups-rename", "office"],
    ["057-task-groups-delete", "office"],
  ])("uses the seeded group route for %s", (id, groupId) => {
    const entry = parseMap().find((entry) => entry.id === id);
    expect(entry).toBeDefined();
    const state = plan(entry);
    const db = protoData(false);
    expect(recipe(state, { db }).path).toBe(groupHref(groupId));

    const withoutGroup = { ...db, groups: db.groups.filter((group: { id: string }) => group.id !== groupId) };
    expect(() => recipe(state, { db: withoutGroup })).toThrow(`No seeded task group with ID "${groupId}"`);
  });
});
