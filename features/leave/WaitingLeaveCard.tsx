"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { dayLabel, daysBetween } from "@/lib/dates";
import { dateRange, days, defaultLeavePay, LEAVE_PAY_OPTIONS, LEAVE_TYPE_LABELS, requestDaysLabel,
  type LeaveDecision, type LeavePay, type LeaveRequest } from "@/lib/leave";
import { decideLeave, getPersonLeave, LeaveApiError } from "@/lib/leaveClient";
import type { TeamLeave } from "@/lib/leave.server";
import Avatar from "@/ui/Avatar";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { TextArea } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import { withLeaveDeadline } from "./LeaveData";
import { leaveDay } from "./leaveDay";
import { RequestDetails, requestReason } from "./RequestSheet";
import leaveStyles from "./Leave.module.css";
import styles from "./TeamLeave.module.css";

type WaitingRequest = TeamLeave["waiting"][number];
type Action = LeaveDecision["decision"];

function matchesDecision(saved: LeaveRequest | undefined, request: WaitingRequest, email: string, input: LeaveDecision) {
  if (!saved || saved.id !== request.id || saved.decidedBy !== email) return false;
  return input.decision === "approve"
    ? saved.status === "approved" && saved.pay === (defaultLeavePay(request) ?? input.pay)
    : saved.status === "rejected" && saved.rejectReason === input.reason;
}

interface Props {
  request: WaitingRequest;
  today: string;
  email: string;
  distinguishName: boolean;
  href?: string;
  onOpen?: () => void;
  detailOpen: boolean;
  onClose: () => void;
  onResolved: (id: string) => void;
  onAccessError: () => void;
}

