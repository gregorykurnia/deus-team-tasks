import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOnline,
  CONNECT_GRACE_MS,
  forgetSource,
  getConnection,
  OfflineError,
  reportSnapshot,
  subscribeConnection,
  resetConnection,
  watchSource,
} from "@/lib/connection";

function setBrowserOnline(online: boolean) {
  vi.stubGlobal("navigator", { onLine: online });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetConnection();
  vi.useRealTimers();
});

describe("connection (A3, guide 5.8)", () => {
  it("is online while the browser is, before any source opens", () => {
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
    expect(getConnection().status).toBe("connecting");
    reportSnapshot("tasks", false, 1000);
    reportSnapshot("companies", false, 2000);
    expect(getConnection()).toEqual({ status: "live", online: true, loadedAt: 2000 });
    reportSnapshot("tasks", true);
    expect(getConnection().online).toBe(true); // companies still live
    reportSnapshot("companies", true);
    expect(getConnection()).toEqual({ status: "offline", online: false, loadedAt: 2000 });
    expect(() => assertOnline()).toThrow(OfflineError);
    reportSnapshot("companies", false, 3000);
    expect(getConnection()).toEqual({ status: "live", online: true, loadedAt: 3000 });
  });

  it("forgets a source whose subscription closed, so it can't keep the app counted as online", () => {
    setBrowserOnline(true);
    reportSnapshot("tasks", false, 1000);
    reportSnapshot("flows", false, 2000);
    forgetSource("flows"); // the flows screen closed its subscription
    reportSnapshot("tasks", true);
    expect(getConnection().online).toBe(false);
  });

  it("refuses writes while connecting, and turns offline when no source reaches the server in time", () => {
    vi.useFakeTimers();
    setBrowserOnline(true);
    watchSource("tasks"); // a cold start with the server unreachable: no snapshot can "fall back"
    reportSnapshot("tasks", true);
    expect(getConnection().status).toBe("connecting");
    expect(() => assertOnline()).toThrow(OfflineError);
    const seen: string[] = [];
    const listener = () => seen.push(getConnection().status);
    vi.advanceTimersByTime(CONNECT_GRACE_MS - 1);
    expect(getConnection().status).toBe("connecting");
    // The timer tells listeners on its own, with no snapshot or browser event.
    const stop = subscribeConnection(listener);
    vi.advanceTimersByTime(1);
    stop();
    expect(seen).toEqual(["offline"]);
    expect(getConnection().online).toBe(false);
    reportSnapshot("tasks", false, Date.now());
    expect(getConnection().status).toBe("live");
  });

  it("starts a new wait when every source closed and new ones open", () => {
    vi.useFakeTimers();
    setBrowserOnline(true);
    watchSource("flows");
    vi.advanceTimersByTime(CONNECT_GRACE_MS);
    expect(getConnection().status).toBe("offline");
    forgetSource("flows");
    expect(getConnection().status).toBe("live"); // no sources: the browser's flag alone
    watchSource("tasks");
    expect(getConnection().status).toBe("connecting");
  });
});
