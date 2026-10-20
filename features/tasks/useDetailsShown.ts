"use client";

// The details shown on All tasks, kept on this device (guide 5.6). The server and the first paint use the default; what
// was saved takes over right after, and a change in another tab of the app follows.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { COLUMNS_STORAGE_KEY, parseColumns, type ColumnId } from "@/lib/taskColumns";

const listeners = new Set<() => void>();
let unsaved: string | null = null; // what was chosen while storage is blocked: kept for this visit only

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => e.key === COLUMNS_STORAGE_KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function read(): string | null {
  try {
    return window.localStorage.getItem(COLUMNS_STORAGE_KEY);
  } catch {
    return unsaved;
  }
}

export function useDetailsShown(): [ColumnId[], (shown: ColumnId[]) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const shown = useMemo(() => parseColumns(raw), [raw]);
  const save = useCallback((next: ColumnId[]) => {
    const raw = JSON.stringify(next);
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, raw);
    } catch {
      unsaved = raw; // not remembered after this visit, but the change still shows
    }
    listeners.forEach((l) => l());
  }, []);
  return [shown, save];
}
