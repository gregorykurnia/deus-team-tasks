"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { leaveEnabled } from "@/lib/flags";
import { getLeaveBadge, getMyLeave, LeaveApiError, withLeaveDeadline } from "@/lib/leaveClient";
import type { MyLeave } from "@/lib/leave.server";
import { retrySignInSession, useSignInSession } from "@/lib/useSignedIn";

type Scope = { email: string; mine: boolean };
type Result = { scope: Scope; data?: MyLeave; count?: number; error?: unknown };
type Refresh = (keepOnError?: boolean) => Promise<MyLeave | undefined>;

const LeaveContext = createContext({
  online: true, data: undefined as MyLeave | undefined, count: undefined as number | undefined,
  error: undefined as unknown, refresh: (async () => undefined) as Refresh,
});

export function useLeaveData() {
  return useContext(LeaveContext);
}

function subscribeOnline(listener: () => void) {
  const reconnect = () => { retrySignInSession(); listener(); };
  window.addEventListener("online", reconnect);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", reconnect);
    window.removeEventListener("offline", listener);
  };
}

export { withLeaveDeadline } from "@/lib/leaveClient";

export function LeaveData({ children }: { children: ReactNode }) {
  return leaveEnabled() ? <EnabledLeaveData>{children}</EnabledLeaveData> : children;
}

function EnabledLeaveData({ children }: { children: ReactNode }) {
  const { person } = useSignInSession();
  const email = person?.email;
  const mine = usePathname() === "/leave";
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const scope = useMemo(() => email ? { email, mine } : null, [email, mine]);
  const [result, setResult] = useState<Result>();
  const activeScope = useRef<Scope | null>(null);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback<Refresh>(async (keepOnError = false) => {
    const scope = activeScope.current;
    if (!scope) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = () => pending.current === controller && activeScope.current === scope;
    try {
      if (scope.mine) {
        const data = await withLeaveDeadline((signal) => getMyLeave({ email: scope.email, signal }), controller);
        if (!current()) return;
        setResult({ scope, data, count: data.isAdmin ? data.waitingForMe : undefined });
        return data;
      }
      const badge = await withLeaveDeadline((signal) => getLeaveBadge({ email: scope.email, signal }), controller);
      if (current()) setResult({ scope, count: badge.waitingForMe ?? undefined });
    } catch (error) {
      const denied = error instanceof LeaveApiError && (error.status === 401 || error.status === 403);
      if (current() && (!keepOnError || denied)) setResult({ scope, error });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);

  useEffect(() => {
    activeScope.current = online ? scope : null;
    void refresh();
    const focus = () => { void refresh(true); };
    window.addEventListener("focus", focus);
    return () => {
      activeScope.current = null;
      pending.current?.abort();
      window.removeEventListener("focus", focus);
    };
  }, [scope, online, refresh]);

  const visible = result?.scope === scope ? result : undefined;
  return <LeaveContext.Provider value={{ online, data: visible?.data, count: online ? visible?.count : undefined, error: visible?.error, refresh }}>{children}</LeaveContext.Provider>;
}
