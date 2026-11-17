import type { Page } from "@playwright/test";
import { subscription } from "./push";

declare global {
  interface Window {
    notificationMock: { permission: NotificationPermission; askedFromTap: boolean; subscriptions: number; unsubscribed: number };
  }
}

// Only the browser push APIs are fake. Auth, device saves and the sender use the real local routes/emulators.
export async function notificationBrowser(page: Page, options: { apple?: boolean; standalone?: boolean; old?: boolean; permission?: NotificationPermission } = {}) {
  await page.addInitScript(({ options, raw }) => {
    const state = {
      get permission() { return (localStorage.getItem("a5-permission") || options.permission || "default") as NotificationPermission; },
      set permission(value: NotificationPermission) { localStorage.setItem("a5-permission", value); },
      askedFromTap: false, subscriptions: 0, unsubscribed: 0,
    };
    window.notificationMock = state;
    if (options.apple) {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: `Mozilla/5.0 (iPhone; CPU iPhone OS ${options.old ? "16_3" : "18_0"} like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1` });
      Object.defineProperty(navigator, "standalone", { configurable: true, value: !!options.standalone });
      // A remembered install in Safari must still show the Home Screen instructions.
      localStorage.setItem("deus-installed", "1");
    }
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => state.permission });
    Notification.requestPermission = async () => { state.askedFromTap = navigator.userActivation.isActive; state.permission = "granted"; return "granted"; };
    const existing = () => {
      if (!localStorage.getItem("a5-subscription")) return null;
      return {
        endpoint: raw.endpoint, toJSON: () => raw,
        unsubscribe: async () => { state.unsubscribed++; localStorage.removeItem("a5-subscription"); return true; },
      };
    };
    const registration = { pushManager: {
      getSubscription: async () => existing(),
      subscribe: async (settings: PushSubscriptionOptionsInit) => {
        if (!settings.userVisibleOnly || !(settings.applicationServerKey instanceof Uint8Array) || settings.applicationServerKey.byteLength !== 65) throw new Error("Invalid subscription options");
        state.subscriptions++; localStorage.setItem("a5-subscription", "1"); return existing();
      },
    } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
      getRegistration: async () => registration, getRegistrations: async () => [], ready: Promise.resolve(registration),
    } });
  }, { options, raw: subscription() });
}
