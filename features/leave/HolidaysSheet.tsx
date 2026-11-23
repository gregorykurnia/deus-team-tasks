"use client";

import { useRef, useState, type FormEvent } from "react";
import { isIsoDay, weekdayDate } from "@/lib/dates";
import type { LeaveHoliday } from "@/lib/leave";
import type { TeamLeave } from "@/lib/leave.server";
import { addLeaveHoliday, LeaveApiError, removeLeaveHoliday } from "@/lib/leaveClient";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import EmptyState from "@/ui/EmptyState";
import Field from "@/ui/Field";
import { DateInput, TextInput } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import { useLeaveData, withLeaveDeadline } from "./LeaveData";
import { useAdminLeaveAction } from "./useAdminLeaveAction";
import styles from "./AdminLeave.module.css";
import leaveStyles from "./Leave.module.css";

type Attempt = { holiday: LeaveHoliday; version: number };
const duplicateDate = "There is already a holiday on this date.";

function byYear(holidays: LeaveHoliday[]) {
  const years = new Map<string, LeaveHoliday[]>();
  for (const holiday of [...holidays].sort((a, b) => a.date.localeCompare(b.date))) {
    const year = holiday.date.slice(0, 4);
    const rows = years.get(year) ?? [];
    rows.push(holiday);
    years.set(year, rows);
  }
  return years;
}

