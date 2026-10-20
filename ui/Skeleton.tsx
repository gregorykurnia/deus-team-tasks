// Skeletons (guide 4.15): grey shapes while a source loads, shimmering. Decorative; the loading line says the words.
import type { CSSProperties } from "react";
import Spinner from "./Spinner";
import styles from "./Skeleton.module.css";

export function Skeleton({ width, height }: { width?: number | string; height?: number | string }) {
  const style: CSSProperties = { width, height };
  return <span className={styles.block} style={style} aria-hidden="true" />;
}

// A row with the shape of a task row: a done circle, a badge, two lines and a pill.
export function SkeletonRow() {
  return (
    <div className={styles.row} aria-hidden="true">
      <span className={styles.circle} />
      <span className={styles.badge} />
      <div className={styles.lines}>
        <span className={styles.lineLong} />
        <span className={styles.lineShort} />
      </div>
      <span className={styles.pill} />
    </div>
  );
}

// "Loading tasks" with a spinner. Each source loads on its own, so each area has one.
export function LoadingLine({ children }: { children: string }) {
  return (
    <p className={styles.loading} role="status">
      <Spinner />
      {children}
    </p>
  );
}
