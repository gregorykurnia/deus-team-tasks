"use client";

// The browser's own install offer (Chrome, Edge and others), kept from the moment it arrives so the Install button
// can use it later. Safari on iPhone never sends one: it gets steps instead (guide 6.9).
import { useSyncExternalStore } from "react";
import { forgetInstalled, markInstalled } from "@/desk/useInstalled";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let spent = false; // the offer was used and the browser's dialog closed without installing
let listening = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// An offer sent before the app was ready is caught by the root layout's first script (EARLY_SCRIPT) and waits on window.
const EARLY = "__deusInstallOffer";

// Called once from the root layout, early, because the browser sends the offer only once.
export function listenForInstallOffer() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const early = (window as unknown as Record<string, InstallPromptEvent | undefined>)[EARLY];
  if (early) {
    deferred = early;
    forgetInstalled(); // the browser offers to install, so it isn't installed here (any more)
    emit();
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    spent = false;
    forgetInstalled();
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

export function useOfferSpent(): boolean {
  return useSyncExternalStore(subscribe, () => spent, () => false);
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
    else spent = true;
    emit();
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
