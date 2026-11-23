"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { isIsoDay } from "@/lib/dates";
import { leaveOperationId, type LeaveProfile, type LeaveProfileDetails } from "@/lib/leave";
import type { PersonLeave } from "@/lib/leave.server";
import { adjustLeave, LeaveApiError, saveLeaveDetails } from "@/lib/leaveClient";
import Button from "@/ui/Button";
import Field from "@/ui/Field";
import { NumberInput, TextArea } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { withLeaveDeadline } from "./LeaveData";
import LeaveDateInput from "./LeaveDateInput";
import { useAdminLeaveAction } from "./useAdminLeaveAction";
import styles from "./AdminLeave.module.css";

type FormProps = {
  data: PersonLeave;
  email: string;
  onClose: () => void;
  onRefresh: () => Promise<PersonLeave | undefined>;
  onSaved: (message: string) => void;
};

function FormActions({ formId, busy, disabled, label, busyLabel, close }: {
  formId: string; busy: boolean; disabled?: boolean; label: string; busyLabel: string; close: () => void;
}) {
  return <div className={styles.formActions}>
    <Button onClick={close}>Cancel</Button>
    <Button variant="main" form={formId} type="submit" disabled={disabled} busy={busy} busyLabel={busyLabel}>{label}</Button>
  </div>;
}

export function AdjustBalanceSheet({ data, email, onClose, onRefresh, onSaved }: FormProps) {
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const action = useAdminLeaveAction("Couldn’t confirm the adjustment. Check your connection and try again.", form);
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const attempt = useRef<string | null>(null);

  function edited() {
    action.clearError();
    attempt.current = null;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void action.run(async (isActive) => {
      const key = attempt.current ?? crypto.randomUUID();
      attempt.current = key;
      const id = await leaveOperationId(email, key);
      const input = { email: data.person.email, days: Number(days), reason: reason.trim() };
      try {
        const { adjustment } = await withLeaveDeadline((signal) => adjustLeave(input, key, { email, signal }));
        if (adjustment?.id !== id || adjustment.email !== input.email) throw new Error("Unconfirmed adjustment");
      } catch (error) {
        if (error instanceof LeaveApiError && error.status < 500 && error.status !== 409) throw error;
        const current = await onRefresh();
        // The adjustment endpoint only returns 409 when this operation key was already used.
        // The ledger can omit a saved adjustment dated before the opening date.
        const received = current?.ledger.some(({ kind, sourceId }) => kind === "adjustment" && sourceId === id);
        if (!received && !(error instanceof LeaveApiError && error.status === 409)) throw error;
        if (isActive()) onSaved("Balance adjusted");
        return;
      }
      await onRefresh();
      if (isActive()) onSaved("Balance adjusted");
    });
  }

  return <Sheet open title="Adjust balance" meta={<span className={styles.personMeta}>{data.person.name}</span>} short visibleOnOpen onClose={onClose}
    footer={<FormActions formId={formId} busy={action.busy} label="Save adjustment" busyLabel="Saving…" close={onClose} />}>
    <form id={formId} ref={form} className={styles.adminForm} data-toasts-behind-sheet noValidate onSubmit={submit}>
      <fieldset className={styles.fields} disabled={action.busy}>
        <Field label="Days" hint="Enter half days. Use a minus sign to subtract days." error={action.fieldError("days")}>{(control) => (
          <NumberInput {...control} inputMode="text" min={-30} max={30} step={0.5} required value={days}
            onChange={(event) => { setDays(event.target.value); edited(); }} />
        )}</Field>
        <Field label="Reason" error={action.fieldError("reason")}>{(control) => (
          <TextArea {...control} className={styles.adjustReason} required maxLength={300} value={reason}
            onChange={(event) => { setReason(event.target.value); edited(); }} />
        )}</Field>
      </fieldset>
      {action.message && <Notice tone="error">{action.message}</Notice>}
    </form>
  </Sheet>;
}

function detailsDraft(profile: LeaveProfile | null) {
  return {
    version: profile?.updatedAt ?? 0,
    joinDate: profile?.joinDate ?? "", accrualStart: profile?.accrualStart ?? "", endDate: profile?.endDate ?? "",
    openingDate: profile?.openingDate ?? "", openingBalance: String(profile?.openingBalance ?? 0),
    openingCarried: String(profile?.openingCarried ?? 0),
  };
}

