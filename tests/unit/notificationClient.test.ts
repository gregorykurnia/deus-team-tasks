import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationClient, NotificationRequestError, type NotificationDependencies, type NotificationEnvironment } from "@/lib/notificationClient";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(environment: Partial<NotificationEnvironment> = {}) {
  const env: NotificationEnvironment = { supported: true, apple: false, needsInstall: false, permission: "default", ...environment };
  const subscription = { endpoint: "https://web.push.apple.com/test", toJSON: () => ({ endpoint: "https://web.push.apple.com/test" }), unsubscribe: vi.fn(async () => true) };
  const deps = {
    environment: () => env,
    permission: vi.fn(async (): Promise<NotificationPermission> => (env.permission = "granted")),
    subscription: vi.fn(async (): Promise<typeof subscription | null> => null),
    create: vi.fn(async () => { deps.subscription.mockResolvedValue(subscription); return subscription; }),
    request: vi.fn<NotificationDependencies["request"]>(async () => {}), signOut: vi.fn(async () => {}),
  };
  const client = new NotificationClient(deps);
  return { client, deps, env, subscription };
}
async function active(fixture: ReturnType<typeof setup>) {
  fixture.client.activate("audrey.wijaya@deushcs.com");
  await Promise.resolve(); await fixture.client.refresh();
}
afterEach(() => vi.useRealTimers());

