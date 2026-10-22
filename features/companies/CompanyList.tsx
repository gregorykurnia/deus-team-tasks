"use client";

// The list (guide 4.9, 5.7): the head sorts, then one row per company, 100 at a time. The first column (a badge in the
// group's colour, the name, and the contact or industry under it) stays pinned when the list scrolls sideways. Every shown
// field is a cell, and every cell is a button that opens its quick editor. The name opens the record, and so does a click
// anywhere else on the row; ⋯ opens the row menu. On phones the head goes and each row becomes a card with labelled details.
// Parked companies (N20) get a Comes back column, a ringed pill like a parked task's. While selecting several (Active), a
// checkbox leads each row, the head's ticks every row shown, the name is plain text and a row's click ticks it.
import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { searchedFields, type CompanyGroup, type CompanySortDir } from "@/lib/companies";
import type { CompanyField, CompanySettings } from "@/lib/companySettings";
import { COMES_BACK } from "@/lib/companies";
import { cellOf, cellWords, COMES_BACK_LABEL, gridOf, subline, type Cell } from "@/lib/companyView";
import { parkedLabel } from "@/lib/parking";
import { isTagged, useArrivals } from "@/lib/liveChanges";
import { initials } from "@/lib/people";
import Button from "@/ui/Button";
import Highlight from "@/ui/Highlight";
import Icon from "@/ui/Icon";
import OptionChip from "@/ui/OptionChip";
import SelectBox from "@/ui/SelectBox";
import Pill from "@/ui/Pill";
import { LiveTag } from "@/ui/Tag";
import styles from "./Companies.module.css";

const num = (n: number) => n.toLocaleString("en-GB");

interface CompanyListProps {
  companies: PipelineEntry[]; // what's shown, in order
  hidden: number; // matching companies beyond them
  pageSize: number;
  group: CompanyGroup;
  fields: CompanyField[]; // the shown ones
  settings: CompanySettings;
  query: string;
  today: string;
  sort: { key: string; dir: CompanySortDir };
  onSort: (key: string) => void;
  onMore: () => void;
  recordHref: (id: number) => string; // opens the company record over the list
  onEdit: (anchor: HTMLElement, company: PipelineEntry, field: CompanyField) => void;
  onRowMenu: (anchor: HTMLElement, company: PipelineEntry) => void;
  comesBack?: boolean; // the parked companies: when each comes back
  selecting?: { head: boolean | "mixed"; chosen: ReadonlySet<string>; onHead: () => void; onToggle: (id: string) => void };
}

// A click on the row that isn't on a cell, the menu or the name opens the record, as the name's link would.
function openFromRow(e: MouseEvent<HTMLElement>) {
  if (!(e.target instanceof Element) || e.target.closest("a, button, input")) return;
  e.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
}

// coldIcon: a last action that has gone cold carries the snowflake (the record shows it; the list keeps just the words).
export function CellValue({ cell, query, searched, coldIcon }: { cell: Cell; query: string; searched: boolean; coldIcon?: boolean }) {
  switch (cell.kind) {
    case "empty":
      return null;
    case "choice":
      return <OptionChip tone={cell.colour}>{cell.label}</OptionChip>;
    case "choices":
      return (
        <span className={styles.chips}>
          {cell.items.map((i) => (
            <OptionChip key={i.label} tone={i.colour}>
              {i.label}
            </OptionChip>
          ))}
        </span>
      );
    case "date":
      if (cell.pill) {
        return (
          <Pill tone={cell.tone === "plain" ? "calm" : cell.tone} icon={cell.tone === "red" ? "alert" : undefined} title={cell.title}>
            {cell.label}
          </Pill>
        );
      }
      return (
        <span className={cell.tone === "red" ? styles.redWords : cell.tone === "amber" ? styles.amberWords : styles.dv} title={cell.title}>
          {coldIcon && cell.tone === "red" && cell.title.endsWith("Gone cold") && <Icon name="snow" size={14} className={styles.coldIcon} />}
          {cell.label}
        </span>
      );
    case "number":
      return <span className={styles.nv}>{cell.label}</span>;
    case "text":
      return (
        <span className={styles.tx} title={cell.label}>
          {searched ? <Highlight text={cell.label} query={query} /> : cell.label}
        </span>
      );
  }
}

// On phones these say what they are on their own, so they drop their label; Priority and Last action keep theirs (guide 5.13).
const BARE_ON_PHONE = new Set(["status", "answer", "target", "reach", "type"]);

