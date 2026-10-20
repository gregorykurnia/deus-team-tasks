"use client";

// The record (guide 6.7, 4.16, R2, R3, R7, R8): the filters (Sector, order, show or hide all subsidiaries), the result
// line, and the parent companies as cards, 100 at a time. A parent opens its subsidiaries under a grey branch line, 50 at
// a time, ending in an "Add a subsidiary" line; while searching, only the subsidiaries that matched show, with "Show its
// other n subsidiaries". A name or a sector opens its editor in place, the Not counted tag counts it again, and ⋯ has
// the rest. The screen can ask for a parent to be shown ("reveal"): it opens with all its subsidiaries and scrolls into
// view, once it's in the list.
import { useEffect, useRef, useState, type RefObject } from "react";
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
import { cleanSector, isCounted } from "@/lib/pastClients";
import { initials } from "@/lib/people";
import type { SectorCount } from "@/lib/sectors";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import FilterButton, { FilterAction, FilterToggle } from "@/ui/FilterButton";
import Highlight from "@/ui/Highlight";
import Icon from "@/ui/Icon";
import Menu, { MenuChoice, MenuFoot, MenuHeading, MenuItem, MenuSeparator } from "@/ui/Menu";
import { RenameEditor, SectorEditor } from "./PastEditors";
import type { PastActions } from "./usePastActions";
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
  actions: PastActions;
  sectors: SectorCount[];
  glowing: ReadonlySet<string>; // just added or changed here: the arrive glow
  reveal: Reveal | null;
  onMove: (sub: HistoricalClient) => void;
  onDelete: (c: HistoricalClient) => void;
  onExport: () => void;
}

export interface Reveal {
  id: string; // a parent company
  n: number; // each request is new
  add?: boolean; // and put the cursor in its "Add a subsidiary" line
}

interface Local {
  key: string;
  open: Set<string>;
  closed: Set<string>;
  full: Set<string>;
  subLimit: Record<string, number>;
  limit: number;
  adding: { id: string; n: number } | null; // the parent whose "Add a subsidiary" line was asked for, even with none yet
}
const fresh = (key: string): Local => ({ key, open: new Set(), closed: new Set(), full: new Set(), subLimit: {}, limit: PAGE_SIZE, adding: null });

type Edit = { c: HistoricalClient; kind: "menu" | "rename" | "sector" };

