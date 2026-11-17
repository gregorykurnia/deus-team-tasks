import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void; data?: { json: () => unknown }; notification?: { data?: { url?: unknown }; close: () => void } };
function worker(windows: { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }[] = []) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined), openWindow = vi.fn().mockResolvedValue(null);
  const matchAll = vi.fn().mockResolvedValue(windows);
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    URL, self: { location: { href: "https://deus.invalid/sw.js?v=test", origin: "https://deus.invalid" },
      addEventListener: (name: string, callback: (event: WorkerEvent) => void) => handlers.set(name, callback),
      registration: { showNotification }, clients: { matchAll, openWindow } },
  });
  return { showNotification, openWindow, matchAll,
    async fire(name: string, input: Omit<WorkerEvent, "waitUntil">) {
      let work: Promise<unknown> | undefined;
      expect(handlers.has(name)).toBe(true);
      handlers.get(name)!({ ...input, waitUntil: (promise) => { work = promise; } });
      expect(work).toBeDefined();
      await work;
    },
  };
}
const windowClient = (path: string) => {
  const client = { url: `https://deus.invalid${path}`, focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn() };
  client.navigate.mockResolvedValue(client);
  return client;
};
const notification = (url?: unknown) => ({ data: { url }, close: vi.fn() });

describe("push service worker handlers", () => {
  it("always shows the supplied notification, icon and task URL inside waitUntil", async () => {
    const w = worker();
    await w.fire("push", { data: { json: () => ({ title: "New task for you", body: "Task\nNo deadline", url: "/?task=a%20b" }) } });
    expect(w.showNotification).toHaveBeenCalledExactlyOnceWith("New task for you", { body: "Task\nNo deadline", icon: "/icon-192x192.png", badge: "/icon-192x192.png", data: { url: "https://deus.invalid/?task=a%20b" } });
  });
  it.each([undefined, null, [], "garbage", {}, { title: " ", body: 123 }, { title: 123, url: "javascript:alert(1)" }])("still displays an empty, missing or odd payload %#", async (value) => {
    const w = worker();
    await w.fire("push", value === undefined ? {} : { data: { json: () => value } });
    expect(w.showNotification).toHaveBeenCalledExactlyOnceWith("DEUS Space", expect.objectContaining({ body: "Open DEUS Space to see your tasks.", data: { url: "https://deus.invalid/" } }));
  });
  it("shows a fallback when JSON decoding fails", async () => {
    const w = worker();
    await w.fire("push", { data: { json: () => { throw new Error("not JSON"); } } });
    expect(w.showNotification).toHaveBeenCalledOnce();
  });
  it("focuses an exact matching task window before any other app window", async () => {
    const other = windowClient("/tasks"), exact = windowClient("/?task=abc"), w = worker([other, exact]);
    const notice = notification("/?task=abc");
    await w.fire("notificationclick", { notification: notice });
    expect(notice.close).toHaveBeenCalledOnce(); expect(exact.focus).toHaveBeenCalledOnce();
    expect(other.navigate).not.toHaveBeenCalled(); expect(w.openWindow).not.toHaveBeenCalled();
    expect(w.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
  });
  it("navigates then focuses an app window with the complete person link", async () => {
    const client = windowClient("/"), w = worker([client]);
    await w.fire("notificationclick", { notification: notification("/plan?view=people&person=Audrey%20Wijaya") });
    expect(client.navigate).toHaveBeenCalledWith("https://deus.invalid/plan?view=people&person=Audrey%20Wijaya");
    expect(client.focus).toHaveBeenCalledOnce(); expect(w.openWindow).not.toHaveBeenCalled();
  });
  it("opens the task when there is no app window", async () => {
    const w = worker();
    await w.fire("notificationclick", { notification: notification("/?task=abc") });
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith("https://deus.invalid/?task=abc");
  });
  it("opens the task if finding existing windows fails", async () => {
    const w = worker(); w.matchAll.mockRejectedValue(new Error("windows unavailable"));
    await w.fire("notificationclick", { notification: notification("/?task=abc") });
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith("https://deus.invalid/?task=abc");
  });
  it.each(["https://evil.test/", "//evil.test/", "javascript:alert(1)", undefined, {}])("keeps an unsafe or missing URL on the app %#", async (url) => {
    const w = worker();
    await w.fire("notificationclick", { notification: notification(url) });
    expect(w.openWindow).toHaveBeenCalledWith("https://deus.invalid/");
  });
  it.each(["navigate", "focus"] as const)("recovers if a window closes during %s", async (method) => {
    const client = windowClient("/tasks"), w = worker([client]);
    client[method].mockRejectedValue(new Error("closed"));
    await w.fire("notificationclick", { notification: notification("/?task=abc") });
    expect(w.openWindow).toHaveBeenCalledWith("https://deus.invalid/?task=abc");
  });
  it("does not use a cross-origin client", async () => {
    const client = windowClient("/"); client.url = "https://evil.test/";
    const w = worker([client]);
    await w.fire("notificationclick", { notification: notification("/tasks") });
    expect(client.navigate).not.toHaveBeenCalled(); expect(client.focus).not.toHaveBeenCalled();
    expect(w.openWindow).toHaveBeenCalledWith("https://deus.invalid/tasks");
  });
});
