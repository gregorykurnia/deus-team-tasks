export type NotificationKind = "checking" | "old" | "install" | "blocked" | "off" | "on";
export interface NotificationEnvironment {
  supported: boolean; apple: boolean; needsInstall: boolean; permission: NotificationPermission;
}
export interface DeviceSubscription {
  endpoint: string;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}
export interface NotificationDependencies {
  environment(): NotificationEnvironment;
  permission(): Promise<NotificationPermission>;
  subscription(): Promise<DeviceSubscription | null>;
  create(): Promise<DeviceSubscription>;
  request(email: string, action: "save" | "remove" | "test", subscription: DeviceSubscription): Promise<void>;
  signOut(): Promise<void>;
}
export interface NotificationSnapshot {
  kind: NotificationKind;
  apple: boolean;
  entry: "Checking notifications…" | "Notifications on" | "Notifications off" | "Turn on notifications";
  busy: "check" | "turnOn" | "test" | "signOut" | null;
  error: string;
}
export const initialNotifications: NotificationSnapshot = { kind: "checking", apple: false, entry: "Checking notifications…", busy: null, error: "" };
export class NotificationRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Browser APIs can also stall (for example serviceWorker.ready), so every step is bounded.
export function notificationDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("No answer. Check your connection and try again.")), 15_000);
  })]).finally(() => clearTimeout(timer));
}

// One device, shared by the sheet, account and navigation. A confirmed POST is the only way to show On.
export class NotificationClient {
  private value = initialNotifications;
  private listeners = new Set<() => void>();
  private email: string | null = null;
  private epoch = 0;
  private job: Promise<boolean> | null = null;
  private leaving: Promise<void> | null = null;
  constructor(private deps: NotificationDependencies) {}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<NotificationSnapshot>) {
    this.value = { ...this.value, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private kind(kind: NotificationKind) {
    const environment = this.deps.environment();
    this.publish({ kind, apple: environment.apple, entry: kind === "checking" ? "Checking notifications…" : kind === "on" ? "Notifications on"
      : kind === "blocked" || environment.permission === "granted" ? "Notifications off" : "Turn on notifications" });
  }
  private available(): NotificationKind {
    const env = this.deps.environment();
    return !env.supported ? "old" : env.needsInstall ? "install" : env.permission === "denied" ? "blocked" : "off";
  }
  activate(email: string | null) {
    if (email === this.email) return;
    this.email = email; ++this.epoch;
    this.publish({ ...initialNotifications });
    // Wait for an older identity's work; its result is ignored by the epoch check.
    if (email) void (this.job ?? Promise.resolve()).then(() => this.refresh());
  }
  private run(busy: "check" | "turnOn" | "test", action: (email: string, current: () => boolean) => Promise<void>): Promise<boolean> {
    if (!this.email || this.leaving) return Promise.resolve(false);
    if (this.job) return this.job;
    const email = this.email, epoch = this.epoch;
    const current = () => epoch === this.epoch && email === this.email;
    this.publish({ busy, error: "" });
    const job = (async () => {
      try { await action(email, current); return current(); }
      catch (error) {
        if (!current()) return false;
        // A temporary send failure doesn't undo a confirmed registration. Missing/expired devices do.
        const lost = error instanceof NotificationRequestError && [401, 403, 404, 410].includes(error.status);
        if (busy !== "test" || lost || this.available() !== "off") this.kind(this.available());
        this.publish({ error: error instanceof Error ? error.message : "Couldn’t finish. Try again." });
        if (error instanceof NotificationRequestError && (error.status === 403 || error.status === 401)) {
          // Access removal must also silence this browser, even if its row has already gone.
          const subscription = await notificationDeadline(this.deps.subscription()).catch(() => null);
          if (!current()) return false;
          if (subscription) await notificationDeadline(subscription.unsubscribe()).catch(() => {});
          if (current()) await notificationDeadline(this.deps.signOut()).catch(() => {
            if (current()) this.publish({ error: "Access has been removed. Couldn’t sign out; try again." });
          });
        }
        return false;
      } finally {
        this.job = null;
        if (current()) this.publish({ busy: null });
      }
    })();
    this.job = job;
    return job;
  }
  refresh = () => this.run("check", async (email, current) => {
    const available = this.available();
    this.kind(available);
    if (available !== "off" || this.deps.environment().permission !== "granted") return;
    this.kind("checking");
    const subscription = await notificationDeadline(this.deps.subscription());
    if (!current()) return;
    if (!subscription) { this.kind("off"); return; }
    await notificationDeadline(this.deps.request(email, "save", subscription));
    if (current()) this.kind("on");
  });
  turnOn = () => {
    if (!this.email || this.job || this.leaving || this.available() !== "off") return Promise.resolve(false);
    // Must be called in the click itself, before any asynchronous token or worker lookup.
    let permission: Promise<NotificationPermission>;
    try { permission = this.deps.permission(); } catch { permission = Promise.reject(new Error("Couldn’t ask for permission. Try again.")); }
    return this.run("turnOn", async (email, current) => {
      const granted = await notificationDeadline(permission);
      if (!current()) return;
      if (granted !== "granted") { this.kind(granted === "denied" ? "blocked" : "off"); return; }
      let subscription = await notificationDeadline(this.deps.subscription());
      if (!current()) return;
      if (!subscription) {
        const creation = this.deps.create().then(async (created) => {
          if (!current()) await created.unsubscribe();
          return created;
        });
        subscription = await notificationDeadline(creation);
      }
      if (!current()) return;
      await notificationDeadline(this.deps.request(email, "save", subscription));
      if (current()) this.kind("on");
    });
  };
  sendTest = () => {
    if (this.value.kind !== "on" || this.job) return Promise.resolve(false);
    return this.run("test", async (email, current) => {
      const subscription = await notificationDeadline(this.deps.subscription());
      if (!current()) return;
      if (!subscription) throw new NotificationRequestError("Turn on notifications on this device again.", 404);
      await notificationDeadline(this.deps.request(email, "test", subscription));
    });
  };
  signOut = (): Promise<void> => {
    if (this.leaving) return this.leaving;
    const email = this.email;
    ++this.epoch;
    const pending = this.job;
    this.publish({ busy: "signOut", error: "" });
    const leave = (async () => {
      await pending;
      // Unsubscribe before DELETE or Auth: offline sign-out still stops delivery.
      const subscription = await notificationDeadline(this.deps.subscription());
      if (subscription) {
        await notificationDeadline(subscription.unsubscribe());
        if (email) await notificationDeadline(this.deps.request(email, "remove", subscription)).catch(() => {});
      }
      this.kind(this.available());
      await notificationDeadline(this.deps.signOut());
    })().finally(() => { if (this.leaving === leave) this.leaving = null; this.publish({ busy: null }); });
    this.leaving = leave;
    return leave;
  };
}
