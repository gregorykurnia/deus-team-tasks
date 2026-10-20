// A segmented control (guide 4.2): a pill track holding two to four options. The chosen one is a white pill.
// Options can carry a count. In priority, pressing the chosen one again clears it.
import styles from "./Segmented.module.css";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedProps<T extends string> {
  label: string; // what is being chosen: "Kind of work"
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  full?: boolean; // fills the width, as on phones
}

export default function Segmented<T extends string>({ label, options, value, onChange, allowClear = false, full = false }: SegmentedProps<T>) {
  return (
    <div className={full ? `${styles.track} ${styles.full}` : styles.track} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.option}
          aria-pressed={value === o.value}
          onClick={() => onChange(allowClear && value === o.value ? null : o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className={styles.count}>{o.count.toLocaleString("en-GB")}</span>}
        </button>
      ))}
    </div>
  );
}
