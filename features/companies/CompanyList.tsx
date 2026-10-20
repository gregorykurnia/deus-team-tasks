"use client";

// The list (guide 4.9, 5.7): the head sorts, then one row per company, 100 at a time. The first column (a badge in the
// group's colour, the name, and the contact or industry under it) stays pinned when the list scrolls sideways. Every shown
// field is a cell. On phones the head goes and each row becomes a card with labelled details. Cells are read only until
// task 3.9 makes them editable.
import type { CSSProperties } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { searchedFields, type CompanyGroup, type CompanySortDir } from "@/lib/companies";
import type { CompanyField, CompanySettings } from "@/lib/companySettings";
import { cellOf, cellWords, gridOf, subline, type Cell } from "@/lib/companyView";
import { initials } from "@/lib/people";
import Button from "@/ui/Button";
import Highlight from "@/ui/Highlight";
import Icon from "@/ui/Icon";
import OptionChip from "@/ui/OptionChip";
import Pill from "@/ui/Pill";
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
}

function CellValue({ cell, query, searched }: { cell: Cell; query: string; searched: boolean }) {
  switch (cell.kind) {
    case "empty":
      return null;
    case "choice":
      return <OptionChip tone={cell.colour}>{cell.label}</OptionChip>;
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

export default function CompanyList({ companies, hidden, pageSize, group, fields, settings, query, today, sort, onSort, onMore }: CompanyListProps) {
  const grid = gridOf(fields);
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
            <div className={styles.name}>{head("Company", "company")}</div>
            {fields.map((f) => head(f.label, f.key))}
            <span />
          </div>
          <div className={styles.list}>
            {companies.map((c) => {
              const sub = subline(c, group);
              return (
                <article key={c.id} className={styles.row} aria-label={c.company}>
                  <div className={styles.name}>
                    <span className={`${styles.mono} ${styles[group]}`} aria-hidden="true">
                      {initials(c.company)}
                    </span>
                    <div className={styles.who}>
                      <p className={styles.title}>
                        <Highlight text={c.company} query={query} />
                      </p>
                      {sub && (
                        <p className={styles.meta}>
                          <Highlight text={sub} query={query} />
                        </p>
                      )}
                    </div>
                  </div>
                  {fields.map((f) => {
                    const cell = cellOf(c, f, group, settings, today);
                    const classes = [styles.cell, f.type === "long" && styles.long, f.type === "choice" && styles.choice, cell.kind === "date" && cell.pill && styles.pillCell, cell.kind === "empty" && styles.emptyCell];
                    return (
                      <div key={f.key} className={classes.filter(Boolean).join(" ")}>
                        <span className={styles.lbl}>{f.label}</span>
                        {cell.kind === "empty" ? (
                          <span className={styles.none}>
                            <span aria-hidden="true">–</span>
                            <span className="sr-only">{cellWords(cell)}</span>
                          </span>
                        ) : (
                          <CellValue cell={cell} query={query} searched={searchedKeys.has(f.key)} />
                        )}
                      </div>
                    );
                  })}
                  <span />
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