export function LeaveDetailsSheet({ data, email, onClose, onRefresh, onSaved }: FormProps) {
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const action = useAdminLeaveAction("Couldn’t confirm the leave details. Check your connection and try again.", form);
  const [draft, setDraft] = useState(() => detailsDraft(data.profile));
  const canCarry = isIsoDay(draft.openingDate) && /^\d{4}-0[12]-/.test(draft.openingDate);

  function edit(field: Exclude<keyof typeof draft, "version">, value: string) {
    if (!action.conflict) action.clearError();
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (action.conflict) return;
    void action.run(async (isActive) => {
      const { version, joinDate, accrualStart, endDate, openingDate, openingBalance, openingCarried } = draft;
      const details: LeaveProfileDetails = {
        joinDate, accrualStart, endDate: endDate || null, openingDate,
        openingBalance: Number.parseFloat(openingBalance), openingCarried: canCarry ? Number.parseFloat(openingCarried) : 0,
      };
      const { profile } = await withLeaveDeadline((signal) => saveLeaveDetails(data.person.email, details, version, { email, signal }))
        .catch((error: unknown) => {
          if (!(error instanceof LeaveApiError) || error.status >= 500) void onRefresh();
          throw error;
        });
      if (profile?.email !== data.person.email || Object.entries(details).some(([field, value]) => profile[field as keyof LeaveProfileDetails] !== value)) {
        throw new Error("Unconfirmed leave details");
      }
      await onRefresh();
      if (isActive()) onSaved("Leave details saved");
    });
  }

  function reload() {
    void action.run(async (isActive) => {
      const current = await onRefresh();
      if (!isActive()) return;
      if (!current) throw new LeaveApiError(409, "Couldn’t reload the leave details. Try again.");
      setDraft(detailsDraft(current.profile));
    });
  }

  return <Sheet open title="Leave details" meta={<span className={styles.personMeta}>{data.person.name}</span>} short visibleOnOpen onClose={onClose}
    footer={<FormActions formId={formId} busy={action.busy} disabled={action.conflict} label="Save details" busyLabel="Saving…" close={onClose} />}>
    <form id={formId} ref={form} className={styles.adminForm} data-toasts-behind-sheet noValidate onSubmit={submit}>
      {action.message && <Notice tone="error" action={action.conflict && <Button small data-leave-reload busy={action.busy} onClick={reload}>Reload details</Button>}>
        {action.message}
      </Notice>}
      <fieldset className={styles.fields} disabled={action.busy || action.conflict}>
        <div className={styles.formPair}>
          <Field label="Join date" error={action.fieldError("joinDate")}>{(control) => (
            <LeaveDateInput {...control} label="Join date" required value={draft.joinDate} onChange={(value) => edit("joinDate", value)} />
          )}</Field>
          <Field label="Monthly +1 day starts" hint="Choose the first day of a month." error={action.fieldError("accrualStart")}>{(control) => (
            <LeaveDateInput {...control} label="Monthly +1 start date" required value={draft.accrualStart} onChange={(value) => edit("accrualStart", value)} />
          )}</Field>
        </div>
        <div className={`${styles.formPair} ${styles.openingFields}`}>
          <Field label="Opening balance" error={action.fieldError("openingBalance")}>{(control) => (
            <NumberInput {...control} inputMode="text" step={0.5} required value={draft.openingBalance}
              onChange={(event) => edit("openingBalance", event.target.value)} />
          )}</Field>
          <Field label="Opening date" error={action.fieldError("openingDate")}>{(control) => (
            <LeaveDateInput {...control} label="Opening date" required value={draft.openingDate} onChange={(value) => edit("openingDate", value)} />
          )}</Field>
        </div>
        {canCarry && <Field label="Days carried over" error={action.fieldError("openingCarried")}>{(control) => (
          <NumberInput {...control} inputMode="decimal" min={0} step={0.5} required value={draft.openingCarried}
            onChange={(event) => edit("openingCarried", event.target.value)} />
        )}</Field>}
        <Field label="Last day" optional error={action.fieldError("endDate")}>{(control) => (
          <LeaveDateInput {...control} label="Last day" value={draft.endDate} onChange={(value) => edit("endDate", value)} />
        )}</Field>
      </fieldset>
    </form>
  </Sheet>;
}