export default function PastRecord({ entries, labelOf, state, figures, choices, resetKey, onState, actions, sectors, glowing, reveal, onMove, onDelete, onExport }: PastRecordProps) {
  const [stored, setStored] = useState(() => fresh(resetKey));
  let local = stored.key === resetKey ? stored : fresh(resetKey);
  const change = (patch: (l: Local) => Partial<Local>) => setStored({ ...local, ...patch(local) });
  const [menu, setMenu] = useState<"sector" | "order" | null>(null);
  const sectorRef = useRef<HTMLButtonElement>(null);
  const orderRef = useRef<HTMLButtonElement>(null);
  const q = state.q.trim();

  // A reveal waits until its parent is in the list (the screen may be clearing a search first), then opens it once.
  const [revealed, setRevealed] = useState<Reveal | null>(null);
  if (reveal && reveal.n !== revealed?.n) {
    const at = entries.findIndex((e) => e.parent.id === reveal.id);
    if (at >= 0) {
      local = {
        ...local,
        open: new Set(local.open).add(reveal.id),
        closed: new Set([...local.closed].filter((id) => id !== reveal.id)),
        full: new Set(local.full).add(reveal.id),
        limit: Math.max(local.limit, Math.ceil((at + 1) / PAGE_SIZE) * PAGE_SIZE),
        adding: reveal.add ? { id: reveal.id, n: reveal.n } : local.adding,
      };
      setStored(local);
      setRevealed(reveal);
    }
  }
  useEffect(() => {
    if (!revealed) return;
    document.querySelector(`[data-parent="${CSS.escape(revealed.id)}"]`)?.scrollIntoView({ block: revealed.add ? "center" : "nearest" });
  }, [revealed]);

  // The ⋯ menu and the editors in place, anchored to what was pressed.
  const [edit, setEdit] = useState<Edit | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const openEdit = (c: HistoricalClient, kind: Edit["kind"], from: HTMLElement) => {
    anchorRef.current = from;
    setEdit({ c, kind });
  };
  // From the ⋯ menu, an editor opens at the name or sector when they're on screen (on phones the sector may be hidden).
  const fromMenu = (c: HistoricalClient, kind: "rename" | "sector") => {
    const at = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(c.id)}"] [data-${kind}]`);
    if (at?.offsetParent) anchorRef.current = at;
    setEdit({ c, kind });
  };
  const closeEdit = () => setEdit(null);
  const closeMenu = () => setEdit((now) => (now?.kind === "menu" ? null : now));
  const startAdding = (id: string) =>
    change((l) => ({ open: new Set(l.open).add(id), closed: new Set([...l.closed].filter((x) => x !== id)), adding: { id, n: (l.adding?.n ?? 0) + 1 } }));

  // A parent with no subsidiaries opens only to show the add line asked for (gap N11, provisional).
  const open = (e: PastEntry) => isOpen(e, local) || (!e.subs.length && local.adding?.id === e.parent.id);
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
      <span className={styles.spacer} />
      <FilterAction icon="download" label="Export" opens="dialog" onClick={onExport} />
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
        <span />
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
            glowing={glowing}
            addFocus={local.adding?.id === e.parent.id ? local.adding.n : 0}
            onToggle={() => toggle(e)}
            onMoreSubs={() => change((l) => ({ subLimit: { ...l.subLimit, [e.parent.id]: (l.subLimit[e.parent.id] ?? SUBS_FIRST) + SUBS_STEP } }))}
            onAllSubs={() => change((l) => ({ full: new Set(l.full).add(e.parent.id) }))}
            onEdit={openEdit}
            onCount={() => void actions.toggleCount(e.parent)}
            onQuickAdd={(name, added) => actions.quickAdd(e.parent, name, added)}
            onStopAdding={() => change(() => ({ adding: null }))}
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
      {edit?.kind === "menu" && (
        <RowMenu
          c={edit.c}
          anchorRef={anchorRef}
          onClose={closeMenu}
          onAddSub={() => startAdding(edit.c.id)}
          onRename={() => fromMenu(edit.c, "rename")}
          onSector={() => fromMenu(edit.c, "sector")}
          onCount={() => void actions.toggleCount(edit.c)}
          onMove={() => onMove(edit.c)}
          onDelete={() => onDelete(edit.c)}
        />
      )}
      {edit?.kind === "rename" && (
        <RenameEditor anchorRef={anchorRef} onClose={closeEdit} name={edit.c.name} sub={!!edit.c.parentId} onSave={(name) => void actions.rename(edit.c, name)} />
      )}
      {edit?.kind === "sector" && (
        <SectorEditor
          anchorRef={anchorRef}
          onClose={closeEdit}
          name={edit.c.name}
          sub={!!edit.c.parentId}
          sector={labelOf(edit.c)}
          own={!!cleanSector(edit.c.sector ?? "")}
          sectors={sectors}
          onSave={(typed) => void actions.setSector(edit.c, typed)}
        />
      )}
    </>
  );
}

interface RowMenuProps {
  c: HistoricalClient;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onAddSub: () => void;
  onRename: () => void;
  onSector: () => void;
  onCount: () => void;
  onMove: () => void;
  onDelete: () => void;
}

