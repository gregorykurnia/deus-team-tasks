// A panel (guide 4.10): glass, with a head (a 17px title, a count in muted, tools on the right) and a foot with a
// centred quiet button ("All 128 open tasks"). Rows sit inside it with 6px beside them and between them.
import { useId, type ReactNode } from "react";
import styles from "./Panel.module.css";

interface PanelProps {
  title: string;
  count?: number;
  tools?: ReactNode; // a segmented control, a "Read only" tag
  foot?: ReactNode;
  children: ReactNode;
}

export default function Panel({ title, count, tools, foot, children }: PanelProps) {
  const id = useId();
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.head}>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {count !== undefined && <span className={styles.count}>{count.toLocaleString("en-GB")}</span>}
        <span className={styles.spacer} />
        {tools}
      </div>
      {children}
      {foot && <div className={styles.foot}>{foot}</div>}
    </section>
  );
}

// The space rows sit in, inside a panel.
export function PanelRows({ children }: { children: ReactNode }) {
  return <div className={styles.rows}>{children}</div>;
}
