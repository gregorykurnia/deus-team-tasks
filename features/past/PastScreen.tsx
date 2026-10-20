"use client";

// Past clients (guide 6.7): the totals, then the record of parent companies and their subsidiaries beside the By sector
// panel; on phones a switch (Companies / By sector) shows one side. The view (search, sector, Not counted, order, side)
// lives in the address, so a link lands on the same list and a reload keeps it. Every source loads on its own. Reading is
// task 3.12; adding, renaming, moving and deleting are 3.13.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePastClients } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { useConnection } from "@/lib/connection";
import { sectorBreakdown } from "@/lib/pastClients";
import {
  figures as figuresOf,
  figuresText,
  listPast,
  parsePastView,
  pastViewParams,
  sectorChoices,
  type PastViewState,
} from "@/lib/pastView";
import { plural } from "@/lib/dates";
import EmptyState from "@/ui/EmptyState";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import { LoadingLine, SkeletonRow } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { useMediaQuery } from "@/ui/useMediaQuery";
import BySector from "./BySector";
import PastRecord from "./PastRecord";
import Totals from "./Totals";
import styles from "./Past.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const SEARCH_DELAY_MS = 200;

export default function PastScreen() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { status } = useConnection();
  const past = usePastClients();
  const toast = useToast();
  const phone = useMediaQuery(TABLET_AND_SMALLER);
  const listRef = useRef<HTMLElement>(null);

  const state = useMemo(() => parsePastView(search), [search]);

  // The view is written to the address in place, so Back leaves the screen rather than stepping through filters. It's read
  // fresh from the address, so a change that lands while another is still settling isn't lost.
  function update(change: (now: PastViewState) => PastViewState) {
    const current = new URLSearchParams(window.location.search);
    const query = pastViewParams(change(parsePastView(current)), current).toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  // Search is typed as you go, and the address follows 200ms later. What's typed is never replaced by an older address.
  const [typed, setTyped] = useState(state.q);
  const committed = useRef(state.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (state.q !== committed.current) {
      committed.current = state.q;
      setTyped(state.q);
    }
  }, [state.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function onSearch(value: string) {
    setTyped(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      committed.current = value;
      // Searching shows the record, on phones too.
      update((now) => ({ ...now, q: value, view: value.trim() ? "list" : now.view }));
    }, SEARCH_DELAY_MS);
  }

  const failed = !!past.error && past.rows.length === 0;
  const offlineEmpty = status === "offline" && past.fromCache && past.rows.length === 0 && !past.error;
  const waiting = past.loading || (past.fromCache && past.rows.length === 0 && status === "connecting");
  const ready = !waiting && !failed && !offlineEmpty;
  const empty = ready && past.rows.length === 0;

  const figures = useMemo(() => (ready ? figuresOf(past.rows) : null), [ready, past.rows]);
  const breakdown = useMemo(() => (ready ? sectorBreakdown(past.rows) : null), [ready, past.rows]);
  const choices = useMemo(() => (ready ? sectorChoices(past.rows) : []), [ready, past.rows]);
  const listing = useMemo(() => (ready ? listPast(past.rows, state) : null), [ready, past.rows, state]);

  async function copyFigures() {
    try {
      await navigator.clipboard.writeText(figuresText(past.rows));
      toast("Figures copied, ready to paste");
    } catch {
      toast("Couldn’t copy the figures. Select them on the page and copy them instead.", { error: true });
    }
  }

  // A sector from the breakdown filters the record; on phones that shows the record.
  function pickSector(key: string) {
    const turningOn = state.sec !== key;
    update((now) => ({ ...now, sec: now.sec === key ? null : key, view: phone && turningOn ? "list" : now.view }));
    if (phone && turningOn) requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "start" }));
  }

  const searchField = <SearchField label="Search past clients" value={typed} onChange={onSearch} placeholder="Search companies and sectors" />;
  const subtitle = figures && !empty ? `${plural(figures.total, "client")} served` : undefined;

  let body;
  if (failed) {
    body = (
      <div className={styles.note}>
        <Notice tone="error" title="Couldn't load past clients.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (offlineEmpty) {
    body = (
      <EmptyState icon="wifi" title="No connection">
        The record of past clients will appear once you are back online.
      </EmptyState>
    );
  } else if (empty) {
    body = (
      <EmptyState icon="archive" title="No past clients yet">
        Keep a record of every company we’ve served, with its sector and any subsidiaries, so the team can quote how many clients we’ve had and where our experience lies.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <Totals figures={figures} notCounted={state.nc} onCopy={copyFigures} onNotCounted={() => update((now) => ({ ...now, nc: !now.nc, view: "list" }))} />
        <div className={styles.view}>
          <Segmented
            label="Show"
            full
            value={state.view}
            options={[
              { value: "list", label: "Companies", icon: "archive" },
              { value: "sectors", label: "By sector", icon: "choice" },
            ]}
            onChange={(view) => update((now) => ({ ...now, view: view ?? "list" }))}
          />
        </div>
        <div className={styles.wrap} data-view={state.view}>
          <section ref={listRef} className={`${styles.panel} ${styles.listPanel}`} aria-label="Past clients">
            {listing && figures ? (
              <PastRecord
                entries={listing.entries}
                labelOf={listing.labelOf}
                state={state}
                figures={figures}
                choices={choices}
                resetKey={`${state.q.trim()}|${state.sec ?? ""}|${state.nc}`}
                onState={(next) => update(() => next)}
              />
            ) : (
              <>
                <LoadingLine>Loading past clients</LoadingLine>
                <div className={styles.skeletons}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SkeletonRow key={n} />
                  ))}
                </div>
              </>
            )}
          </section>
          <BySector breakdown={breakdown} anyOnRecord={past.rows.length > 0} current={state.sec} onPick={pickSector} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Past clients" subtitle={subtitle} search={phone || !ready || empty ? undefined : searchField} />
      {phone && ready && !empty && <div className={styles.phoneSearch}>{searchField}</div>}
      {body}
    </>
  );
}
