"use client";

// The list column (guide 6.6): How likely across every prospect, whose legend filters the list, then Show (all, tracked,
// not tracked yet), Order and Export, the result line and each prospect with its group or "Not tracked yet", when it was
// last edited, its likelihood and, while searching, where the words were found.
import Link from "next/link";
import { useRef, useState } from "react";
import { COMPANY_GROUP_LABELS } from "@/lib/companies";
import type { CompaniesById } from "@/lib/kinds";
import { isTagged, useArrival } from "@/lib/liveChanges";
import { LIKELIHOODS, likelihoodSpread, likelihoodStep } from "@/lib/notes";
import {
  editedLine,
  groupOfNotes,
  LIKELIHOOD_IDS,
  LIKELIHOOD_WORDS,
  noMatchCopy,
  NOT_RATED,
  notesFiltersOn,
  resultLine,
  snippetOf,
  SORTS,
  TRACK_LABELS,
  type NotesRow,
  type NotesSort,
  type NotesViewState,
  type Track,
} from "@/lib/notesView";
import { initials } from "@/lib/people";
import { plural } from "@/lib/dates";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import FilterButton, { FilterAction } from "@/ui/FilterButton";
import Highlight from "@/ui/Highlight";
import Menu, { MenuChoice, MenuHeading } from "@/ui/Menu";
import { LikelihoodMeter, type Rating } from "@/ui/Meter";
import { GroupTag, LiveTag, OutsideTag } from "@/ui/Tag";
import styles from "./Notes.module.css";

interface NotesListProps {
  entries: ProspectJournalEntry[]; // every prospect, for How likely
  rows: NotesRow[]; // filtered and in order
  companies: CompaniesById;
  state: NotesViewState;
  limit: number;
  current: string | null;
  today: string;
  replace: boolean; // choosing a prospect replaces the address on large screens, so Back leaves the screen
  hrefFor: (id: string) => string;
  onPick: (id: string) => void;
  onState: (next: NotesViewState) => void;
  onClear: () => void;
  onMore: () => void;
  onExport: () => void;
}

