"use client";

// A setting changed here shows its new value at once, while the write goes to the server (the settings are written in a
// transaction, which only shows once the server has it). The new value shows only while what's stored is still what it
// was when the change was made: once the settings move (to the new value, or a colleague's), they show again. A failed
// write lets it go.
import { useCallback, useState } from "react";

interface Change<T> {
  value: T;
  before: T | undefined;
}

export function usePending<T>() {
  const [pending, setPending] = useState<Record<string, Change<T>>>({});
  const set = useCallback((key: string, value: T, before: T | undefined) => setPending((now) => ({ ...now, [key]: { value, before } })), []);
  const drop = useCallback(
    (key: string) =>
      setPending((now) => {
        if (!(key in now)) return now;
        const next = { ...now };
        delete next[key];
        return next;
      }),
    []
  );
  const value = (key: string, actual: T): T => {
    const change = pending[key];
    return change && change.before === actual ? change.value : actual;
  };
  return { value, set, drop };
}