export default function WaitingLeaveCard({ request, today, email, distinguishName, href, onOpen, detailOpen, onClose, onResolved, onAccessError }: Props) {
  const [dialog, setDialog] = useState<{ action: Action; fromSheet: boolean }>();
  const [busy, setBusy] = useState<Action>();
  const [reason, setReason] = useState("");
  const [pay, setPay] = useState<LeavePay>();
  const [fieldError, setFieldError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const toast = useToast();
  const formId = useId();
  if (!detailOpen && dialog?.fromSheet) setDialog(undefined);
  const activeDialog = dialog && (!dialog.fromSheet || detailOpen) ? dialog.action : undefined;
  const type = LEAVE_TYPE_LABELS[request.type];
  const daysWaiting = Number.isFinite(request.createdAt) ? Math.max(0, daysBetween(leaveDay(request.createdAt), today)) : null;
  const age = daysWaiting === null ? "Waiting" : daysWaiting ? `Waiting ${days(daysWaiting)}` : "Waiting today";
  const available = request.availableAfter === null ? "Unavailable" : days(request.availableAfter);
  const shortSpan = daysBetween(request.start, request.end) < 7;
  const away = request.alsoAway.map(({ name, dates }) => {
    const labels = dates.map((date) => shortSpan ? dayLabel(date).split(" ")[0] : dayLabel(date));
    return `${name} (${labels.join(", ")})`;
  }).join(", ");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function fieldIssue(message: string) {
    setFieldError(message);
    setAttempt((previous) => previous + 1);
  }

  async function save(input: LeaveDecision) {
    if (pending.current) return;
    pending.current = true;
    setBusy(input.decision);
    setError("");

    function finish(landed: boolean) {
      if (mounted.current) {
        if (landed) toast(input.decision === "approve" ? "Request approved" : "Request rejected");
        else toast("This request is no longer waiting.", { error: true });
      }
      onResolved(request.id);
    }

    try {
      const reply = await withLeaveDeadline((signal) => decideLeave(request.id, input, { email, signal }));
      if (!matchesDecision(reply.request, request, email, input)) throw new Error("Unconfirmed leave decision");
      finish(true);
    } catch (error) {
      const refusal = error instanceof LeaveApiError ? error : undefined;
      if (refusal?.status === 401 || refusal?.status === 403) {
        onAccessError();
        if (mounted.current) setError(refusal.message);
      } else if (refusal?.status === 400 || refusal?.status === 422) {
        if (mounted.current) {
          const issue = refusal.issues.find(({ field }) => field === (input.decision === "approve" ? "pay" : "reason"));
          if (issue) fieldIssue(issue.message);
          else setError(refusal.message);
        }
      } else {
        // A lost POST reply is ambiguous. Confirm the saved choice before reporting it or offering a retry.
        const person = await withLeaveDeadline((signal) => getPersonLeave(request.email, { email, signal })).catch(() => undefined);
        const saved = person?.requests.find(({ id }) => id === request.id);
        if (matchesDecision(saved, request, email, input)) finish(true);
        else if ((saved && saved.status !== "waiting") || refusal?.status === 404 || refusal?.status === 409) finish(false);
        else if (mounted.current) setError("Couldn’t confirm the decision. Try again.");
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(undefined);
    }
  }

  function choose(action: Action, fromSheet: boolean) {
    if (pending.current) return;
    if (action === "approve" && defaultLeavePay(request)) {
      void save({ decision: "approve" });
      return;
    }
    setDialog({ action, fromSheet });
    setReason("");
    setPay(undefined);
    setError("");
    setFieldError("");
  }

  function closeDialog() {
    setDialog(undefined);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (activeDialog === "reject") {
      if (!reason.trim()) fieldIssue("Enter a reason for rejecting this request.");
      else void save({ decision: "reject", reason: reason.trim() });
    } else if (pay) {
      void save({ decision: "approve", pay });
    } else {
      fieldIssue("Choose how this absence is paid.");
    }
  }

  function actions(fromSheet: boolean) {
    return <div className={styles.actions}>
      <Button small={!fromSheet} disabled={busy === "approve"} busy={busy === "reject"} busyLabel="Rejecting…" onClick={() => choose("reject", fromSheet)}>Reject</Button>
      <Button variant="main" small={!fromSheet} disabled={busy === "reject"} busy={busy === "approve"} busyLabel="Approving…" onClick={() => choose("approve", fromSheet)}>Approve</Button>
    </div>;
  }

  const errorNotice = error && <Notice tone="error">{error}</Notice>;
  const availability = <p className={styles.availability}>Available leave after requests: <b>{available}</b></p>;
  const awayLine = away && <p className={styles.away}><b>Also away:</b> {away}</p>;
  const description = requestReason(request);

  return (
    <>
      {href && <article className={styles.card} aria-label={`${request.name} · ${type}`}>
        <Link className={styles.cardLink} href={href} onNavigate={onOpen} scroll={false}
          aria-label={`Open ${type.toLowerCase()} request from ${request.name}${distinguishName ? ` (${request.email})` : ""}`}>
          <Avatar name={request.name} />
          <span className={styles.cardName}>
            <b>{request.name}</b>
            {distinguishName && <small>{request.email}</small>}
            <span>{type}{description && ` · ${description}`}</span>
          </span>
          <Icon name="right" size={16} />
        </Link>
        <div className={styles.cardBody}>
          <p>{dateRange(request.start, request.end, today)} · {requestDaysLabel(request.days)}
            {request.half && ` · ${request.half === "morning" ? "Morning" : "Afternoon"}`}</p>
          {availability}
          {awayLine}
          {request.note?.trim() && <p className={styles.cardNote}>{request.note}</p>}
        </div>
        <div className={styles.cardFoot}><span className={styles.age}>{age}</span>{actions(false)}</div>
        {!activeDialog && !detailOpen && errorNotice}
      </article>}
      {detailOpen && <Sheet open short onClose={onClose} title={request.name} lead={<Avatar name={request.name} size="plan" />}
        meta={<>{type}{distinguishName && <span>{request.email}</span>}</>}
        footer={<div className={styles.sheetActions}>{!activeDialog && errorNotice}{actions(true)}</div>}>
        <div className={`${leaveStyles.details} ${styles.sheetDetails}`}>
          {availability}{awayLine}<p className={styles.age}>{age}</p>
          <RequestDetails request={request} today={today} />
        </div>
      </Sheet>}
      {activeDialog && <Dialog open onClose={closeDialog}
        title={activeDialog === "reject" ? "Reject this request?" : "Choose pay"}
        busy={!!busy} initialFocus="[data-decision-cancel]" actions={<>
          <Button className={styles.dialogButton} data-decision-cancel disabled={!!busy} onClick={closeDialog}>Cancel</Button>
          <Button className={styles.dialogButton} type="submit" form={formId} variant="main" busy={!!busy}
            busyLabel={activeDialog === "reject" ? "Rejecting…" : "Approving…"}>
            {activeDialog === "reject" ? "Reject request" : "Approve request"}
          </Button>
        </>}>
        <form id={formId} className={styles.decisionForm} noValidate onSubmit={submit}>
          <p className={styles.decisionName}>{request.name}</p>
          {activeDialog === "reject" ? (
            <Field label="Reason" hint="The person will see this reason." error={fieldError} focusKey={attempt}>
              {(control) => <TextArea {...control} required maxLength={300} rows={3} value={reason} disabled={!!busy}
                onChange={(event) => { setReason(event.target.value); setFieldError(""); }} />}
            </Field>
          ) : (
            <Field label="Pay for this absence" group error={fieldError} focusKey={attempt}>
              {(control) => <fieldset className={styles.payment} disabled={!!busy}>
                <legend className="sr-only">Pay for this absence</legend>
                {LEAVE_PAY_OPTIONS.map(({ value, label }, index) => <label key={value}>
                  <input type="radio" name="pay" value={value} checked={pay === value} required
                    id={index === 0 ? control.id : undefined} aria-describedby={control["aria-describedby"]}
                    onChange={() => { setPay(value); setFieldError(""); }} />
                  {label}
                </label>)}
              </fieldset>}
            </Field>
          )}
          {errorNotice}
        </form>
      </Dialog>}
    </>
  );
}
