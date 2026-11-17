"use client";

import { useSyncExternalStore } from "react";
import { needsHomeScreen } from "@/features/sign-in/HomeScreenSteps";
import { NotificationClient, NotificationRequestError, initialNotifications, notificationDeadline } from "./notificationClient";

export const notifications = new NotificationClient({
  environment() {
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const version = apple && /(?:OS |Version\/)(\d+)[._](\d+)/.exec(navigator.userAgent);
    const old = !!version && (Number(version[1]) < 16 || Number(version[1]) === 16 && Number(version[2]) < 4);
    return {
      apple, supported: "PushManager" in window && "Notification" in window && "serviceWorker" in navigator && !old,
      needsInstall: !!needsHomeScreen(), permission: "Notification" in window ? Notification.permission : "default",
    };
  },
  permission: () => Notification.requestPermission(),
  async subscription() {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.pushManager ? registration.pushManager.getSubscription() : null;
  },
  async create() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) throw new Error("Notifications aren’t set up yet. Try again later.");
    // Production registers the worker at app startup; never wait forever for an absent worker.
    const registration = await notificationDeadline(navigator.serviceWorker.ready);
    const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  },
  async request(email, action, subscription) {
    const { clientAuth } = await import("./authClient");
    const user = clientAuth.currentUser;
    if (!user || user.uid !== email) throw new NotificationRequestError("Sign in again to turn on notifications.", 401);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14_000);
    try {
      const token = await notificationDeadline(user.getIdToken());
      const response = await fetch(action === "test" ? "/api/push/test" : "/api/push/devices", {
        method: action === "remove" ? "DELETE" : "POST", keepalive: true, signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? subscription.toJSON() : { endpoint: subscription.endpoint }),
      });
      const answer = await response.json();
      if (!response.ok) throw new NotificationRequestError(answer.error || "Couldn’t finish. Try again.", response.status);
      if (answer.status !== (action === "save" ? "saved" : action === "remove" ? "removed" : "sent")) throw new Error("Couldn’t confirm. Try again.");
    } catch (error) {
      if (error instanceof NotificationRequestError) throw error;
      throw new Error(action === "save" ? "We couldn’t confirm notifications were turned on. Check your connection and try again."
        : action === "test" ? "We couldn’t confirm the test was sent. Try again." : "Couldn’t remove this device.");
    } finally { clearTimeout(timer); }
  },
  async signOut() {
    const [{ signOut }, { clientAuth }] = await Promise.all([import("firebase/auth"), import("./authClient")]);
    await signOut(clientAuth);
  },
});

export function useNotifications() {
  return useSyncExternalStore(notifications.subscribe, notifications.snapshot, () => initialNotifications);
}

export async function afterSignInNotifications(next: string, email: string): Promise<string> {
  notifications.activate(email);
  await notifications.refresh();
  const state = notifications.snapshot();
  if (state.kind !== "off" && state.kind !== "install") return next;
  // Arrive with the sheet already in the URL, so dismissing it preserves the return screen.
  const url = new URL(next, "https://deus.invalid");
  for (const name of ["account", "more", "install"]) url.searchParams.delete(name);
  url.searchParams.set("notifications", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}
