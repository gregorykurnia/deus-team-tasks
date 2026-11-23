import Link from "next/link";
import { useId, type ReactNode } from "react";
import { addDays, shortDate, weekdayDate } from "@/lib/dates";
import { dateRange, days, LEAVE_TYPE_LABELS, requestDaysLabel } from "@/lib/leave";
import type { MyLeave } from "@/lib/leave.server";
import type { LeaveSummary } from "@/lib/leaveLedger";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import { leaveDay } from "./leaveDay";
import { RequestStatus } from "./RequestSheet";
import styles from "./Leave.module.css";

export const leaveRecordViews = [{ value: "requests", label: "Requests" }, { value: "history", label: "History" }] as const;
export type LeaveRecordView = typeof leaveRecordViews[number]["value"];
type RequestRow = MyLeave["requests"][number];
type RequestNavigation = { href: (id: string) => string; onNavigate: (id: string) => void } | { onSelect: (id: string) => void };

export function LeaveRequests({ data, navigation, empty }: {
  data: Pick<MyLeave, "today" | "requests">; navigation: RequestNavigation; empty?: ReactNode;
}) {
  if (!data.requests.length) {
    return <EmptyState size="small" headingLevel={2} icon="pause" title="No requests yet">{empty}</EmptyState>;
  }

  const className = `${styles.row} ${styles.request}`;
  return <ul className={styles.rows}>
    {orderRequests(data.requests, data.today).map((request) => {
      const content = <>
        <span className={styles.rowCopy}>
          <b>{LEAVE_TYPE_LABELS[request.type]}</b>
          <small>{dateRange(request.start, request.end, data.today)} · {requestDaysLabel(request.days)}</small>
        </span>
        <RequestStatus status={request.status} />
        <Icon name="right" size={16} />
      </>;
      return <li key={request.id}>
        {"href" in navigation ? (
          <Link className={className} href={navigation.href(request.id)} scroll={false} onNavigate={() => navigation.onNavigate(request.id)}>
            {content}
          </Link>
        ) : (
          <button className={`${className} ${styles.requestButton}`} type="button" data-leave-request={request.id} onClick={() => navigation.onSelect(request.id)}>
            {content}
          </button>
        )}
      </li>;
    })}
  </ul>;
}

function orderRequests(rows: RequestRow[], today: string) {
  function group(row: RequestRow) {
    if (row.status === "waiting") return 0;
    if (row.status === "approved" && row.end >= today) return 1;
    return 2;
  }
  return [...rows].sort((a, b) => group(a) - group(b) || (group(a) < 2 ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)));
}

export function LeaveBalance({ summary, today, action }: { summary: LeaveSummary; today: string; action?: ReactNode }) {
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
        {action}
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

export function LeaveHistory({ data }: { data: Pick<MyLeave, "today" | "ledger" | "changes"> }) {
  const value = (entry: string | number | null) => typeof entry === "number" ? days(entry) : entry ? shortDate(entry, "") : "None";
  const rows = [
    ...[...data.ledger].reverse().map((line) => ({ key: `${line.date}:${line.kind}:${line.sourceId ?? ""}`, date: line.date, label: line.label, line })),
    ...data.changes.map((line) => ({
      key: `audit:${line.id}`, date: leaveDay(line.at),
      label: <>Details changed by {line.byName}: {auditField[line.field]}{" "}
        <span className={styles.auditValue}>{value(line.from)}</span>{" → "}
        <span className={styles.auditValue}>{value(line.to)}</span></>, line: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ul className={styles.rows}>
      {rows.map(({ key, date, label, line }) => (
        <li key={key} className={line?.kind === "adjustment" ? `${styles.row} ${styles.adjustmentHistory}` : styles.row}>
          <span className={styles.rowCopy}><b>{label}</b><small>{shortDate(date, data.today)}</small></span>
          {line && <span className={styles.amount}><b>{line.days > 0 ? "+" : ""}{days(line.days)}</b><small>Balance {days(line.balance)}</small></span>}
        </li>
      ))}
    </ul>
  );
}
