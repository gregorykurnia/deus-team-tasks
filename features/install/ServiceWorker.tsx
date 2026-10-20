"use client";

// The service worker keeps the app's pages and files on the device, so it opens with no connection (A3). It is
// registered in production only: in development it would serve old files. The build id in its address gives every
// build its own cache (see public/sw.js), and anything left from an earlier run in development is removed.
import { useEffect } from "react";
import { listenForInstallOffer } from "./installPrompt";

export default function ServiceWorker() {
  useEffect(() => {
    listenForInstallOffer();
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then((keys) => keys.filter((k) => k.startsWith("deus-")).forEach((k) => caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev")}`).catch(() => {});
  }, []);
  return null;
}