describe("one device's notification lifecycle", () => {
  it.each([
    [{ supported: false, needsInstall: true, permission: "denied" }, "old"],
    [{ needsInstall: true, permission: "denied" }, "install"],
    [{ permission: "denied" }, "blocked"],
    [{}, "off"],
  ] as const)("chooses the required priority for %j", async (env, kind) => {
    const f = setup(env); await active(f);
    expect(f.client.snapshot().kind).toBe(kind); expect(f.deps.request).not.toHaveBeenCalled();
  });
  it("requests permission in the tap, deduplicates presses, and waits for server confirmation", async () => {
    const f = setup(); await active(f);
    const save = deferred<void>(); f.deps.request.mockReturnValue(save.promise);
    const first = f.client.turnOn();
    expect(f.deps.permission).toHaveBeenCalledOnce();
    await f.client.turnOn(); await vi.waitFor(() => expect(f.deps.request).toHaveBeenCalledOnce());
    expect(f.client.snapshot().kind).toBe("off");
    save.resolve(); expect(await first).toBe(true);
    expect(f.client.snapshot().entry).toBe("Notifications on"); expect(f.deps.create).toHaveBeenCalledOnce();
  });
  it("retries after a save landed but its reply was lost, reusing the existing subscription", async () => {
    const f = setup(); await active(f);
    f.deps.request.mockRejectedValueOnce(new Error("No answer"));
    expect(await f.client.turnOn()).toBe(false); expect(f.client.snapshot().kind).toBe("off");
    expect(f.client.snapshot().error).toBe("No answer");
    expect(await f.client.turnOn()).toBe(true); expect(f.deps.create).toHaveBeenCalledOnce();
    expect(f.deps.request.mock.calls.map((call) => call[2].endpoint)).toEqual([f.subscription.endpoint, f.subscription.endpoint]);
  });
  it("a missing subscription is off; a reload/resume resaves the same device before On", async () => {
    const f = setup({ permission: "granted" }); await active(f);
    expect(f.client.snapshot().kind).toBe("off");
    f.deps.subscription.mockResolvedValue(f.subscription);
    await f.client.refresh(); await f.client.refresh();
    expect(f.deps.request.mock.calls.map((call) => call[1])).toEqual(["save", "save"]);
    expect(f.client.snapshot().kind).toBe("on");
  });
  it("blocked Check again rereads permission and can recover", async () => {
    const f = setup({ permission: "denied" }); await active(f);
    f.env.permission = "granted"; f.deps.subscription.mockResolvedValue(f.subscription);
    await f.client.refresh(); expect(f.client.snapshot().kind).toBe("on");
  });
  it("denying the permission prompt switches to blocked without saving a device", async () => {
    const f = setup(); await active(f);
    f.deps.permission.mockImplementation(async () => (f.env.permission = "denied"));
    await f.client.turnOn();
    expect(f.client.snapshot().kind).toBe("blocked"); expect(f.deps.create).not.toHaveBeenCalled();
    expect(f.deps.request).not.toHaveBeenCalled();
  });
  it("a temporary test-send failure keeps the confirmed device On and offers the same retry", async () => {
    const f = setup({ permission: "granted" }); f.deps.subscription.mockResolvedValue(f.subscription); await active(f);
    f.deps.request.mockRejectedValueOnce(new NotificationRequestError("Try again shortly.", 503));
    expect(await f.client.sendTest()).toBe(false); expect(f.client.snapshot().kind).toBe("on");
    expect(await f.client.sendTest()).toBe(true);
  });
  it("test failure is visible, never reports success, and retries once", async () => {
    const f = setup({ permission: "granted" }); f.deps.subscription.mockResolvedValue(f.subscription); await active(f);
    f.deps.request.mockRejectedValueOnce(new NotificationRequestError("Turn on notifications on this device again.", 410));
    expect(await f.client.sendTest()).toBe(false); expect(f.client.snapshot().kind).toBe("off");
    expect(f.client.snapshot().error).toContain("again");
    await f.client.turnOn(); expect(await f.client.sendTest()).toBe(true);
  });
  it("times out a request with no answer and releases busy for a retry", async () => {
    const f = setup(); await active(f); vi.useFakeTimers();
    f.deps.request.mockReturnValueOnce(new Promise(() => {}));
    const first = f.client.turnOn(); await vi.advanceTimersByTimeAsync(15_001);
    expect(await first).toBe(false); expect(f.client.snapshot().busy).toBeNull();
    expect(f.client.snapshot().kind).toBe("off"); expect(await f.client.turnOn()).toBe(true);
  });
  it("sign-out waits for an overlapping save, unsubscribes before DELETE, and ignores the late On", async () => {
    const f = setup(); await active(f); const save = deferred<void>();
    const order: string[] = [];
    f.deps.request.mockImplementation(async (_email, action) => { order.push(action); if (action === "save") await save.promise; });
    f.subscription.unsubscribe.mockImplementation(async () => { order.push("unsubscribe"); return true; });
    f.deps.signOut.mockImplementation(async () => { order.push("signOut"); });
    const first = f.client.turnOn(); await vi.waitFor(() => expect(order).toEqual(["save"]));
    const leaving = f.client.signOut(); expect(f.client.signOut()).toBe(leaving);
    expect(await f.client.turnOn()).toBe(false); save.resolve(); await first; await leaving;
    expect(order).toEqual(["save", "unsubscribe", "remove", "signOut"]);
    expect(f.client.snapshot().kind).not.toBe("on");
  });
  it("offline DELETE failure still signs out after unsubscribing; unsubscribe failure keeps a retry", async () => {
    const f = setup({ permission: "granted" }); f.deps.subscription.mockResolvedValue(f.subscription); await active(f);
    f.subscription.unsubscribe.mockRejectedValueOnce(new Error("browser busy"));
    await expect(f.client.signOut()).rejects.toThrow("browser busy"); expect(f.deps.signOut).not.toHaveBeenCalled();
    f.deps.request.mockRejectedValue(new Error("offline"));
    await f.client.signOut(); expect(f.deps.signOut).toHaveBeenCalledOnce();
    expect(f.subscription.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it("403 silences the browser and signs out instead of claiming On", async () => {
    const f = setup({ permission: "granted" }); f.deps.subscription.mockResolvedValue(f.subscription);
    f.deps.request.mockRejectedValue(new NotificationRequestError("Access has been removed.", 403)); await active(f);
    expect(f.client.snapshot().kind).not.toBe("on"); expect(f.subscription.unsubscribe).toHaveBeenCalled();
    expect(f.deps.signOut).toHaveBeenCalled();
  });
  it("changing identities discards a late save without overwriting the new session", async () => {
    const f = setup(); await active(f); const save = deferred<void>(); f.deps.request.mockReturnValueOnce(save.promise);
    const turnOn = f.client.turnOn(); await vi.waitFor(() => expect(f.deps.request).toHaveBeenCalledOnce());
    f.client.activate(null); save.resolve(); expect(await turnOn).toBe(false);
    expect(f.client.snapshot().entry).toBe("Checking notifications…");
  });
  it("a subscription created after leaving is immediately unsubscribed and never saved", async () => {
    const f = setup(); await active(f); const creation = deferred<typeof f.subscription>(); f.deps.create.mockReturnValue(creation.promise);
    const turnOn = f.client.turnOn(); await vi.waitFor(() => expect(f.deps.create).toHaveBeenCalledOnce());
    f.client.activate(null); creation.resolve(f.subscription); await turnOn;
    expect(f.subscription.unsubscribe).toHaveBeenCalledOnce(); expect(f.deps.request).not.toHaveBeenCalled();
  });
});
