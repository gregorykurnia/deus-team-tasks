"use client";

// The record (guide 6.7, 4.16, R2, R7): the filters (Sector, order, show or hide all subsidiaries), the result line, and the
// parent companies as cards, 100 at a time. A parent opens its subsidiaries under a grey branch line, 50 at a time; while
// searching, only the subsidiaries that matched show, with "Show its other n subsidiaries". Names and sectors are read
// only here; changing them is task 3.13.
import { useRef, useState } from "react";
import {
  isOpen,
  nothingMatches,
  NO_SECTOR,
  PAGE_SIZE,
  PAST_SORTS,
  pastFiltersOn,
  clearedPastFilters,
  resultLine,
  sectorFilterLabel,
  SUBS_FIRST,
  SUBS_STEP,
  subsidiaries,
  type Figures,
  type PastEntry,
  type PastSort,
  type PastViewState,
  type SectorChoice,
} from "@/lib/pastView";
import type { HistoricalClient } from "@/lib/pastClients";
import { isCounted } from "@/lib/pastClients";
import { initials } from "@/lib/people";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import FilterButton, { FilterAction, FilterToggle } from "@/ui/FilterButton";
import Highlight from "@/ui/Highlight";
import Icon from "@/ui/Icon";
import Menu, { MenuChoice, MenuFoot, MenuHeading } from "@/ui/Menu";
import styles from "./Past.module.css";

const num = (n: number) => n.toLocaleString("en-GB");
const MENU_SECTORS = 60;

interface PastRecordProps {
  entries: PastEntry[];
  labelOf: (c: HistoricalClient) => string;
  state: PastViewState;
  figures: Figures;
  choices: SectorChoice[];
  resetKey: string; // what's opened, shown in full or limited starts over when the search, sector or Not counted change
  onState: (next: PastViewState) => void;
}

interface Local {
  key: string;
  open: Set<string>;
  closed: Set<string>;
  full: Set<string>;
  subLimit: Record<string, number>;
  limit: number;
}
const fresh = (key: string): Local => ({ key, open: new Set(), closed: new Set(), full: new Set(), subLimit: {}, limit: PAGE_SIZE });

