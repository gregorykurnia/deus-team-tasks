"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { isIsoDay } from "@/lib/dates";
import {
  checkRequest, days, defaultLeavePay, LAW_LEAVE_EVENTS, LEAVE_PAY_OPTIONS, LEAVE_REASON_LABELS, LEAVE_TYPE_LABELS,
  leaveOperationId, SPECIAL_LEAVE_EVENTS, type LeaveEvent, type LeaveInput, type LeaveIssue,
  type LeavePay, type LeaveReason, type LeaveRequest, type LeaveType,
} from "@/lib/leave";
import type { MyLeave } from "@/lib/leave.server";
import { askLeave, LeaveApiError } from "@/lib/leaveClient";
import { buildLedger } from "@/lib/leaveLedger";
import Button from "@/ui/Button";
import Field from "@/ui/Field";
import { SelectInput, TextArea, TimeInput } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import Sheet from "@/ui/Sheet";
import { useLeaveData, withLeaveDeadline } from "./LeaveData";
import LeaveDateInput from "./LeaveDateInput";
import adminStyles from "./AdminLeave.module.css";
import styles from "./Leave.module.css";

type Draft = LeaveInput & { pay: LeavePay | null };
const initial: Draft = {
  type: "annual", reason: null, event: null, start: "", end: "", half: null, hours: null, note: "", pay: null,
};
const types = Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({ value: value as LeaveType, label }));
const durations = [
  { value: "full", label: "Full day" }, { value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" },
] as const;
const connectionError = "Not sent. Check your connection and try again.";
const specialEvents = Object.entries(SPECIAL_LEAVE_EVENTS).map(([value, { label }]) => [value, label] as const);
const lawEvents = Object.entries(LAW_LEAVE_EVENTS);

type AskData = Pick<MyLeave, "today" | "isAdmin" | "holidays" | "profile" | "summary" | "requests" | "ledger">
  & Partial<Pick<MyLeave, "requestHolidays" | "setupContact">>;

function availableAfter(data: AskData, draft: Draft, holidays: MyLeave["requestHolidays"]) {
  const pay = defaultLeavePay(draft) ?? draft.pay;
  if (data.isAdmin && !pay) return null;
  if (!data.profile || (pay && pay !== "deduct")) return data.summary?.available ?? null;

  // Use the same reservation and lapse rules as the saved balance, including backdated admin requests.
  const hypothetical = { ...draft, id: "", status: data.isAdmin ? "approved" as const : "waiting" as const, pay };
  const adjustments = data.ledger.flatMap(({ kind, date, days, label, sourceId }) =>
    kind === "adjustment" ? [{ id: sourceId ?? "", date, days, reason: label }] : []);
  return buildLedger(data.profile, [...data.requests, hypothetical], adjustments, holidays, data.today).summary.available;
}

function entered(draft: Draft, field: LeaveIssue["field"]): boolean {
  if (field === "start" || field === "end") return isIsoDay(draft[field]);
  if (field === "hours.from") return !!draft.hours?.from;
  if (field === "hours.to") return !!draft.hours?.to;
  return field === "note" && draft.note.length > 500;
}

export default function AskLeaveSheet({ data, email, recipient, onClose, onSent }: {
  data: AskData;
  email: string;
  recipient?: { email: string; name: string; refresh: () => Promise<Pick<MyLeave, "requests"> | undefined> };
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const active = useRef(false);
  const sending = useRef(false);
  const attempt = useRef<{ key: string; id?: string } | null>(null);
  const [draft, setDraft] = useState(initial);
  const [focusAttempt, focusErrors] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [serverIssues, setServerIssues] = useState<LeaveIssue[]>([]);
  const { online, refresh: refreshMine } = useLeaveData();
  const refresh = recipient?.refresh ?? refreshMine;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!focusAttempt) return;
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid?.querySelector("button") ?? invalid)?.focus();
  }, [focusAttempt]);

  const holidays = data.requestHolidays ?? data.holidays;
  const checked = checkRequest(draft, {
    today: data.today, isAdmin: data.isAdmin, existing: data.requests, holidays, lastDay: data.profile?.endDate,
  });
  const issues = [...serverIssues, ...checked.errors.filter(({ field }) => focusAttempt > 0 || entered(draft, field))];
  const needsPay = data.isAdmin && draft.reason === "else";
  const payError = needsPay && !draft.pay ? "Choose how this absence is paid." : undefined;
  const errorFor = (field: LeaveIssue["field"]) => issues.find((issue) => issue.field === field)?.message;
  const datesValid = checked.days > 0 && ![...checked.errors, ...serverIssues].some(({ field }) => field === "start" || field === "end");
  const after = datesValid ? availableAfter(data, draft, holidays) : null;

  function change(patch: Partial<Draft>) {
    if (sending.current) return;
    attempt.current = null;
    setSendError("");
    const keys = Object.keys(patch);
    const changesDates = keys.some((key) => ["type", "reason", "event", "start", "end", "half"].includes(key));
    setServerIssues((previous) => previous.filter(({ field }) => !keys.includes(field)
      && !(changesDates && (field === "start" || field === "end"))
      && !(patch.hours && field.startsWith("hours."))));
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      if (next.start !== next.end) next.half = null;
      return next;
    });
  }

  function finish(request: LeaveRequest) {
    if (!active.current) return;
    active.current = false;
    const contact = data.setupContact;
    const message = request.status === "waiting" ? (contact ? `Sent to ${contact}` : "Sent for approval")
      : request.status === "approved" && data.isAdmin ? "Added" : "Request received";
    onSent(message);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !active.current) return;
    const alreadyReceived = data.requests.find(({ id }) => id === attempt.current?.id);
    if (alreadyReceived) return finish(alreadyReceived);
    setSendError("");
    if (!checked.request || payError) {
      focusErrors((count) => count + 1);
      return;
    }
    if (!online) {
      setSendError(connectionError);
      return;
    }

    sending.current = true;
    setBusy(true);
    setServerIssues([]);
    try {
      const current = attempt.current ?? { key: crypto.randomUUID() };
      attempt.current = current;
      current.id ??= await leaveOperationId(email, current.key);
      const input = { ...checked.request, ...(draft.pay ? { pay: draft.pay } : {}), ...(recipient ? { email: recipient.email } : {}) };
      const { request } = await withLeaveDeadline((signal) => askLeave(input, current.key, { email, signal }));
      if (request?.id !== current.id || request.email !== (recipient?.email ?? email)) throw new Error("Unconfirmed leave request");
      const stillOpen = active.current;
      finish(request);
      void refresh(!stillOpen);
    } catch (error) {
      if (error instanceof LeaveApiError && error.issues.length) {
        if (active.current) {
          setServerIssues(error.issues);
          focusErrors((count) => count + 1);
          void refresh(true);
        }
      } else {
        const fresh = await refresh(true);
        const received = fresh?.requests.find(({ id }) => id === attempt.current?.id);
        if (received) finish(received);
        else if (active.current) setSendError(error instanceof LeaveApiError && error.status < 500
          ? error.message : connectionError);
      }
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }

  function close() {
    if (!active.current) return;
    active.current = false;
    onClose();
  }

  const hours = draft.hours;
  const special = draft.reason === "special";
  const events = special ? specialEvents : lawEvents;
  const eventLabel = events.find(([value]) => value === draft.event)?.[1];
  const specialLimit = special && draft.event && SPECIAL_LEAVE_EVENTS[draft.event as keyof typeof SPECIAL_LEAVE_EVENTS]?.days;
  const showHalf = draft.type === "annual" && isIsoDay(draft.start) && draft.start === draft.end;
  const startError = errorFor("start") ?? (hours ? errorFor("end") : undefined);

  return (
    <Sheet open title={recipient ? "Add leave" : "Ask for leave"} meta={recipient && <span className={adminStyles.personMeta}>{recipient.name}</span>}
      short visibleOnOpen={!!recipient} onClose={close} footer={<div className={styles.askFooter}>
      {sendError && <Notice tone="error">{sendError}</Notice>}
      {datesValid && <p className={styles.askTotal} role="status">
        {days(checked.days).replace(" day", " working day")}{after !== null && <>{" · Available after: "}<b>{days(after)}</b>{after < 0 && ", taken in advance"}</>}
      </p>}
      <div className={styles.askActions}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="main" type="submit" form={formId} busy={busy} busyLabel={recipient ? "Adding…" : "Sending…"}>
          {recipient ? "Add leave" : "Send request"}
        </Button>
      </div>
    </div>}>
      <form id={formId} ref={form} data-toasts-behind-sheet noValidate onSubmit={(event) => void send(event)}>
        <fieldset className={styles.askFields} disabled={busy}>
          <Field group label="Type" error={errorFor("type")}>{(control) => <div {...control}>
            <Segmented label="Leave type" options={types} value={draft.type} full onChange={(type) => {
              if (type && type !== draft.type) change({ type, reason: null, event: null, half: null, hours: null, pay: null });
            }} />
          </div>}</Field>
          {draft.type === "other" && <Field label="Reason" error={errorFor("reason")}>{(control) => (
            <SelectInput {...control} required value={draft.reason ?? ""} onChange={(event) => {
              const reason = event.target.value as LeaveReason | "";
              change({ reason: reason || null, event: null, pay: null,
                hours: reason === "hours" ? { from: "", to: "" } : null,
                end: reason === "hours" ? draft.start : draft.end });
            }}>
              <option value="">Choose a reason</option>
              {Object.entries(LEAVE_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectInput>
          )}</Field>}
          {(special || draft.reason === "law") && <Field label="Event" error={errorFor("event")}
            hint={specialLimit && !data.isAdmin ? `Up to ${days(specialLimit)}` : undefined}>{(control) => (
              <div className={styles.eventSelect}>
                <span aria-hidden="true">{eventLabel ?? "Choose an event"}</span>
                <SelectInput {...control} className={styles.eventInput} required value={draft.event ?? ""}
                  onChange={(event) => change({ event: (event.target.value || null) as LeaveEvent | null })}>
                  <option value="">Choose an event</option>
                  {events.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SelectInput>
              </div>
            )}</Field>}
          <div className={hours ? undefined : styles.askPair}>
            <Field label={hours ? "Date" : "From"} error={startError}>{(control) => (
              <LeaveDateInput {...control} label={hours ? "Date" : "From date"} required value={draft.start} onChange={(start) => change({
                start, end: hours || !draft.end || draft.end === draft.start ? start : draft.end,
              })} />
            )}</Field>
            {!hours && <Field label="To" error={errorFor("end")}>{(control) => (
              <LeaveDateInput {...control} label="To date" required value={draft.end} onChange={(end) => change({ end })} />
            )}</Field>}
          </div>
          {showHalf && <Field group label="Length" error={errorFor("half")}>{(control) => <div {...control}>
            <Segmented label="Length" options={[...durations]} value={draft.half ?? "full"} full onChange={(length) => {
              change({ half: length === "full" ? null : length });
            }} />
          </div>}</Field>}
          {hours && <div className={styles.askPair}>
            <Field label="From time" error={errorFor("hours.from") ?? errorFor("hours")}>{(control) => (
              <TimeInput {...control} required min="07:00" max="20:00" value={hours.from}
                onChange={(from) => change({ hours: { ...hours, from } })} />
            )}</Field>
            <Field label="To time" error={errorFor("hours.to")}>{(control) => (
              <TimeInput {...control} required min="07:00" max="20:00" value={hours.to}
                onChange={(to) => change({ hours: { ...hours, to } })} />
            )}</Field>
          </div>}
          {datesValid && checked.warnings.map((warning) => <Notice key={warning} tone="warning">{warning}</Notice>)}
          {needsPay && <Field label="Pay" error={errorFor("pay") ?? (focusAttempt ? payError : undefined)}>{(control) => (
            <SelectInput {...control} required value={draft.pay ?? ""}
              onChange={(event) => change({ pay: (event.target.value || null) as LeavePay | null })}>
              <option value="">Choose how this absence is paid</option>
              {LEAVE_PAY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </SelectInput>
          )}</Field>}
          <Field label="Note" optional={draft.reason !== "else"} error={errorFor("note")}>{(control) => (
            <TextArea {...control} required={draft.reason === "else"} value={draft.note} onChange={(event) => change({ note: event.target.value })} />
          )}</Field>
        </fieldset>
      </form>
    </Sheet>
  );
}
