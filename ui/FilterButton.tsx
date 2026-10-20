// A filter button (guide 4.3): a 36px white pill with an icon, a label and a down arrow. When it is on it turns
// blue-soft with a blue ring, shows its value, and gets a round × to clear it. Pass its ref to the Menu it opens.
import type { Ref } from "react";
import Icon, { type IconName } from "./Icon";
import styles from "./FilterButton.module.css";

interface FilterButtonProps {
  label: string; // "Due"
  value?: string | null; // "Overdue": the filter is on when it has one
  icon?: IconName;
  expanded?: boolean;
  onClick: () => void;
  onClear?: () => void;
  ref?: Ref<HTMLButtonElement>;
}

export default function FilterButton({ label, value, icon, expanded, onClick, onClear, ref }: FilterButtonProps) {
  const on = !!value;
  return (
    <span className={on ? `${styles.filter} ${styles.on}` : styles.filter}>
      <button ref={ref} type="button" className={styles.main} aria-haspopup="menu" aria-expanded={expanded} onClick={onClick}>
        {icon && <Icon name={icon} size={15} />}
        <span>{label}</span>
        {on && <b className={styles.value}>{value}</b>}
        <Icon name="down" size={15} />
      </button>
      {on && (
        <button type="button" className={styles.clear} aria-label={`Clear the ${label.toLowerCase()} filter`} onClick={onClear}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}
