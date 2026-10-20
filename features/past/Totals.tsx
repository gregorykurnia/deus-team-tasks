"use client";

// The totals (guide 6.7, R3, R4): "Clients we've served", the display number and a sentence, with Copy these figures; then
// the sum (parent companies counted + subsidiaries = clients in total) and the dashed Not counted tile, which shows only the
// umbrella companies when pressed.
import { totalsSentence, type Figures } from "@/lib/pastView";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import { Skeleton } from "@/ui/Skeleton";
import styles from "./Past.module.css";

const num = (n: number) => n.toLocaleString("en-GB");

interface TotalsProps {
  figures: Figures | null; // null while past clients load
  notCounted: boolean; // the view shows only the parents that aren't counted
  onCopy: () => void;
  onNotCounted: () => void;
}

export default function Totals({ figures, notCounted, onCopy, onNotCounted }: TotalsProps) {
  if (!figures) {
    return (
      <section className={styles.track} aria-label="Client totals">
        <div className={styles.main}>
          <Skeleton width={150} height={14} />
          <span style={{ marginTop: 12, display: "block" }}>
            <Skeleton width={140} height={64} />
          </span>
          <span style={{ marginTop: 16, display: "block", width: "80%" }}>
            <Skeleton width="100%" height={14} />
          </span>
        </div>
        <div className={styles.sum}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: "contents" }}>
              {n > 1 && <span />}
              <div className={styles.fig}>
                <Skeleton width={50} height={26} />
                <Skeleton width="90%" height={11} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  const f = figures;
  return (
    <section className={styles.track} aria-label="Client totals">
      <div className={styles.main}>
        <p className={styles.kicker}>Clients we’ve served</p>
        <p className={styles.number} data-testid="client-total">
          {num(f.total)}
        </p>
        <p className={styles.sentence}>{totalsSentence(f)}</p>
        <Button small onClick={onCopy}>
          <Icon name="copy" size={15} />
          Copy these figures
        </Button>
      </div>
      <div className={styles.sum} role="group" aria-label="How the total adds up">
        <div className={styles.fig}>
          <b>{num(f.counted)}</b>
          <span>Parent companies counted</span>
        </div>
        <span className={styles.op} aria-hidden="true">
          +
        </span>
        <div className={styles.fig}>
          <b>{num(f.subs)}</b>
          <span>Subsidiaries</span>
        </div>
        <span className={styles.op} aria-hidden="true">
          =
        </span>
        <div className={`${styles.fig} ${styles.total}`}>
          <b>{num(f.total)}</b>
          <span>Clients in total</span>
        </div>
        <button type="button" className={`${styles.fig} ${styles.notCounted}`} aria-pressed={notCounted} disabled={!f.excluded} onClick={onNotCounted}>
          <b>{num(f.excluded)}</b>
          <span>
            Not counted
            <small>
              {f.excluded
                ? `Umbrella companies, on record for their subsidiaries. ${notCounted ? "Showing only these." : "Tap to see them."}`
                : "Every parent company counts."}
            </small>
          </span>
        </button>
      </div>
    </section>
  );
}
