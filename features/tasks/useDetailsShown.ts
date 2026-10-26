"use client";

// The details shown on All tasks and the widths their columns were dragged to, kept on this device (guide 5.6, N26).
// The server and the first paint use the default; what was saved takes over right after, and a change in another tab of
// the app follows.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { COLUMNS_STORAGE_KEY, parseColumns, parseWidths, WIDTHS_STORAGE_KEY, type ColumnId, type ColumnWidths } from "@/lib/taskColumns";

const listeners = new Set<() => void>();
const unsaved = new Map<string, string>(); // what was chosen while storage is blocked: kept for this visit only

function useStored(key: string): [string | null, (raw: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);
      const onStorage = (e: StorageEvent) => e.key === key && onChange();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return unsaved.get(key) ?? null;
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const save = useCallback(
    (raw: string) => {
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        unsaved.set(key, raw); // not remembered after this visit, but the change still shows
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [raw, save];
}

export function useDetailsShown(): [ColumnId[], (shown: ColumnId[]) => void] {
  const [raw, save] = useStored(COLUMNS_STORAGE_KEY);
  const shown = useMemo(() => parseColumns(raw), [raw]);
  const set = useCallback((next: ColumnId[]) => save(JSON.stringify(next)), [save]);
  return [shown, set];
}

export function useColumnWidths(): [ColumnWidths, (widths: ColumnWidths) => void] {
  const [raw, save] = useStored(WIDTHS_STORAGE_KEY);
  const widths = useMemo(() => parseWidths(raw), [raw]);
  const set = useCallback((next: ColumnWidths) => save(JSON.stringify(next)), [save]);
  return [widths, set];
}
