// A segmented control (guide 4.2): a pill track holding two to four options. The chosen one is a white pill.
// Options can carry a count. In priority, pressing the chosen one again clears it.
import Icon, { type IconName } from "./Icon";
import styles from "./Segmented.module.css";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: IconName;
}

interface SegmentedProps<T extends string> {
  label: string; // what is being chosen: "Kind of work"
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  full?: boolean; // fills the width, as on phones
  large?: boolean; // 13.5px words, as for About in task details
}

export default function Segmented<T extends string>({ label, options, value, onChange, allowClear = false, full = false, large = false }: SegmentedProps<T>) {
  return (
    <div className={[styles.track, full && styles.full, large && styles.large].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.option}
          aria-pressed={value === o.value}
          onClick={() => onChange(allowClear && value === o.value ? null : o.value)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
          {o.count !== undefined && <span className={styles.count}>{o.count.toLocaleString("en-GB")}</span>}
        </button>
      ))}
    </div>
  );
}