export default function CompanyList(props: CompanyListProps) {
  const { companies, hidden, pageSize, group, fields, settings, query, today, sort, onSort, onMore, recordHref, onEdit, onRowMenu, comesBack, selecting } = props;
  const grid = gridOf(fields, comesBack);
  const arrivals = useArrivals("companies");
  const searchedKeys = new Set(searchedFields(group));
  const head = (label: string, key: string) => {
    const on = sort.key === key;
    return (
      <button key={key} type="button" className={styles.sortHead} aria-current={on || undefined} onClick={() => onSort(key)}>
        {label}
        {on && (
          <>
            <span className="sr-only">, sorted {sort.dir === "asc" ? "ascending" : "descending"}</span>
            <Icon name={sort.dir === "asc" ? "up" : "down"} size={13} />
          </>
        )}
      </button>
    );
  };
  return (
    <>
      <div className={styles.wrap}>
        <div className={styles.table} style={{ "--cols": grid.columns, "--minw": `${grid.minWidth}px` } as CSSProperties}>
          <div className={styles.head}>
            <div className={styles.name}>
              {selecting && <SelectBox checked={selecting.head} label="Select every company shown" onClick={selecting.onHead} />}
              {head("Company", "company")}
            </div>
            {fields.map((f) => head(f.label, f.key))}
            {comesBack && head(COMES_BACK_LABEL, COMES_BACK)}
            <span />
          </div>
          <div className={styles.list}>
            {companies.map((c) => {
              const sub = subline(c, group);
              const arrival = arrivals.get(String(c.id)) ?? "none";
              return (
                <article
                  key={c.id}
                  className={styles.row}
                  aria-label={c.company}
                  onClick={(e) => {
                    if (!selecting) openFromRow(e);
                    else if (e.target instanceof Element && !e.target.closest("a, button, input")) selecting.onToggle(String(c.id));
                  }}
                  data-new={arrival !== "none" || undefined}
                >
                  <div className={styles.name}>
                    {selecting && <SelectBox checked={selecting.chosen.has(String(c.id))} label={`Select: ${c.company}`} onClick={() => selecting.onToggle(String(c.id))} />}
                    <span className={`${styles.mono} ${styles[group]}`} aria-hidden="true">
                      {initials(c.company)}
                    </span>
                    <div className={styles.who}>
                      <p className={styles.title}>
                        {selecting ? (
                          <Highlight text={c.company} query={query} />
                        ) : (
                          <Link href={recordHref(c.id)} scroll={false} className={styles.nameLink} data-row-link>
                            <Highlight text={c.company} query={query} />
                          </Link>
                        )}
                      </p>
                      {(sub || isTagged(arrival)) && (
                        <p className={styles.meta}>
                          {sub && <Highlight text={sub} query={query} />}
                          {isTagged(arrival) && (
                            <span className={styles.liveGap}>
                              <LiveTag />
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {fields.map((f) => {
                    const cell = cellOf(c, f, group, settings, today);
                    const classes = [styles.cell, f.type === "long" && styles.long, cell.kind === "empty" && styles.emptyCell, BARE_ON_PHONE.has(f.key) && styles.bare];
                    return (
                      <button
                        key={f.key}
                        type="button"
                        className={classes.filter(Boolean).join(" ")}
                        aria-label={`${f.label}: ${cellWords(cell)}. Change`}
                        onClick={(e) => onEdit(e.currentTarget, c, f)}
                      >
                        <span className={styles.lbl} aria-hidden="true">
                          {f.label}
                        </span>{" "}
                        {cell.kind === "empty" ? (
                          <span className={styles.none} aria-hidden="true">
                            –
                          </span>
                        ) : (
                          <CellValue cell={cell} query={query} searched={searchedKeys.has(f.key)} />
                        )}
                      </button>
                    );
                  })}
                  {comesBack && (
                    <div className={`${styles.cell} ${styles.bare}`}>
                      <span className={styles.lbl}>{COMES_BACK_LABEL}</span>{" "}
                      <Pill tone="none">
                        {parkedLabel({ parkedAt: c.parkedAt, parkedUntil: c.parkedUntil }, today)}
                      </Pill>
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.rowMenu}
                    aria-label={`More for ${c.company}`}
                    aria-haspopup="menu"
                    onClick={(e) => onRowMenu(e.currentTarget, c)}
                  >
                    <Icon name="more" />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      {hidden > 0 && (
        <div className={styles.more}>
          Showing {num(companies.length)} of {num(companies.length + hidden)}
          <Button small onClick={onMore}>
            Show {num(Math.min(pageSize, hidden))} more
          </Button>
        </div>
      )}
    </>
  );
}
