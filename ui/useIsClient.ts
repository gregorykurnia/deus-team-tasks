"use client";

// False while the server renders and during hydration, true in the browser after. Overlays render into
// document.body, so they wait for it.
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
