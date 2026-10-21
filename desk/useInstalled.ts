"use client";

// Whether the app runs as an installed app, which hides the install entries (guide 3). Also true from the moment the
// browser reports it installed the app, while this is still a browser tab, remembered on the device (a desktop browser
// sends no install offer for an app it has installed). An install offer arriving later means it was removed again.
import { useSyncExternalStore } from "react";

const STANDALONE = "(display-mode: standalone)";

const KEY = "deus-installed";
let justInstalled = false;
const listeners = new Set<() => void>();

export function markInstalled() {
  justInstalled = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
  listeners.forEach((l) => l());
}

export function forgetInstalled() {
  justInstalled = false;
  try {
    localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function remembered() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
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
  return justInstalled || remembered() || window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function useInstalled(): boolean {
  return useSyncExternalStore(subscribe, isInstalled, () => false);
}
