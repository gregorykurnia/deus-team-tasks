"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { over, without } from "@/desk/areas";
import { weekdayDate } from "@/lib/dates";
import { days } from "@/lib/leave";
import { getLeaveTeam, LeaveApiError } from "@/lib/leaveClient";
import type { TeamLeave } from "@/lib/leave.server";
import Avatar from "@/ui/Avatar";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Panel from "@/ui/Panel";
import { LoadingLine, Skeleton } from "@/ui/Skeleton";
import { useLeaveData, withLeaveDeadline } from "./LeaveData";
import WaitingLeaveCard from "./WaitingLeaveCard";
import styles from "./TeamLeave.module.css";

const path = "/leave";
const pageSize = 100;
type TeamResult = { data?: TeamLeave; error?: unknown };

export default function TeamLeaveScreen({ email }: { email: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const { data: mine, refresh: refreshMine } = useLeaveData();
  const [result, setResult] = useState<TeamResult>({});
  const [waitingLimit, setWaitingLimit] = useState(pageSize);
  const [peopleLimit, setPeopleLimit] = useState(pageSize);
  const [resolvedId, setResolvedId] = useState<string>();
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const openedHere = useRef<string | null>(null);
  const requestId = search.get("request");
  const team = result.data;

  const refreshTeam = useCallback(async () => {
    if (!mounted.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const data = await withLeaveDeadline((signal) => getLeaveTeam({ email, signal }), controller);
      if (pending.current === controller) setResult({ data });
    } catch (error) {
      if (pending.current !== controller) return;
      const denied = error instanceof LeaveApiError && (error.status === 401 || error.status === 403);
      setResult((previous) => ({ data: denied ? undefined : previous.data, error }));
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [email]);

  useEffect(() => {
    mounted.current = true;
    // Mine also reloads on focus and after a decision that finished while Team was closed.
    void refreshTeam();
    return () => {
      mounted.current = false;
      const controller = pending.current;
      pending.current = null;
      controller?.abort();
    };
  }, [mine, refreshTeam]);

  function closeRequest() {
    const opened = openedHere.current;
    openedHere.current = null;
    if (opened === requestId) router.back();
    else router.replace(without(path, search, ["request"]), { scroll: false });
  }

  async function refreshViews() {
    if (!await refreshMine(true)) void refreshTeam();
  }

  function resolved(id: string) {
    if (mounted.current) {
      const current = new URLSearchParams(window.location.search);
      if (current.get("request") === id && current.get("view") === "team") {
        setResolvedId(id);
        router.replace(without(path, current, ["request"]), { scroll: false });
        openedHere.current = null;
      }
      setResult((previous) => previous.data ? {
        ...previous, data: { ...previous.data, waiting: previous.data.waiting.filter((request) => request.id !== id) },
      } : previous);
    }
    refreshViews();
  }

  if (!team && !result.error) {
    return <Panel title="Waiting for you"><div className={styles.loading}>
      <LoadingLine>Loading team leave</LoadingLine>
      <Skeleton width="100%" height="8rem" />
    </div></Panel>;
  }

  const selected = team?.waiting.find(({ id }) => id === requestId);
  const names = new Map<string, number>();
  for (const { name } of team?.people ?? []) {
    const key = name.trim().toLowerCase();
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  const sameName = (name: string) => (names.get(name.trim().toLowerCase()) ?? 0) > 1;

  return (
    <>
      {result.error && <Notice tone="error" title={team ? "Couldn’t refresh the team’s leave." : "Couldn’t load the team’s leave."}
        action={<Button small onClick={refreshViews}>Try again</Button>} />}
      {team && <>
        {requestId && !selected && requestId !== resolvedId && <Notice title="This request is no longer waiting."
          action={<Button small onClick={closeRequest}>Close</Button>} />}
        <Panel title="Waiting for you" count={team.waiting.length}
          foot={team.waiting.length > waitingLimit && <MoreRows limit={waitingLimit} total={team.waiting.length} onMore={() => setWaitingLimit(waitingLimit + pageSize)} />}>
          {team.waiting.length === 0 ? (
            <EmptyState size="small" headingLevel={3} icon="check" title="No leave requests waiting" />
          ) : (
            <div className={styles.cards}>
              {team.waiting.slice(0, waitingLimit).map((request) => (
                <WaitingLeaveCard key={request.id} request={request} today={team.today} email={email}
                  distinguishName={sameName(request.name)}
                  href={over(path, search, new URLSearchParams({ request: request.id }).toString(), ["person"])}
                  onOpen={() => { openedHere.current = request.id; }} detailOpen={request.id === requestId}
                  onClose={closeRequest} onResolved={resolved} onAccessError={refreshViews} />
              ))}
            </div>
          )}
        </Panel>
        {selected && team.waiting.indexOf(selected) >= waitingLimit && <WaitingLeaveCard key={selected.id}
          request={selected} today={team.today} email={email} distinguishName={sameName(selected.name)}
          detailOpen onClose={closeRequest} onResolved={resolved} onAccessError={refreshViews} />}
        {team.nextMissingHolidayYear && <Notice tone="warning" title={`Add holidays for ${team.nextMissingHolidayYear}.`}>
          Until then, working-day counts exclude weekends and the holidays already listed.
        </Notice>}
        <Panel title="People"
          foot={team.people.length > peopleLimit && <MoreRows limit={peopleLimit} total={team.people.length} onMore={() => setPeopleLimit(peopleLimit + pageSize)} />}>
          <table className={styles.people}>
            <thead><tr>
              <th scope="col">Name</th><th scope="col">Balance</th><th scope="col">Available</th>
              <th scope="col" className={styles.year}>Annual leave<small>This year</small></th>
              <th scope="col" className={styles.year}>Sick days<small>This year</small></th>
              <th scope="col" className={styles.year}>Other absences<small>This year</small></th>
            </tr></thead>
            <tbody>
              {team.people.slice(0, peopleLimit).map(({ name, email, summary, counts, endDate }) => {
                const left = endDate && endDate < team.today;
                return <tr key={email} className={left ? styles.left : undefined}>
                  <th scope="row"><Link className={styles.person} scroll={false}
                    href={over(path, search, new URLSearchParams({ person: email }).toString(), ["request"])}>
                    <Avatar name={name} />
                    <span><b>{name}</b>{sameName(name) && <small>{email}</small>}
                      {left && <small>Left {weekdayDate(endDate, team.today)}</small>}</span>
                    <Icon name="right" size={14} className={styles.personArrow} />
                  </Link></th>
                  <td>{summary ? days(summary.balance) : <Unknown />}</td>
                  <td>{summary ? days(summary.available) : <Unknown />}</td>
                  <td className={styles.year}>{days(counts.annual)}</td>
                  <td className={styles.year}>{days(counts.sick)}</td>
                  <td className={styles.year}>{counts.other.toLocaleString("en-GB")}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </>}
    </>
  );
}

function Unknown() {
  return <><span aria-hidden="true">—</span><span className="sr-only">Leave isn’t set up</span></>;
}

function MoreRows({ limit, total, onMore }: { limit: number; total: number; onMore: () => void }) {
  return <div className={styles.moreRows}>
    <span>Showing {limit.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}</span>
    <Button small variant="quiet" onClick={onMore}>Show {Math.min(total - limit, pageSize)} more</Button>
  </div>;
}
