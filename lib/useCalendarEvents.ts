"use client";

// The team calendar's events for a run of days from today (guide 5.9), from the calendar route. They load on their
// own, so tasks show while events are still loading. An answer that failed is asked for again when the app is live again.
import { useEffect, useRef, useState } from "react";
import type { CalendarEvent, CalendarResponse, CalendarStatus } from "./calendarEvents";
import { useConnection } from "./connection";
import { addDays, parseIso } from "./dates";

export type EventsState = { status: "loading" } | { status: CalendarStatus; events: CalendarEvent[] };

interface Answer {
  key: string;
  state: Exclude<EventsState, { status: "loading" }>;
}

export function useCalendarEvents(today: string | null, days: number): EventsState {
  const { online } = useConnection();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const latest = useRef<Answer | null>(null);
  const key = today ? `${today}+${days}` : null;

  useEffect(() => {
    if (!today || !key) return;
    // Already answered for these days, and not with a failure: nothing to ask again.
    if (latest.current?.key === key && latest.current.state.status !== "failed") return;
    if (latest.current?.key === key && !online) return; // a failure is only tried again once live
    const ctrl = new AbortController();
    const timeMin = parseIso(today).toISOString();
    const timeMax = parseIso(addDays(today, days)).toISOString();
    const settle = (state: Answer["state"]) => {
      latest.current = { key, state };
      setAnswer(latest.current);
    };
    fetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<CalendarResponse>)
      .then((data) => settle({ status: data.status, events: data.events ?? [] }))
      .catch((err) => {
        if (!ctrl.signal.aborted && err?.name !== "AbortError") settle({ status: "failed", events: [] });
      });
    return () => ctrl.abort();
  }, [today, days, key, online]);

  return answer && answer.key === key ? answer.state : { status: "loading" };
}
