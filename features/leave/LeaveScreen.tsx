"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { over, without } from "@/desk/areas";
import { addDays, shortDate, weekdayDate } from "@/lib/dates";
import { dateRange, days, LEAVE_TYPE_LABELS, requestDaysLabel } from "@/lib/leave";
import { LeaveApiError } from "@/lib/leaveClient";
import type { MyLeave } from "@/lib/leave.server";
import type { LeaveSummary } from "@/lib/leaveLedger";
import { safeSignInNext } from "@/lib/signInClient";
import { retrySignInSession, signOutDevice, useSignInSession } from "@/lib/useSignedIn";
import Button from "@/ui/Button";
import buttonStyles from "@/ui/Button.module.css";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import { LoadingLine, Skeleton } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { dismissSignInNotice } from "@/features/sign-in/signInNotice";
import AskLeaveSheet from "./AskLeaveSheet";
import { useLeaveData } from "./LeaveData";
import { leaveDay } from "./leaveDay";
import RequestSheet, { RequestStatus } from "./RequestSheet";
import TeamLeaveScreen from "./TeamLeaveScreen";
import styles from "./Leave.module.css";

const leavePath = "/leave";
const views = [{ value: "requests", label: "Requests" }, { value: "history", label: "History" }] as const;
type View = typeof views[number]["value"];
const audiences = [{ value: "mine", label: "Mine" }, { value: "team", label: "Team" }] as const;
type RequestRow = MyLeave["requests"][number];

export function LeaveLoading() {
  return (
    <div className={styles.stack}>
      <div className={styles.balance}>
        <div className={styles.balanceTop}>
          <div>
            <LoadingLine>Loading leave</LoadingLine>
            <Skeleton width="9rem" height="2.75rem" />
          </div>
          <Skeleton width="8rem" height="2.75rem" />
        </div>
        <div className={styles.totals} aria-hidden="true">
          <Skeleton width="100%" height="3.625rem" />
          <Skeleton width="100%" height="3.625rem" />
          <Skeleton width="100%" height="3.625rem" />
        </div>
      </div>
      <div className={styles.skeletonRows} aria-hidden="true">
        <Skeleton width="100%" height="3.5rem" />
        <Skeleton width="100%" height="3.5rem" />
      </div>
    </div>
  );
}