export default function PastRecord({ entries, labelOf, state, figures, choices, resetKey, onState }: PastRecordProps) {
  const [stored, setStored] = useState(() => fresh(resetKey));
  const local = stored.key === resetKey ? stored : fresh(resetKey);
  const change = (patch: (l: Local) => Partial<Local>) => setStored({ ...local, ...patch(local) });
  const [menu, setMenu] = useState<"sector" | "order" | null>(null);
  const sectorRef = useRef<HTMLButtonElement>(null);
  const orderRef = useRef<HTMLButtonElement>(null);
  const q = state.q.trim();

  const open = (e: PastEntry) => isOpen(e, local);
  const anyOpen = entries.some(open);
  const toggle = (e: PastEntry) =>
    change((l) => {
      const id = e.parent.id;
      const o = new Set(l.open);
      const c = new Set(l.closed);
      if (isOpen(e, l)) {
        o.delete(id);
        c.add(id);
      } else {
        o.add(id);
        c.delete(id);
      }
      return { open: o, closed: c };
    });
  const expandAll = () => change(() => ({ open: new Set(entries.map((e) => e.parent.id)), closed: new Set() }));
  const collapseAll = () => change(() => ({ open: new Set(), closed: new Set(entries.map((e) => e.parent.id)) }));

  const shown = entries.slice(0, local.limit);
  const line = resultLine(entries, state, figures);
  const clear = () => onState(clearedPastFilters(state));

  const tools = (
    <div className={styles.filters} role="toolbar" aria-label="Filter, order and show">
      <FilterButton
        ref={sectorRef}
        icon="filter"
        label="Sector"
        value={state.sec ? sectorFilterLabel(state.sec, choices) : null}
        expanded={menu === "sector"}
        onClick={() => setMenu(menu === "sector" ? null : "sector")}
        onClear={() => onState({ ...state, sec: null })}
      />
      <Menu open={menu === "sector"} anchorRef={sectorRef} onClose={() => setMenu(null)} label="Sector">
        <MenuHeading>Show one sector</MenuHeading>
        <MenuChoice checked={!state.sec} onSelect={() => onState({ ...state, sec: null })}>
          All sectors
        </MenuChoice>
        {choices.slice(0, MENU_SECTORS).map((c) => (
          <MenuChoice key={c.key} checked={state.sec === c.key} onSelect={() => onState({ ...state, sec: c.key })}>
            {`${c.label} (${num(c.count)})`}
          </MenuChoice>
        ))}
        <MenuChoice checked={state.sec === NO_SECTOR} onSelect={() => onState({ ...state, sec: NO_SECTOR })}>
          No sector
        </MenuChoice>
        {choices.length > MENU_SECTORS && <MenuFoot>{`${num(choices.length - MENU_SECTORS)} smaller sectors are in the breakdown.`}</MenuFoot>}
      </Menu>
      {state.nc && <FilterToggle label="Showing only not counted" pressed onClick={() => onState({ ...state, nc: false })} />}
      <FilterButton
        ref={orderRef}
        icon="sort"
        label="Order"
        summary={PAST_SORTS[state.sort]}
        expanded={menu === "order"}
        onClick={() => setMenu(menu === "order" ? null : "order")}
      />
      <Menu open={menu === "order"} anchorRef={orderRef} onClose={() => setMenu(null)} label="Order parent companies by">
        <MenuHeading>Order parent companies by</MenuHeading>
        {(Object.keys(PAST_SORTS) as PastSort[]).map((k) => (
          <MenuChoice key={k} checked={state.sort === k} onSelect={() => onState({ ...state, sort: k })}>
            {PAST_SORTS[k]}
          </MenuChoice>
        ))}
        <MenuFoot>Subsidiaries are listed by name under their parent company.</MenuFoot>
      </Menu>
      {entries.length > 0 && <FilterAction icon={anyOpen ? "up" : "down"} label={anyOpen ? "Hide subsidiaries" : "Show all subsidiaries"} onClick={anyOpen ? collapseAll : expandAll} />}
    </div>
  );

  if (entries.length === 0) {
    const onlyQuery = !!q && !state.sec && !state.nc;
    return (
      <>
        {tools}
        <EmptyState
          icon="search"
          title={nothingMatches(state, choices)}
          actions={<Button onClick={clear}>{onlyQuery ? "Clear search" : "Clear filters"}</Button>}
        >
          {q ? "Search looks at the names of parent companies and subsidiaries, and at sectors." : undefined}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {tools}
      <p className={styles.result} role="status">
        <b>{line.count}</b>
        {line.rest}
        {pastFiltersOn(state) && (
          <button type="button" className={styles.linkButton} onClick={clear}>
            Clear
          </button>
        )}
      </p>
      <div className={styles.head} aria-hidden="true">
        <span />
        <span>Company</span>
        <span>Sector</span>
        <span>Subsidiaries</span>
      </div>
      <div className={styles.groups}>
        {shown.map((e) => (
          <ParentCard
            key={e.parent.id}
            entry={e}
            open={open(e)}
            query={q}
            labelOf={labelOf}
            onlyHits={!!e.hits?.length && !local.full.has(e.parent.id)}
            subLimit={local.subLimit[e.parent.id] ?? SUBS_FIRST}
            onToggle={() => toggle(e)}
            onMoreSubs={() => change((l) => ({ subLimit: { ...l.subLimit, [e.parent.id]: (l.subLimit[e.parent.id] ?? SUBS_FIRST) + SUBS_STEP } }))}
            onAllSubs={() => change((l) => ({ full: new Set(l.full).add(e.parent.id) }))}
          />
        ))}
      </div>
      {entries.length > shown.length && (
        <div className={styles.more}>
          {`Showing ${num(shown.length)} of ${num(entries.length)} parent companies`}
          <Button small onClick={() => change((l) => ({ limit: l.limit + PAGE_SIZE }))}>
            {`Show ${num(Math.min(PAGE_SIZE, entries.length - shown.length))} more`}
          </Button>
        </div>
      )}
    </>
  );
}

interface ParentCardProps {
  entry: PastEntry;
  open: boolean;
  query: string;
  labelOf: (c: HistoricalClient) => string;
  onlyHits: boolean;
  subLimit: number;
  onToggle: () => void;
  onMoreSubs: () => void;
  onAllSubs: () => void;
}

function ParentCard({ entry, open, query, labelOf, onlyHits, subLimit, onToggle, onMoreSubs, onAllSubs }: ParentCardProps) {
  const { parent: p, subs } = entry;
  const counted = isCounted(p);
  const n = subs.length;
  const sector = labelOf(p);
  // A click on the card that isn't on a button shows or hides its subsidiaries, as the chevron does.
  const fromCard = (e: React.MouseEvent<HTMLElement>) => {
    if (n && e.target instanceof Element && !e.target.closest("button, a, input")) onToggle();
  };
  return (
    <article className={[styles.group, open && styles.open].filter(Boolean).join(" ")} aria-label={p.name}>
      {/* The card's own click is a mouse shortcut for the chevron, which is the keyboard way in. */}
      <div className={[styles.parent, !counted && styles.uncounted].filter(Boolean).join(" ")} onClick={fromCard}>
        <button
          type="button"
          className={styles.chev}
          aria-expanded={n ? open : undefined}
          aria-label={n ? `${open ? "Hide" : "Show"} the subsidiaries of ${p.name}` : "No subsidiaries"}
          disabled={!n}
          onClick={onToggle}
        >
          {n > 0 && <Icon name={open ? "down" : "right"} size={16} />}
        </button>
        <div className={styles.name}>
          <span className={styles.mono} aria-hidden="true">
            {initials(p.name)}
          </span>
          <span className={styles.title}>
            <Highlight text={p.name} query={query} />
          </span>
          {!counted && <span className={styles.tag}>Not counted</span>}
        </div>
        <SectorPill sector={sector} query={query} />
        {n ? (
          <button type="button" className={styles.count} tabIndex={-1} onClick={onToggle}>
            <Icon name="tree" size={16} />
            {subsidiaries(n)}
          </button>
        ) : (
          <span className={styles.count}>
            <span className={styles.none}>None</span>
          </span>
        )}
      </div>
      {open && (
        <SubsBlock entry={entry} query={query} labelOf={labelOf} counted={counted} onlyHits={onlyHits} limit={subLimit} onMore={onMoreSubs} onAll={onAllSubs} />
      )}
    </article>
  );
}

function SubsBlock({ entry, query, labelOf, counted, onlyHits, limit, onMore, onAll }: { entry: PastEntry; query: string; labelOf: (c: HistoricalClient) => string; counted: boolean; onlyHits: boolean; limit: number; onMore: () => void; onAll: () => void }) {
  const { parent: p, subs, hits } = entry;
  const list = onlyHits && hits ? hits : subs;
  const shown = list.slice(0, limit);
  return (
    <div className={styles.subs} role="group" aria-label={`Subsidiaries of ${p.name}`}>
      {!counted && (
        <p className={styles.subsNote}>
          <Icon name="info" size={15} />
          <span>{`${p.name} isn’t counted in the totals. Its ${subsidiaries(subs.length)} ${subs.length === 1 ? "is" : "are"}.`}</span>
        </p>
      )}
      {shown.map((s, i) => {
        const sector = labelOf(s);
        return (
          <div key={s.id} className={[styles.sub, i === shown.length - 1 && styles.last].filter(Boolean).join(" ")} role="group" aria-label={s.name}>
            <span className={styles.branch} aria-hidden="true" />
            <div className={styles.name}>
              <span className={styles.title}>
                <Highlight text={s.name} query={query} />
              </span>
            </div>
            <SectorPill sector={sector} query={query} />
            <span />
          </div>
        );
      })}
      {list.length > shown.length && (
        <div className={styles.subMore}>
          {`Showing ${num(shown.length)} of ${num(list.length)}`}
          <Button small onClick={onMore}>
            {`Show ${num(Math.min(SUBS_STEP, list.length - shown.length))} more`}
          </Button>
        </div>
      )}
      {onlyHits && hits && subs.length > hits.length && (
        <button type="button" className={styles.subAll} onClick={onAll}>
          {`Show its other ${subsidiaries(subs.length - hits.length)}`}
        </button>
      )}
    </div>
  );
}

function SectorPill({ sector, query }: { sector: string; query: string }) {
  return (
    <span className={styles.sector}>
      {sector ? (
        <span className={styles.pill}>
          <Highlight text={sector} query={query} />
        </span>
      ) : (
        <span className={styles.none}>No sector</span>
      )}
    </span>
  );
}