// A parent company's ⋯: add a subsidiary, rename, sector, counted or not, delete. A subsidiary's: rename, sector, move,
// delete.
function RowMenu({ c, anchorRef, onClose, onAddSub, onRename, onSector, onCount, onMove, onDelete }: RowMenuProps) {
  const sub = !!c.parentId;
  const hasSector = !!cleanSector(c.sector ?? "");
  return (
    <Menu open anchorRef={anchorRef} onClose={onClose} label={`More for ${c.name}`} alignRight>
      {!sub && (
        <MenuItem icon="plus" onSelect={onAddSub}>
          Add a subsidiary
        </MenuItem>
      )}
      <MenuItem icon="edit" onSelect={onRename}>
        Rename
      </MenuItem>
      <MenuItem icon="choice" onSelect={onSector}>
        {hasSector ? "Change the sector" : "Add a sector"}
      </MenuItem>
      {sub ? (
        <MenuItem icon="swap" onSelect={onMove}>
          Move to another parent company
        </MenuItem>
      ) : (
        <MenuItem icon={c.countHead ? "minus" : "check"} onSelect={onCount}>
          {c.countHead ? "Stop counting it in the totals" : "Count it in the totals"}
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon="trash" danger onSelect={onDelete}>
        {sub ? "Delete subsidiary" : "Delete company"}
      </MenuItem>
    </Menu>
  );
}

interface ParentCardProps {
  entry: PastEntry;
  open: boolean;
  query: string;
  labelOf: (c: HistoricalClient) => string;
  onlyHits: boolean;
  subLimit: number;
  glowing: ReadonlySet<string>;
  addFocus: number; // a new number puts the cursor in its "Add a subsidiary" line
  onToggle: () => void;
  onMoreSubs: () => void;
  onAllSubs: () => void;
  onEdit: (c: HistoricalClient, kind: Edit["kind"], from: HTMLElement) => void;
  onCount: () => void;
  onQuickAdd: (name: string, added: (name: string) => void) => Promise<boolean>;
  onStopAdding: () => void;
}

function ParentCard(props: ParentCardProps) {
  const { entry, open, query, labelOf, glowing, onToggle, onEdit, onCount } = props;
  const { parent: p, subs } = entry;
  const counted = isCounted(p);
  const n = subs.length;
  const sector = labelOf(p);
  // A click on the card that isn't on a button shows or hides its subsidiaries, as the chevron does.
  const fromCard = (e: React.MouseEvent<HTMLElement>) => {
    if (n && e.target instanceof Element && !e.target.closest("button, a, input")) onToggle();
  };
  return (
    <article className={[styles.group, open && styles.open, glowing.has(p.id) && styles.arrive].filter(Boolean).join(" ")} aria-label={p.name} data-parent={p.id}>
      {/* The card's own click is a mouse shortcut for the chevron, which is the keyboard way in. */}
      <div className={[styles.parent, !counted && styles.uncounted].filter(Boolean).join(" ")} onClick={fromCard} data-row={p.id}>
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
          <NameButton c={p} query={query} onEdit={onEdit} />
          {!counted && (
            <button type="button" className={styles.tag} title="Not counted in the totals. Press to count it again." onClick={onCount}>
              Not counted
            </button>
          )}
        </div>
        <SectorButton c={p} sector={sector} query={query} onEdit={onEdit} />
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
        <MoreButton c={p} onEdit={onEdit} />
      </div>
      {open && <SubsBlock {...props} counted={counted} />}
    </article>
  );
}

function SubsBlock({ entry, query, labelOf, glowing, counted, onlyHits, subLimit, addFocus, onMoreSubs, onAllSubs, onEdit, onQuickAdd, onStopAdding }: ParentCardProps & { counted: boolean }) {
  const { parent: p, subs, hits } = entry;
  const list = onlyHits && hits ? hits : subs;
  const shown = list.slice(0, subLimit);
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
          <div
            key={s.id}
            className={[styles.sub, i === shown.length - 1 && styles.last, glowing.has(s.id) && styles.arrive].filter(Boolean).join(" ")}
            role="group"
            aria-label={s.name}
            data-row={s.id}
          >
            <span className={styles.branch} aria-hidden="true" />
            <div className={styles.name}>
              <NameButton c={s} query={query} onEdit={onEdit} />
            </div>
            <SectorButton c={s} sector={sector} query={query} onEdit={onEdit} />
            <span className={styles.subGap} />
            <MoreButton c={s} onEdit={onEdit} />
          </div>
        );
      })}
      {list.length > shown.length && (
        <div className={styles.subMore}>
          {`Showing ${num(shown.length)} of ${num(list.length)}`}
          <Button small onClick={onMoreSubs}>
            {`Show ${num(Math.min(SUBS_STEP, list.length - shown.length))} more`}
          </Button>
        </div>
      )}
      {onlyHits && hits && subs.length > hits.length && (
        <button type="button" className={styles.subAll} onClick={onAllSubs}>
          {`Show its other ${subsidiaries(subs.length - hits.length)}`}
        </button>
      )}
      <SubAdd parent={p} sector={labelOf(p)} focusKey={addFocus} onAdd={onQuickAdd} onIdle={subs.length ? undefined : onStopAdding} />
    </div>
  );
}

