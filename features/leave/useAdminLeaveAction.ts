"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { LeaveApiError } from "@/lib/leaveClient";
import type { LeaveIssue } from "@/lib/leave";
import { useLeaveData } from "./LeaveData";

export function useAdminLeaveAction(failure: string, form?: RefObject<HTMLFormElement | null>) {
  const { online, refresh } = useLeaveData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const active = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (busy || !(error instanceof LeaveApiError)) return;
    if (error.issues.length) form?.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    else if (error.status === 409) form?.current?.querySelector<HTMLElement>("[data-leave-reload]")?.focus();
  }, [error, busy, form]);

  async function run(action: (isActive: () => boolean) => Promise<void>) {
    if (pending.current || !active.current) return;
    if (!online) {
      setError(new LeaveApiError(503, failure));
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action(() => active.current);
    } catch (error) {
      if (error instanceof LeaveApiError && (error.status === 401 || error.status === 403)) void refresh(true);
      if (active.current) setError(error);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const apiError = error instanceof LeaveApiError ? error : undefined;
  const fieldError = (field: LeaveIssue["field"]) => apiError?.issues.find((issue) => issue.field === field)?.message;
  return {
    busy, run, fieldError,
    clearError: () => setError(undefined),
    conflict: apiError?.status === 409 && !apiError.issues.length,
    message: error !== undefined && !apiError?.issues.length ? (apiError && apiError.status < 500 ? apiError.message : failure) : undefined,
  };
}
