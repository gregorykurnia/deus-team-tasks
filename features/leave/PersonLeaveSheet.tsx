"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { weekdayDate } from "@/lib/dates";
import { getPersonLeave, LeaveApiError } from "@/lib/leaveClient";
import type { PersonLeave, TeamLeave } from "@/lib/leave.server";
import Avatar from "@/ui/Avatar";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import Sheet from "@/ui/Sheet";
import { LoadingLine, Skeleton } from "@/ui/Skeleton";
import AskLeaveSheet from "./AskLeaveSheet";
import { useLeaveData, withLeaveDeadline } from "./LeaveData";
import { LeaveBalance, LeaveHistory, LeaveRequests, leaveRecordViews, type LeaveRecordView } from "./LeaveRecords";
import { AdjustBalanceSheet, LeaveDetailsSheet } from "./PersonLeaveForms";
import RequestSheet from "./RequestSheet";
import styles from "./AdminLeave.module.css";
import leaveStyles from "./Leave.module.css";

type Panel = { action: "add" | "adjust" | "details" } | { action: "request"; id: string };
type Result = { data?: PersonLeave; error?: unknown };

export default function PersonLeaveSheet({ email, address, team, onClose, onChanged }: {
  email: string; address: string; team: TeamLeave; onClose: () => void; onChanged: () => void;
}) {
  const { online } = useLeaveData();
  const [result, setResult] = useState<Result>({});
  const [view, setView] = useState<LeaveRecordView>("requests");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [returnFocus, setReturnFocus] = useState<string>();
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const data = await withLeaveDeadline((signal) => getPersonLeave(address, { email, signal }), controller);
      if (pending.current !== controller) return;
      setResult({ data });
      return data;
    } catch (error) {
      if (pending.current !== controller) return;
      const unavailable = error instanceof LeaveApiError && [401, 403, 404].includes(error.status);
      setResult((previous) => ({ data: unavailable ? undefined : previous.data, error }));
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [address, email]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const controller = pending.current;
      pending.current = null;
      controller?.abort();
    };
  }, []);
  useEffect(() => {
    if (online) void refresh();
  }, [team, online, refresh]);

  async function refreshAfterAction() {
    const current = await refresh();
    onChanged();
    return current;
  }

  function openPanel(next: Panel) {
    setConfirmation("");
    setReturnFocus(next.action === "request" ? `[data-leave-request="${CSS.escape(next.id)}"]` : `[data-leave-action="${next.action}"]`);
    setPanel(next);
  }

  function closePanel() {
    setPanel(null);
  }

  function saved(message: string, nextView: LeaveRecordView) {
    setView(nextView);
    closePanel();
    setConfirmation(message);
  }

  const { data, error } = result;
  const name = data?.person.name ?? team.people.find((person) => person.email === address)?.name;
  const endDate = data?.profile?.endDate;
  const meta = data && (endDate && endDate < data.today ? `Left ${weekdayDate(endDate, data.today)}` : data.person.email);
  const formProps = { email, onClose: closePanel, onRefresh: refreshAfterAction, onSaved: (message: string) => saved(message, "history") };

  if (panel && data) {
    if (panel.action === "details") return <LeaveDetailsSheet data={data} {...formProps} />;
    if (panel.action === "adjust") return <AdjustBalanceSheet data={data} {...formProps} />;
    if (panel.action === "add") return <AskLeaveSheet data={{ ...data, isAdmin: true }} email={email}
      recipient={{ email: data.person.email, name: data.person.name, refresh: refreshAfterAction }}
      onClose={closePanel} onSent={(message) => saved(message, "requests")} />;
    const request = panel.action === "request" ? data.requests.find(({ id }) => id === panel.id) : undefined;
    if (request) return <RequestSheet compact data={{ ...data, isAdmin: true }} request={request} email={email} onClose={closePanel} onRefresh={refreshAfterAction} />;
  }

  return <Sheet open visibleOnOpen title={name ?? "Person leave"} lead={name && <Avatar name={name} size="plan" />}
    meta={meta && <span className={styles.personMeta}>{meta}</span>}
    initialFocus={returnFocus} onClose={onClose}>
    <div className={styles.personSheet}>
      {!online && <Notice tone="warning" icon="wifi">Leave needs a connection.</Notice>}
      {error !== undefined && <Notice tone="error" title={error instanceof LeaveApiError && error.status === 404 ? "This person isn’t available." : "Couldn’t load this person’s leave."}
        action={<Button small onClick={() => void refresh()}>Try again</Button>} />}
      {!data && !error && online && <div className={leaveStyles.stack}>
        <LoadingLine>Loading leave</LoadingLine><Skeleton width="100%" height="8rem" />
      </div>}
      {data && <>
        {data.summary ? <LeaveBalance summary={data.summary} today={data.today}
          action={<Button variant="main" data-leave-action="add" onClick={() => openPanel({ action: "add" })}>
            <Icon name="plus" size={16} />Add leave
          </Button>} /> : <Notice title="Leave isn’t set up for this person." />}
        <div className={styles.personActions}>
          {data.profile && <Button data-leave-action="adjust" onClick={() => openPanel({ action: "adjust" })}>Adjust balance</Button>}
          <Button data-leave-action="details" onClick={() => openPanel({ action: "details" })}>Leave details</Button>
        </div>
        {data.profile && <section className={leaveStyles.records} aria-label={view === "history" ? "History" : "Requests"}>
          {confirmation && <div role="status"><Notice tone="success">{confirmation}</Notice></div>}
          <Segmented label="Leave records" options={[...leaveRecordViews]} value={view} onChange={(next) => { if (next) setView(next); }} />
          {view === "history" ? <LeaveHistory data={{ ...data, changes: data.audit }} /> : (
            <LeaveRequests data={data} navigation={{ onSelect: (id) => openPanel({ action: "request", id }) }} />
          )}
        </section>}
      </>}
    </div>
  </Sheet>;
}
