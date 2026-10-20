"use client";

// The browser's own install offer (Chrome, Edge and others), kept from the moment it arrives so the Install button
// can use it later. Safari on iPhone never sends one: it gets steps instead (guide 6.9).
import { useSyncExternalStore } from "react";
import { markInstalled } from "@/desk/useInstalled";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let listening = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Called once from the root layout, early, because the browser sends the offer only once.
export function listenForInstallOffer() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    markInstalled();
    emit();
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useCanPrompt(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false);
}

// Shows the browser's install dialog. The offer is single use, so it is spent either way.
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const offer = deferred;
  if (!offer) return "unavailable";
  deferred = null;
  emit();
  try {
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    if (outcome === "accepted") markInstalled();
    return outcome;
  } catch {
    return "unavailable";
  }
}

// iPhone and iPad, including an iPad that reports itself as a Mac.
export function isAppleTouchDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
