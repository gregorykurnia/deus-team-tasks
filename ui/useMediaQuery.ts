"use client";

// Whether a media query matches, kept up to date as the window turns or resizes. False while the server renders.
import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

// Above the phone layout (guide 3: the side bar from 901px).
export const LARGE_SCREEN = "(min-width: 901px)";
