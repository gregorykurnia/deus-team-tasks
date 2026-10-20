"use client";

// Whether the app runs as an installed app, which hides the install entries (guide 3).
import { useSyncExternalStore } from "react";

const STANDALONE = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(STANDALONE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isInstalled() {
  // Safari on iPhone reports a home-screen app through navigator.standalone.
  return window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function useInstalled(): boolean {
  return useSyncExternalStore(subscribe, isInstalled, () => false);
}
