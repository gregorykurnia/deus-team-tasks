import { afterEach, describe, expect, it, vi } from "vitest";
import { assertOnline, getConnection, OfflineError, reportSnapshot, resetConnection } from "@/lib/connection";

function setBrowserOnline(online: boolean) {
  vi.stubGlobal("navigator", { onLine: online });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetConnection();
});

describe("connection (A3, guide 5.8)", () => {
  it("is online while the browser is, before any data arrives", () => {
    setBrowserOnline(true);
    resetConnection();
    expect(getConnection().online).toBe(true);
    expect(() => assertOnline()).not.toThrow();
  });

  it("refuses writes when the browser is offline, saying what wasn't saved", () => {
    setBrowserOnline(false);
    expect(() => assertOnline("No connection. The task wasn't added.")).toThrow(OfflineError);
    expect(() => assertOnline("No connection. The task wasn't added.")).toThrow("No connection. The task wasn't added.");
  });

  it("goes offline when every source that reached the server falls back to the device's copy", () => {
    setBrowserOnline(true);
    reportSnapshot("tasks", true); // the device's copy at start: still connecting, not offline
    expect(getConnection().online).toBe(true);
    reportSnapshot("tasks", false, 1000);
    reportSnapshot("companies", false, 2000);
    expect(getConnection()).toEqual({ online: true, loadedAt: 2000 });
    reportSnapshot("tasks", true);
    expect(getConnection().online).toBe(true); // companies still live
    reportSnapshot("companies", true);
    expect(getConnection()).toEqual({ online: false, loadedAt: 2000 });
    expect(() => assertOnline()).toThrow(OfflineError);
    reportSnapshot("companies", false, 3000);
    expect(getConnection()).toEqual({ online: true, loadedAt: 3000 });
  });
});