export default function LeaveScreen() {
  const search = useSearchParams();
  const router = useRouter();
  const { person, ready, error: sessionError } = useSignInSession();
  const { online, data, error, refresh } = useLeaveData();
  const toast = useToast();
  const openedHere = useRef<string | null>(null);
  const openedAskHere = useRef(false);
  const sentToast = useRef<number | null>(null);
  const warned = useRef<string | null>(null);
  const wantsTeam = search.get("view") === "team";
  const showTeam = !!data?.isAdmin && wantsTeam;
  const asking = !wantsTeam && search.get("ask") === "1";
  const requestId = search.get("request");
  const selected = !wantsTeam ? data?.requests.find(({ id }) => id === requestId) : undefined;
  const view = search.get("view") === "history" ? "history" : "requests";

  useEffect(() => {
    if (requestId === null) {
      openedHere.current = null;
      warned.current = null;
    } else if (!asking && data?.profile && !selected && warned.current !== requestId && !wantsTeam) {
      warned.current = requestId;
      toast("This leave request couldn't be found.");
      router.replace(without(leavePath, search, ["request"]), { scroll: false });
    }
  }, [asking, data, requestId, router, search, selected, toast, wantsTeam]);

  useEffect(() => {
    if (data && !data.isAdmin && wantsTeam) {
      router.replace(without(leavePath, search, ["view", "request", "person", "ask"]), { scroll: false });
    }
  }, [data, router, search, wantsTeam]);

  useEffect(() => {
    if (!asking) openedAskHere.current = false;
    if (asking) dismissSignInNotice();
    if ((asking || requestId) && sentToast.current !== null) {
      toast.dismiss(sentToast.current);
      sentToast.current = null;
    }
  }, [asking, requestId, toast]);

  function closeRequest() {
    if (openedHere.current === requestId) router.back();
    else router.replace(without(leavePath, search, ["request"]), { scroll: false });
  }

  function closeAsk(sent = false) {
    if (openedAskHere.current && !(sent && view === "history")) router.back();
    else router.replace(without(leavePath, search, sent ? ["ask", "request", "view"] : ["ask"]), { scroll: false });
  }

  if (!online && !(asking && data?.summary)) return <Notice tone="warning" icon="wifi" title="Leave needs a connection.">Connect to the internet to see your leave.</Notice>;
  if (!ready) return <LeaveLoading />;
  if (sessionError) return <Notice tone="error" title="Couldn’t read this device’s sign-in." action={<Button small onClick={retrySignInSession}>Try again</Button>} />;
  if (!person || (error instanceof LeaveApiError && error.status === 401)) {
    const current = safeSignInNext(over(leavePath, search, ""));
    return <SignInNotice href={`/sign-in?next=${encodeURIComponent(current)}`} again={!!person} />;
  }
  if (error) {
    const title = error instanceof LeaveApiError && error.status === 403 ? "Leave access is unavailable." : "Couldn’t load leave.";
    return <Notice tone="error" title={title} action={<Button small onClick={() => void refresh()}>Try again</Button>} />;
  }
  if (!data) return <LeaveLoading />;
  const switcher = data.isAdmin && (
    <div className={styles.audience}>
      <Segmented label="Whose leave" options={[...audiences]} value={showTeam ? "team" : "mine"} onChange={(value) => {
        if ((value === "team") === showTeam) return;
        const overlays = ["request", "person", "ask"];
        const href = value === "team" ? over(leavePath, search, "view=team", overlays) : without(leavePath, search, ["view", ...overlays]);
        router.replace(href, { scroll: false });
      }} />
    </div>
  );
  if (showTeam || !data.summary) {
    return <div className={styles.stack}>
      {switcher}
      {showTeam ? <TeamLeaveScreen key={person.email} email={person.email} /> : (
        <Notice title="Your leave isn’t set up yet.">Ask {data.setupContact ?? "a Leave admin"}.</Notice>
      )}
    </div>;
  }

  return (
    <div className={styles.stack}>
      {switcher}
      <Balance summary={data.summary} today={data.today} askHref={over(leavePath, search, "ask=1", ["request"])}
        onAsk={() => { openedAskHere.current = true; }} />
      <section className={styles.records} aria-label={view === "history" ? "History" : "Requests"}>
        <Segmented<View> label="Leave records" options={[...views]} value={view} onChange={(value) => {
          const href = value === "history" ? over(leavePath, search, "view=history") : without(leavePath, search, ["view"]);
          router.replace(href, { scroll: false });
        }} />
        {view === "history" ? <History data={data} /> : data.requests.length === 0 ? (
          <EmptyState size="small" headingLevel={2} icon="pause" title="No requests yet">Requests you make will appear here.</EmptyState>
        ) : (
          <ul className={styles.rows}>
            {orderRequests(data.requests, data.today).map((request) => (
              <li key={request.id}>
                <Link className={`${styles.row} ${styles.request}`} href={over(leavePath, search, new URLSearchParams({ request: request.id }).toString())}
                  scroll={false} onNavigate={() => { openedHere.current = request.id; }}>
                  <span className={styles.rowCopy}>
                    <b>{LEAVE_TYPE_LABELS[request.type]}</b>
                    <small>{dateRange(request.start, request.end, data.today)} · {requestDaysLabel(request.days)}</small>
                  </span>
                  <RequestStatus status={request.status} />
                  <Icon name="right" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {asking ? (
        <AskLeaveSheet key={person.email} data={data} email={person.email} onClose={() => closeAsk()} onSent={(message) => {
          sentToast.current = toast(message);
          closeAsk(true);
        }} />
      ) : selected && <RequestSheet key={`${person.email}:${selected.id}`} data={data} request={selected} email={person.email} onClose={closeRequest} />}
    </div>
  );
}

function SignInNotice({ href, again }: { href: string; again: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signInAgain() {
    setBusy(true);
    setError(false);
    try {
      await signOutDevice();
      window.location.assign(href);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Notice title="Sign in to see your leave" action={again ? (
      <Button variant="main" small busy={busy} onClick={() => void signInAgain()}>Sign in</Button>
    ) : (
      <Link className={`${buttonStyles.button} ${buttonStyles.main} ${buttonStyles.small}`} href={href}>Sign in</Link>
    )}>
      {error && " Couldn’t reset this device’s sign-in. Try again."}
    </Notice>
  );
}

function orderRequests(rows: RequestRow[], today: string) {
  function group(row: RequestRow) {
    if (row.status === "waiting") return 0;
    if (row.status === "approved" && row.end >= today) return 1;
    return 2;
  }
  return [...rows].sort((a, b) => group(a) - group(b) || (group(a) < 2 ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)));
}

function Balance({ summary, today, askHref, onAsk }: { summary: LeaveSummary; today: string; askHref: string; onAsk: () => void }) {
  const heading = useId();
  const year = Number(today.slice(0, 4));
  return (
    <section className={styles.balance} aria-labelledby={heading}>
      <div className={styles.balanceTop}>
        <div>
          <h2 id={heading}>Leave balance</h2>
          <p className={styles.figure}>{days(summary.balance)}</p>
          {summary.nextPlusOne && <p className={styles.next}>Next +1 on {weekdayDate(summary.nextPlusOne, today)}</p>}
        </div>
        <Link className={`${buttonStyles.button} ${buttonStyles.main}`} href={askHref} scroll={false} onNavigate={onAsk}>
          <Icon name="plus" size={16} />Ask for leave
        </Link>
      </div>
      <dl className={styles.totals}>
        <div><dt>Coming up</dt><dd>{days(summary.upcoming)}</dd></div>
        <div><dt>Waiting</dt><dd>{days(summary.waiting)}</dd></div>
        <div className={styles.available}><dt>Available</dt><dd>{days(summary.available)}</dd></div>
      </dl>
      {summary.lapseWarning !== null && (
        <Notice tone="warning">{days(summary.lapseWarning)} from {year - 1} {summary.lapseWarning <= 1 ? "lapses" : "lapse"} after {weekdayDate(addDays(`${year}-03-01`, -1), today)}</Notice>
      )}
      {summary.balance < 0 && <Notice tone="warning">Below zero is leave taken in advance. If you leave DEUS, it is deducted from your final pay.</Notice>}
    </section>
  );
}

const auditField = {
  joinDate: "Joined", accrualStart: "+1 from", openingBalance: "Opening balance", openingDate: "Opening date",
  openingCarried: "Days carried over", endDate: "Last day",
};

function History({ data }: { data: MyLeave }) {
  const value = (entry: string | number | null) => typeof entry === "number" ? days(entry) : entry ? shortDate(entry, "") : "None";
  const rows = [
    ...[...data.ledger].reverse().map((line) => ({ key: `${line.date}:${line.kind}:${line.sourceId ?? ""}`, date: line.date, label: line.label, line })),
    ...data.changes.map((line) => ({
      key: `audit:${line.id}`, date: leaveDay(line.at),
      label: `Details changed by ${line.byName}: ${auditField[line.field]} ${value(line.from)} → ${value(line.to)}`, line: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ul className={styles.rows}>
      {rows.map(({ key, date, label, line }) => (
        <li key={key} className={styles.row}>
          <span className={styles.rowCopy}><b>{label}</b><small>{shortDate(date, data.today)}</small></span>
          {line && <span className={styles.amount}><b>{line.days > 0 ? "+" : ""}{days(line.days)}</b><small>Balance {days(line.balance)}</small></span>}
        </li>
      ))}
    </ul>
  );
}
