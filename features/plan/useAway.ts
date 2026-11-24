"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { leaveEnabled } from "@/lib/flags";
import type { AwayDay } from "@/lib/leave";
import { getAway, LeaveApiError, withLeaveDeadline } from "@/lib/leaveClient";

type Scope = { email: string; from: string; to: string };
type Status = "idle" | "loading" | "ready" | "failed" | "offline";
type Answer = { scope: Scope; attempt: number; status: "idle" | "ready" | "failed"; days?: AwayDay[] };
type AwayRead = { status: Status; days: readonly AwayDay[]; retry: () => void };
const noDays: readonly AwayDay[] = [];

export function useAway(from: string | undefined, to: string | undefined, email: string | undefined, offline: boolean): AwayRead {
  const enabled = leaveEnabled();
  const scope = useMemo(() => enabled && from && to && email && !offline ? { from, to, email } : null, [enabled, from, to, email, offline]);
  const [attempt, retry] = useReducer((previous: number) => previous + 1, 0);
  const [answer, setAnswer] = useState<Answer>();

  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    let current = true;
    void withLeaveDeadline((signal) => getAway(scope.from, scope.to, { email: scope.email, signal }), controller).then(
      (days) => { if (current) setAnswer({ scope, attempt, status: "ready", days }); },
      (error) => {
        if (!current) return;
        const hidden = error instanceof LeaveApiError && [401, 403, 404].includes(error.status);
        setAnswer({ scope, attempt, status: hidden ? "idle" : "failed" });
      },
    );
    return () => { current = false; controller.abort(); };
  }, [scope, attempt]);

  if (!enabled || !from || !to || !email) return { status: "idle", days: noDays, retry };
  if (offline) return { status: "offline", days: noDays, retry };
  const latest = answer?.scope === scope && answer.attempt === attempt ? answer : undefined;
  return { status: latest?.status ?? "loading", days: latest?.days ?? noDays, retry };
}
