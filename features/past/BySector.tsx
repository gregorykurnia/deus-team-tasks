"use client";

// By sector (guide 6.7, R5): the eight largest sectors with their count, share and a bar, "No sector" apart, and the total,
// which is the client total. A sector filters the record when pressed.
import { useState } from "react";
import type { SectorBreakdown } from "@/lib/pastClients";
import { NO_SECTOR, percent, TOP_SECTORS } from "@/lib/pastView";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import { Skeleton } from "@/ui/Skeleton";
import styles from "./Past.module.css";

const num = (n: number) => n.toLocaleString("en-GB");

interface BySectorProps {
  breakdown: SectorBreakdown | null; // null while past clients load
  anyOnRecord: boolean;
  current: string | null;
  onPick: (key: string) => void;
}

export default function BySector({ breakdown, anyOnRecord, current, onPick }: BySectorProps) {
  const [all, setAll] = useState(false);
  const head = (extra?: string) => (
    <div className={styles.secHead}>
      <h2>By sector</h2>
      {extra && <span>{extra}</span>}
    </div>
  );

  if (!breakdown) {
    return (
      <section className={`${styles.panel} ${styles.secPanel}`} aria-label="Clients by sector">
        {head()}
        {[90, 70, 55, 40, 30, 20].map((w) => (
          <div key={w} className={styles.secRow} aria-hidden="true">
            <Skeleton width={w + 20} height={12} />
            <span />
            <span />
            <span className={styles.bar}>
              <Skeleton width={`${w}%`} height={6} />
            </span>
          </div>
        ))}
      </section>
    );
  }
  if (!breakdown.total) {
    return (
      <section className={`${styles.panel} ${styles.secPanel}`} aria-label="Clients by sector">
        {head()}
        <EmptyState size="small" icon="archive" title="No counted companies yet">
          {`The breakdown counts every subsidiary and every parent company that’s counted. ${anyOnRecord ? "Everything on record now is an umbrella company that isn’t counted." : ""}`.trim()}
        </EmptyState>
      </section>
    );
  }

  const { rows, noSector, total } = breakdown;
  const max = Math.max(noSector, rows[0]?.count ?? 0);
  const shown = all ? rows : rows.slice(0, TOP_SECTORS);
  const row = (key: string, label: string, n: number, none = false) => (
    <button
      key={key}
      type="button"
      className={none ? `${styles.secRow} ${styles.secNone}` : styles.secRow}
      aria-pressed={current === key}
      title={`${label}: ${num(n)} of ${num(total)}`}
      onClick={() => onPick(key)}
    >
      <span className={styles.secLabel}>{label}</span>
      <span className={styles.secNum}>{num(n)}</span>
      <span className={styles.secPct}>{percent(n, total)}</span>
      <span className={styles.bar} aria-hidden="true">
        <i style={{ width: `${(n / max) * 100}%` }} />
      </span>
    </button>
  );
  return (
    <section className={`${styles.panel} ${styles.secPanel}`} aria-label="Clients by sector">
      {head(`${rows.length === 1 ? "1 sector" : `${num(rows.length)} sectors`}, largest first`)}
      <div>{shown.map((r) => row(r.key, r.label, r.count))}</div>
      {rows.length > TOP_SECTORS && (
        <button type="button" className={styles.secAll} aria-expanded={all} onClick={() => setAll(!all)}>
          <Icon name={all ? "up" : "down"} size={15} />
          {all ? `Show the top ${TOP_SECTORS}` : `Show all ${num(rows.length)} sectors`}
        </button>
      )}
      {noSector > 0 && <div className={styles.noSector}>{row(NO_SECTOR, "No sector", noSector, true)}</div>}
      <div className={styles.secTotal}>
        <span>Total</span>
        <b data-testid="sector-total">{num(total)}</b>
        <small>The same as the client total: every counted company, in one sector each.</small>
      </div>
      <p className={styles.hint}>Tap a sector to see its companies.</p>
    </section>
  );
}