export default function HolidaysSheet({ team, email, onClose, onReload }: {
  team: TeamLeave;
  email: string;
  onClose: () => void;
  onReload: () => Promise<TeamLeave | undefined>;
}) {
  const { online, refresh: refreshMine } = useLeaveData();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const add = useAdminLeaveAction("Couldn’t confirm the holiday was added. Check your connection and try again.", form);
  const remove = useAdminLeaveAction("Couldn’t confirm the holiday was removed. Check your connection and try again.");
  const [draft, setDraft] = useState({ date: "", name: "" });
  const [target, setTarget] = useState<Attempt | null>(null);
  const [confirmedVersion, setConfirmedVersion] = useState(0);
  const [reloading, setReloading] = useState(false);
  const addition = useRef<Attempt | null>(null);
  const holidayList = useRef<HTMLDivElement>(null);
  const lastToast = useRef<number | null>(null);
  const syncing = confirmedVersion > team.holidayVersion;
  const blocked = add.busy || remove.busy || syncing || reloading;

  function edit(patch: Partial<LeaveHoliday>) {
    addition.current = null;
    add.clearError();
    setDraft((previous) => ({ ...previous, ...patch }));
  }

  async function synchronize(version: number, active: boolean) {
    if (active) setConfirmedVersion((previous) => Math.max(version, previous));
    await onReload();
    // Mine's own balance and working days use these same holidays.
    void refreshMine(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || add.conflict || target) return;
    void add.run(async (isActive) => {
      const holiday = { ...draft, name: draft.name.trim() };
      if (!isIsoDay(holiday.date)) {
        const message = "Enter a valid holiday date.";
        throw new LeaveApiError(400, message, [{ field: "date", message }]);
      }
      if (!holiday.name || holiday.name.length > 60) {
        const message = "Enter a holiday name from 1 to 60 characters.";
        throw new LeaveApiError(400, message, [{ field: "name", message }]);
      }
      if (!addition.current && team.holidays.some(({ date }) => date === holiday.date)) {
        throw new LeaveApiError(409, duplicateDate, [{ field: "date", message: duplicateDate }]);
      }
      const current = addition.current ?? { holiday, version: team.holidayVersion };
      addition.current = current;
      const { holiday: saved, holidayVersion } = await withLeaveDeadline((signal) => addLeaveHoliday(current.holiday, current.version, { email, signal }));
      if (saved?.date !== holiday.date || saved?.name !== holiday.name || !Number.isSafeInteger(holidayVersion)) throw new Error("Unconfirmed holiday");
      await synchronize(holidayVersion, isActive());
      if (isActive()) {
        edit({ date: "", name: "" });
        lastToast.current = toast("Holiday added");
      }
    });
  }

  function closeRemoval() {
    remove.clearError();
    setTarget(null);
  }

  function focusList() {
    holidayList.current?.focus({ preventScroll: true });
  }

  function confirmRemoval() {
    if (!target) return;
    void remove.run(async (isActive) => {
      if (remove.conflict) {
        if (!await onReload()) throw new LeaveApiError(409, "Couldn’t reload the holidays. Try again.");
        if (isActive()) {
          closeRemoval();
          focusList();
        }
        return;
      }
      const { holiday, holidayVersion } = await withLeaveDeadline((signal) => removeLeaveHoliday(target.holiday.date, target.version, { email, signal }));
      if (holiday !== null || !Number.isSafeInteger(holidayVersion)) throw new Error("Unconfirmed removal");
      await synchronize(holidayVersion, isActive());
      if (isActive()) {
        if (draft.date === target.holiday.date && add.fieldError("date") === duplicateDate) add.clearError();
        closeRemoval();
        focusList();
        lastToast.current = toast("Holiday removed");
      }
    });
  }

  function reloadAddition() {
    void add.run(async () => {
      if (!await onReload()) throw new LeaveApiError(409, "Couldn’t reload the holidays. Try again.");
      addition.current = null;
    });
  }

  async function reloadList() {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  }

  return <>
    <Sheet open visibleOnOpen title="Holidays" onClose={onClose}>
      <div className={styles.holidaySheet}>
        <Notice>Changing a holiday recounts every request on that day.</Notice>
        {!online && <Notice tone="warning" icon="wifi">Leave needs a connection.</Notice>}
        {syncing && !add.busy && !remove.busy && <Notice tone="error" action={
          <Button small busy={reloading} onClick={() => void reloadList()}>Try again</Button>
        }>Couldn’t refresh the holiday list.</Notice>}
        <form className={styles.adminForm} ref={form} onSubmit={submit} noValidate>
          {add.message && <Notice tone="error" action={add.conflict && <Button small data-leave-reload busy={add.busy} onClick={reloadAddition}>Reload holidays</Button>}>
            {add.message}
          </Notice>}
          <fieldset className={styles.fields} disabled={blocked || add.conflict}>
            <div className={styles.holidayFields}>
              <Field label="Date" error={add.fieldError("date")}>{(control) => (
                <DateInput {...control} required value={draft.date} onChange={(date) => edit({ date })} />
              )}</Field>
              <Field label="Holiday name" error={add.fieldError("name")}>{(control) => (
                <TextInput {...control} required maxLength={60} value={draft.name} onChange={(event) => edit({ name: event.target.value })} />
              )}</Field>
            </div>
          </fieldset>
          <Button className={styles.addHoliday} variant="main" type="submit" disabled={syncing || remove.busy || add.conflict || reloading}
            busy={add.busy} busyLabel="Adding…">Add holiday</Button>
        </form>
        <div tabIndex={-1} ref={holidayList} className={styles.holidayYears}>
          {!team.holidays.length && <EmptyState icon="cal" size="small" title="No holidays yet" />}
          {[...byYear(team.holidays)].map(([year, holidays]) => <section key={year} aria-label={year}>
            <h3>{year}</h3>
            <ul className={leaveStyles.rows}>{holidays.map((holiday) => <li className={leaveStyles.row} key={holiday.date}>
              <span className={leaveStyles.rowCopy}><b>{holiday.name}</b><small>{weekdayDate(holiday.date, team.today)}</small></span>
              <Button small variant="quietRed" aria-label={`Remove ${holiday.name}, ${weekdayDate(holiday.date, team.today)}`}
                disabled={blocked} onClick={() => {
                  if (lastToast.current !== null) toast.dismiss(lastToast.current);
                  lastToast.current = null;
                  remove.clearError();
                  setTarget({ holiday, version: team.holidayVersion });
                }}>Remove</Button>
            </li>)}</ul>
          </section>)}
        </div>
      </div>
    </Sheet>
    {target && <Dialog open alert visibleOnOpen title="Remove this holiday?" quote={target.holiday.name} busy={remove.busy}
      onClose={closeRemoval} initialFocus="[data-cancel]"
      actions={<>
        <Button data-cancel disabled={remove.busy} onClick={closeRemoval}>Cancel</Button>
        <Button variant={remove.conflict ? "main" : "danger"} busy={remove.busy} busyLabel={remove.conflict ? "Loading…" : "Removing…"} onClick={confirmRemoval}>
          {remove.conflict ? "Reload holidays" : "Remove holiday"}
        </Button>
      </>}>
      {remove.message ? <Notice tone="error">{remove.message}</Notice>
        : <p>Leave requests on {weekdayDate(target.holiday.date, team.today)} will be recounted.</p>}
    </Dialog>}
  </>;
}