// The add line at the end of an open parent (4.16): a name and Enter adds a subsidiary with the parent's sector, and the
// cursor stays for the next one. While it saves the line says "Adding…"; when it fails, the name stays.
function SubAdd({ parent, sector, focusKey, onAdd, onIdle }: { parent: HistoricalClient; sector: string; focusKey: number; onAdd: ParentCardProps["onQuickAdd"]; onIdle?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);

  async function submit() {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    await onAdd(name, (added) => setText((now) => (now.trim() === added ? "" : now)));
    setBusy(false);
  }

  return (
    <label className={styles.subAdd} data-busy={busy || undefined}>
      <Icon name="plus" size={15} />
      <span className="sr-only">{`New subsidiary of ${parent.name}`}</span>
      <input
        ref={input}
        value={text}
        placeholder="Add a subsidiary"
        autoComplete="off"
        readOnly={busy}
        aria-busy={busy || undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        onBlur={() => {
          if (!text.trim() && !busy) onIdle?.();
        }}
      />
      <span className={styles.addHint}>{busy ? "Adding…" : `${sector ? `Sector: ${sector} · ` : ""}Enter to add`}</span>
    </label>
  );
}

function NameButton({ c, query, onEdit }: { c: HistoricalClient; query: string; onEdit: ParentCardProps["onEdit"] }) {
  return (
    <button type="button" className={styles.title} aria-label={`Rename ${c.name}`} title="Rename" data-rename onClick={(e) => onEdit(c, "rename", e.currentTarget)}>
      <Highlight text={c.name} query={query} />
    </button>
  );
}

function SectorButton({ c, sector, query, onEdit }: { c: HistoricalClient; sector: string; query: string; onEdit: ParentCardProps["onEdit"] }) {
  return (
    <button
      type="button"
      className={styles.sector}
      aria-label={sector ? `Sector ${sector}. Change the sector of ${c.name}` : `Add sector: ${c.name}`}
      title={sector ? "Change the sector" : "Add a sector"}
      data-sector
      onClick={(e) => onEdit(c, "sector", e.currentTarget)}
    >
      {sector ? (
        <span className={styles.pill}>
          <Highlight text={sector} query={query} />
        </span>
      ) : (
        <span className={styles.none}>Add sector</span>
      )}
    </button>
  );
}

function MoreButton({ c, onEdit }: { c: HistoricalClient; onEdit: ParentCardProps["onEdit"] }) {
  return (
    <button type="button" className={styles.rowMenu} aria-label={`More for ${c.name}`} aria-haspopup="menu" onClick={(e) => onEdit(c, "menu", e.currentTarget)}>
      <Icon name="more" />
    </button>
  );
}
