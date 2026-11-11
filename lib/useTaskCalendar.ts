"use client";

// Task details' view of calendar writes (C04): whether they're switched on for this deployment, and whether a task's
// sync is in flight on this device.
import { useEffect, useState, useSyncExternalStore } from "react";
import { calendarSyncPending, subscribeCalendarPending } from "./calendarRequests";

// Asked once per page load; a failed answer (offline) is asked again next time, and hides the switch meanwhile.
let known: boolean | undefined;
let asking: Promise<boolean> | undefined;

function askEnabled(): Promise<boolean> {
  asking ??= fetch("/api/calendar/sync")
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { enabled?: unknown } | null) => {
      if (!body) throw new Error("No answer");
      return (known = body.enabled === true);
    })
    .catch(() => {
      asking = undefined;
      return false;
    });
  return asking;
}

export function useCalendarWritesEnabled(): boolean {
  const [enabled, setEnabled] = useState(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    let live = true;
    void askEnabled().then((on) => live && setEnabled(on));
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}

export function useCalendarSyncPending(taskId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribeCalendarPending,
    () => !!taskId && calendarSyncPending(taskId),
    () => false,
  );
}
