"use client";

// Where to act, on Active only (guide 4.10, B6): four cards, each a filter. A round tinted icon, a 24px count, "of 42", the
// label and a thin bar showing the share. The pressed one has a 2px ring in its tone; pressing it again lets go.
import { ACT_CARDS } from "@/lib/companyView";
import type { WhereToAct as Act } from "@/lib/companies";
import Icon from "@/ui/Icon";
import styles from "./Companies.module.css";

interface WhereToActProps {
  counts: Record<Act, number> & { of: number };
  current: Act | null;
  onPick: (act: Act | null) => void;
}

export default function WhereToAct({ counts, current, onPick }: WhereToActProps) {
  return (
    <section className={styles.wta} aria-label="Where to act">
      <h2 className={styles.wtaHead}>
        Where to act<span>Choose one to see only those</span>
      </h2>
      <div className={styles.wtaGrid}>
        {ACT_CARDS.map((a) => {
          const n = counts[a.id];
          const pct = counts.of ? Math.round((n / counts.of) * 100) : 0;
          return (
            <button key={a.id} type="button" className={`${styles.act} ${styles[a.tone]}`} aria-pressed={current === a.id} title={a.hint} onClick={() => onPick(current === a.id ? null : a.id)}>
              <span className={styles.actTop}>
                <i>
                  <Icon name={a.icon} size={16} />
                </i>
                <b>{n.toLocaleString("en-GB")}</b>
                <span className={styles.of}>of {counts.of.toLocaleString("en-GB")}</span>
              </span>
              <span className={styles.actLabel}>{a.label}</span>
              <span className={styles.actBar} aria-hidden="true">
                <i style={{ width: `${Math.max(n ? 4 : 0, pct)}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
