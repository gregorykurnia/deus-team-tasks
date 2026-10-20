"use client";

// Today's date where the team is: the browser's, never the server's (which runs in UTC, while the team is in UTC+7, so the
// two disagree from midnight to 07:00). Null while the server renders and during hydration; it moves on at midnight.
import { useSyncExternalStore } from "react";
import { todayIso } from "@/lib/dates";

function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      onChange();
      arm();
    }, midnight.getTime() - now.getTime() + 1000);
  };
  arm();
  return () => clearTimeout(timer);
}

export function useToday(): string | null {
  return useSyncExternalStore(subscribe, () => todayIso(), () => null);
}
