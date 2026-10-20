// Option chips (guide 4.4, C3): one choice's name in its colour pair. "+2" lists the rest.
import styles from "./OptionChip.module.css";

// The nine option colours (--opt-<name>-bg and --opt-<name>), as lib/companySettings names them.
export type OptionTone = "blue" | "sky" | "teal" | "green" | "amber" | "red" | "violet" | "pink" | "slate";

export default function OptionChip({ tone, children }: { tone: OptionTone; children: string }) {
  return <span className={`${styles.chip} ${styles[tone]}`}>{children}</span>;
}

// Several options in one cell end with "+n"; the title names the ones hidden.
export function MoreChip({ count, names }: { count: number; names: string[] }) {
  return (
    <span className={`${styles.chip} ${styles.more}`} title={names.join(", ")}>
      +{count}
    </span>
  );
}
