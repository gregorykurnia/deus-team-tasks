"use client";

// Past clients (guide 6.7): the totals, then the record of parent companies and their subsidiaries beside the By sector
// panel; on phones a switch (Companies / By sector) shows one side. The view (search, sector, Not counted, order, side)
// lives in the address, so a link lands on the same list and a reload keeps it. Every source loads on its own. Add a past
// client opens over it (?add=1); moving, deleting and export are dialogs, and the record edits names and sectors in place.
// Something just added or moved is shown: its parent opens and scrolls into view, with a search or filter that would hide
// it cleared.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePastClients } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { over } from "@/desk/areas";
import { useOverParam } from "@/desk/useOverParam";
import { failureMessage, useConnection } from "@/lib/connection";
import { deleteWording, subsByParent } from "@/lib/pastEdit";
import { sectorBreakdown, type HistoricalClient } from "@/lib/pastClients";
import {
  clearedPastFilters,
  figures as figuresOf,
  figuresText,
  listPast,
  pastFiltersOn,
  parsePastView,
  pastViewParams,
  sectorChoices,
  type PastViewState,
} from "@/lib/pastView";
import { plural } from "@/lib/dates";
import Button, { buttonClass } from "@/ui/Button";
import Dialog, { Confirm } from "@/ui/Dialog";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import { LoadingLine, SkeletonRow } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { useToday } from "@/ui/useToday";
import BySector from "./BySector";
import PastAddDialog from "./PastAddDialog";
import PastExportDialog from "./PastExportDialog";
import PastMoveDialog from "./PastMoveDialog";
import PastRecord, { type Reveal } from "./PastRecord";
import Totals from "./Totals";
import { usePastActions } from "./usePastActions";
import styles from "./Past.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const SEARCH_DELAY_MS = 200;
const GLOW_MS = 1800; // --dur-arrive

export default function PastScreen() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { status } = useConnection();
  const past = usePastClients();
  const toast = useToast();
  const phone = useMediaQuery(TABLET_AND_SMALLER);
  const listRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const today = useToday();

  const state = useMemo(() => parsePastView(search), [search]);

  // Rows just added or changed here glow for 1.8s.
  const [glowing, setGlowing] = useState<ReadonlySet<string>>(() => new Set());
  const glow = useCallback((id: string) => {
    setGlowing((now) => new Set(now).add(id));
    setTimeout(
      () =>
        setGlowing((now) => {
          const next = new Set(now);
          next.delete(id);
          return next;
        }),
      GLOW_MS
    );
  }, []);
  const actions = usePastActions(glow);

  // Dialogs finish later than they open: they read the record and the address as they are then.
  const rows = useRef(past.rows);
  useEffect(() => {
    rows.current = past.rows;
  });
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const reveals = useRef(0);
  // The view that shows a parent company: as it is when the parent's in the list, otherwise with the search and filters
  // cleared. Phones switch to the record.
  function viewShowing(id: string, now: PastViewState): PastViewState {
    const shown = listPast(rows.current, now).entries.some((e) => e.parent.id === id);
    return { ...(shown ? now : clearedPastFilters(now)), view: "list" };
  }
  function showParent(id: string, add = false) {
    update((now) => viewShowing(id, now));
    setReveal({ id, n: ++reveals.current, add });
  }

  const adding = useOverParam("add");
  const addHref = over(pathname, search, "add=1");
  function added(id: string, parentId: string | null) {
    // The dialog goes and the record shows where the new one went, in one step, so Back doesn't open the dialog again.
    // Written to the address in place, as the view is: no trip to the server, which may still be reconnecting.
    const params = new URLSearchParams(window.location.search);
    params.delete("add");
    const view = pastViewParams(viewShowing(parentId ?? id, parsePastView(params)), params).toString();
    window.history.replaceState(null, "", view ? `${pathname}?${view}` : pathname);
    setReveal({ id: parentId ?? id, n: ++reveals.current });
  }

  const [moving, setMoving] = useState<HistoricalClient | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<HistoricalClient | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function remove(c: HistoricalClient) {
    try {
      await actions.remove(c);
    } catch (err) {
      toast(failureMessage(err, `Couldn’t delete ${c.name}. Please try again.`), {
        error: true,
        action: "Try again",
        onAction: () => void remove(rows.current.find((x) => x.id === c.id) ?? c),
      });
    }
  }
  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    await remove(deleting);
    setDeleteBusy(false);
    setDeleting(null);
  }

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
  const sectors = useMemo(() => choices.map((c) => ({ name: c.label, count: c.count })), [choices]);
  const subs = useMemo(() => subsByParent(past.rows), [past.rows]);
  const subsOf = (id: string) => subs.get(id) ?? 0;

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
      <EmptyState
        icon="archive"
        title="No past clients yet"
        actions={
          <Link className={buttonClass("main")} href={addHref} scroll={false}>
            <Icon name="plus" size={16} />
            Add a past client
          </Link>
        }
      >
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
                actions={actions}
                sectors={sectors}
                glowing={glowing}
                reveal={reveal}
                onMove={setMoving}
                onDelete={setDeleting}
                onExport={() => setExporting(true)}
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

  const wording = deleting ? deleteWording(deleting, past.rows) : null;
  const labelOf = listing?.labelOf ?? (() => "");
  return (
    <>
      <PageHeader
        title="Past clients"
        subtitle={subtitle}
        search={phone || !ready || empty ? undefined : searchField}
        action={ready ? { label: "Add a past client", href: addHref } : undefined}
      />
      {phone && ready && !empty && <div className={styles.phoneSearch}>{searchField}</div>}
      {body}
      {adding.open && ready && (
        <PastAddDialog clients={past.rows} sectors={sectors} labelOf={labelOf} subsOf={subsOf} onClose={adding.close} onAdd={actions.add} onAdded={added} />
      )}
      {moving && (
        <PastMoveDialog
          sub={moving}
          clients={past.rows}
          labelOf={labelOf}
          subsOf={subsOf}
          onClose={() => setMoving(null)}
          onMove={async (to) => {
            await actions.move(moving, to);
            showParent(to);
          }}
          onAddParent={() => {
            setMoving(null);
            router.push(addHref, { scroll: false });
          }}
        />
      )}
      {exporting && <PastExportDialog clients={past.rows} figures={figures} filtered={pastFiltersOn(state)} today={today ?? ""} onClose={() => setExporting(false)} />}
      {deleting && wording?.blocked && (
        <Dialog
          open
          alert
          onClose={() => setDeleting(null)}
          title={wording.title}
          initialFocus="[data-show]"
          actions={
            <>
              <Button onClick={() => setDeleting(null)}>Close</Button>
              <Button
                variant="main"
                data-show
                onClick={() => {
                  setDeleting(null);
                  showParent(deleting.id);
                }}
              >
                <Icon name="tree" size={16} />
                Show its subsidiaries
              </Button>
            </>
          }
        >
          <div className={styles.blockedArt} aria-hidden="true">
            <Icon name="tree" size={22} />
          </div>
          <p>{wording.body}</p>
        </Dialog>
      )}
      {deleting && wording && !wording.blocked && (
        <Confirm open onClose={() => setDeleting(null)} onConfirm={() => void confirmDelete()} title={wording.title} confirmLabel={wording.confirm} busy={deleteBusy} busyLabel="Deleting…">
          {wording.body}
        </Confirm>
      )}
    </>
  );
}
