"use client";

import { useEffect, useRef, useState } from "react";
import { weekdayDate } from "@/lib/dates";
import { canCancelLeave, dateRange, LAW_LEAVE_EVENTS, LEAVE_REASON_LABELS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, requestDaysLabel, SPECIAL_LEAVE_EVENTS, type LeaveStatus } from "@/lib/leave";
import { cancelLeave, LeaveApiError } from "@/lib/leaveClient";
import type { MyLeave } from "@/lib/leave.server";
import Button from "@/ui/Button";
import { Confirm } from "@/ui/Dialog";
import Notice from "@/ui/Notice";
import Pill, { type PillTone } from "@/ui/Pill";
import Sheet from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import { LARGE_SCREEN, useMediaQuery } from "@/ui/useMediaQuery";
import { useLeaveData, withLeaveDeadline } from "./LeaveData";
import { leaveDay } from "./leaveDay";
import styles from "./Leave.module.css";

type RequestRow = MyLeave["requests"][number];

const tones: Record<LeaveStatus, PillTone> = { waiting: "amber", approved: "done", rejected: "red", cancelled: "calm" };
const events: Record<string, string> = {
  ...LAW_LEAVE_EVENTS, ...Object.fromEntries(Object.entries(SPECIAL_LEAVE_EVENTS).map(([id, event]) => [id, event.label])),
};

export function RequestStatus({ status }: { status: LeaveStatus }) {
  return <Pill tone={tones[status]}>{LEAVE_STATUS_LABELS[status]}</Pill>;
}

export function requestReason(request: RequestRow) {
  return request.reason && [LEAVE_REASON_LABELS[request.reason], request.event && events[request.event]].filter(Boolean).join(" · ");
}

export function RequestDetails({ request, today }: { request: RequestRow; today: string }) {
  const days = [requestDaysLabel(request.days), request.half === "morning" ? "Morning" : request.half === "afternoon" ? "Afternoon" : null]
    .filter(Boolean).join(" · ");
  const reason = requestReason(request);
  return (
    <dl>
      <div><dt>Dates</dt><dd>{dateRange(request.start, request.end, today)}</dd></div>
      <div><dt>Days</dt><dd>{days}</dd></div>
      {reason && <div><dt>Reason</dt><dd>{reason}</dd></div>}
      {request.hours && <div><dt>Hours</dt><dd>{request.hours.from} to {request.hours.to}</dd></div>}
      {request.note?.trim() && <div><dt>Note</dt><dd className={styles.note}>{request.note}</dd></div>}
      {request.status === "rejected" && request.rejectReason && <div><dt>Reason for the decision</dt><dd className={styles.note}>{request.rejectReason}</dd></div>}
    </dl>
  );
}

function statusDetails(request: RequestRow) {
  switch (request.status) {
    case "waiting": return { verb: "Requested", by: request.createdBy, at: request.createdAt };
    case "cancelled": return { verb: "Cancelled", by: request.cancelledBy, at: request.cancelledAt };
    default: return { verb: LEAVE_STATUS_LABELS[request.status], by: request.decidedBy, at: request.decidedAt };
  }
}

export default function RequestSheet({ data, request, email, onClose }: { data: MyLeave; request: RequestRow; email: string; onClose: () => void }) {
  const { refresh } = useLeaveData();
  const toast = useToast();
  const large = useMediaQuery(LARGE_SCREEN);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const restoreFocus = useRef(false);
  const details = useRef<HTMLDivElement>(null);
  const status = statusDetails(request);
  const actor = status.by && (data.actorNames[status.by] ?? (status.by === request.email ? request.name : status.by));
  const canCancel = canCancelLeave(request, data.today, data.isAdmin);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!confirm && restoreFocus.current) {
      restoreFocus.current = false;
      details.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.focus({ preventScroll: true });
    }
  }, [confirm]);

  function finishCancellation() {
    restoreFocus.current = true;
    setConfirm(false);
  }

  async function cancel() {
    if (pending.current) return;
    if (!canCancel) {
      finishCancellation();
      toast("This request can no longer be cancelled.", { error: true });
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const reply = await withLeaveDeadline((signal) => cancelLeave(request.id, { email, signal }));
      if (reply?.request?.id !== request.id || reply.request.status !== "cancelled") throw new Error("Unconfirmed cancellation");
      if (mounted.current) toast("Request cancelled");
      await refresh();
      if (mounted.current) finishCancellation();
    } catch (error) {
      // An unanswered POST may have reached Firestore. Read its status before offering a retry.
      const fresh = await refresh(true);
      if (!mounted.current) return;
      const row = fresh?.requests.find(({ id }) => id === request.id);
      if (row?.status === "cancelled") {
        toast("Request cancelled");
        finishCancellation();
      } else {
        const message = error instanceof LeaveApiError && error.status === 409 ? error.message : "Couldn’t confirm the cancellation. Try again.";
        if (fresh && (!row || !canCancelLeave(row, fresh.today, fresh.isAdmin))) {
          toast(message, { error: true });
          finishCancellation();
        } else {
          setError(message);
        }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <Sheet open onClose={onClose} short={!large} title={LEAVE_TYPE_LABELS[request.type]} tag={<RequestStatus status={request.status} />}
        footer={canCancel && <Button variant="quietRed" onClick={() => { setError(""); setConfirm(true); }}>Cancel request</Button>}>
        <div className={styles.details} ref={details}>
          <RequestDetails request={request} today={data.today} />
          <p className={styles.statusDetails}>{status.verb}{actor && ` by ${actor}`}{typeof status.at === "number" && ` on ${weekdayDate(leaveDay(status.at), data.today)}`}</p>
        </div>
      </Sheet>
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void cancel()} title="Cancel this request?"
        confirmLabel="Cancel request" busy={busy} busyLabel="Cancelling…">
        <p className={styles.confirmCopy}>The request will be marked cancelled and stop counting against your available leave.</p>
        {error && <Notice tone="error">{error}</Notice>}
      </Confirm>
    </>
  );
}
