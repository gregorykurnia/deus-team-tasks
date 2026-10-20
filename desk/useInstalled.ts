"use client";

// Whether the app runs as an installed app, which hides the install entries (guide 3). Also true from the moment the
// browser reports it just installed the app, while this tab is still a browser tab.
import { useSyncExternalStore } from "react";

const STANDALONE = "(display-mode: standalone)";

let justInstalled = false;
const listeners = new Set<() => void>();

export function markInstalled() {
  justInstalled = true;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(STANDALONE);
  media.addEventListener("change", onChange);
  listeners.add(onChange);
  return () => {
    media.removeEventListener("change", onChange);
    listeners.delete(onChange);
  };
}

function isInstalled() {
  // Safari on iPhone reports a home-screen app through navigator.standalone.
  return justInstalled || window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function useInstalled(): boolean {
  return useSyncExternalStore(subscribe, isInstalled, () => false);
}