export default function NotesList({ entries, rows, companies, state, limit, current, today, replace, hrefFor, onPick, onState, onClear, onMore, onExport }: NotesListProps) {
  const q = state.q.trim();
  const shown = rows.slice(0, limit);
  const line = resultLine(rows.length, entries.length, state);
  return (
    <div className={styles.col}>
      <Spread entries={entries} value={state.lk} onPick={(lk) => onState({ ...state, lk: state.lk === lk ? null : lk })} />
      <section className={styles.panel} aria-label="Prospects">
        <ListTools state={state} onState={onState} onExport={onExport} />
        {rows.length === 0 ? (
          <NoMatch state={state} onClear={onClear} />
        ) : (
          <>
            <p className={styles.result} role="status">
              <b>{line.lead}</b>
              {line.rest}
              {notesFiltersOn(state) && (
                <button type="button" className={styles.linkButton} onClick={onClear}>
                  Clear
                </button>
              )}
            </p>
            <div className={styles.list}>
              {shown.map((row) => (
                <Item key={row.entry.id} row={row} companies={companies} query={q} current={current === row.entry.id} today={today} href={hrefFor(row.entry.id)} replace={replace} onPick={onPick} />
              ))}
            </div>
            {rows.length > shown.length && (
              <div className={styles.more}>
                Showing {shown.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
                <Button small onClick={onMore}>
                  Show {Math.min(100, rows.length - shown.length).toLocaleString("en-US")} more
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// How likely (U2): one bar split into five blues and grey stripes, with a legend of counts that each filter the list.
function Spread({ entries, value, onPick }: { entries: ProspectJournalEntry[]; value: string | null; onPick: (lk: string) => void }) {
  const { counts, notRated } = likelihoodSpread(entries);
  const steps = [...LIKELIHOODS.map((l) => ({ id: LIKELIHOOD_IDS[l], label: LIKELIHOOD_WORDS[l], n: counts[l] })), { id: NOT_RATED, label: "Not rated", n: notRated }];
  return (
    <section className={styles.spread} aria-label={`How likely, across ${plural(entries.length, "prospect")}`}>
      <div className={styles.spreadHead}>
        <h2>How likely</h2>
        <span>{plural(entries.length, "prospect")}</span>
      </div>
      <div className={styles.bar} aria-hidden="true">
        {steps.map((s) => (s.n ? <i key={s.id} className={styles[s.id]} style={{ flexGrow: s.n }} title={`${s.label}: ${s.n}`} /> : null))}
      </div>
      <div className={styles.legend} role="group" aria-label="Show one likelihood">
        {steps.map((s) => (
          <button key={s.id} type="button" className={`${styles.legendButton} ${styles[s.id]}`} aria-pressed={value === s.id} onClick={() => onPick(s.id)}>
            <i aria-hidden="true" />
            <span>{s.label}</span>
            <b>{s.n.toLocaleString("en-US")}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function ListTools({ state, onState, onExport }: { state: NotesViewState; onState: (next: NotesViewState) => void; onExport: () => void }) {
  const [open, setOpen] = useState<"track" | "sort" | null>(null);
  const trackRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(null);
  const tracks: ("" | Track)[] = ["", "yes", "no"];
  return (
    <div className={styles.filters} role="toolbar" aria-label="Filter, order and export">
      <FilterButton
        ref={trackRef}
        icon="building"
        label="Show"
        hideLabel
        value={state.track ? TRACK_LABELS[state.track] : null}
        summary={TRACK_LABELS[""]}
        expanded={open === "track"}
        onClick={() => setOpen((now) => (now === "track" ? null : "track"))}
        onClear={() => onState({ ...state, track: null })}
      />
      <Menu open={open === "track"} anchorRef={trackRef} onClose={close} label="Show">
        <MenuHeading>Show</MenuHeading>
        {tracks.map((t) => (
          <MenuChoice key={t || "all"} checked={(state.track ?? "") === t} onSelect={() => onState({ ...state, track: t || null })}>
            {TRACK_LABELS[t]}
          </MenuChoice>
        ))}
      </Menu>
      <FilterButton ref={sortRef} icon="sort" label="Order" hideLabel summary={SORTS[state.sort]} expanded={open === "sort"} onClick={() => setOpen((now) => (now === "sort" ? null : "sort"))} />
      <Menu open={open === "sort"} anchorRef={sortRef} onClose={close} label="Order">
        <MenuHeading>Order</MenuHeading>
        {(Object.keys(SORTS) as NotesSort[]).map((k) => (
          <MenuChoice key={k} checked={state.sort === k} onSelect={() => onState({ ...state, sort: k })}>
            {SORTS[k]}
          </MenuChoice>
        ))}
      </Menu>
      <span className={styles.spacer} />
      <FilterAction icon="download" label="Export" opens="dialog" onClick={onExport} />
    </div>
  );
}

function Item({ row, companies, query, current, today, href, replace, onPick }: { row: NotesRow; companies: CompaniesById; query: string; current: boolean; today: string; href: string; replace: boolean; onPick: (id: string) => void }) {
  const group = groupOfNotes(row.entry, companies);
  const snip = snippetOf(row);
  const step = likelihoodStep(row.entry);
  const arrival = useArrival("notes", row.entry.id);
  return (
    <Link className={styles.item} href={href} replace={replace} aria-current={current || undefined} scroll={false} data-new={arrival !== "none" || undefined} onClick={() => onPick(row.entry.id)}>
      <span className={`${styles.mono} ${group ? styles[group] : styles.monoUntracked}`} aria-hidden="true">
        {initials(row.name)}
      </span>
      <div className={styles.itemMain}>
        <p className={styles.itemName}>
          <Highlight text={row.name} query={query} />
        </p>
        <p className={styles.itemSub}>
          {group ? <GroupTag group={group}>{COMPANY_GROUP_LABELS[group]}</GroupTag> : <OutsideTag>Not tracked yet</OutsideTag>}
          <span>{editedLine(row.entry.updatedAt, today)}</span>
          {isTagged(arrival) && <LiveTag />}
        </p>
        {snip && (
          <p className={styles.snippet}>
            <em>{snip.label}</em>
            {snip.highlight ? <Highlight text={snip.text} query={query} /> : snip.text}
          </p>
        )}
      </div>
      <span className={styles.itemLikely}>
        <LikelihoodMeter rating={step ? (step as Rating) : null} />
      </span>
    </Link>
  );
}

function NoMatch({ state, onClear }: { state: NotesViewState; onClear: () => void }) {
  const copy = noMatchCopy(state);
  return (
    <EmptyState size="small" icon="search" title={copy.title} actions={<Button onClick={onClear}>{copy.clear}</Button>}>
      {copy.text || undefined}
    </EmptyState>
  );
}
