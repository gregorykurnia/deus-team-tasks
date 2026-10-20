// A filter button (guide 4.3): a 36px white pill with an icon, a label and a down arrow. When it is on it turns
// blue-soft with a blue ring, shows its value, and gets a round × to clear it. Pass its ref to the Menu it opens.
// FilterToggle is the same pill as an on/off switch with no menu, such as Select ("Selecting" while on). FilterAction
// is the pill opening a sheet or dialog, such as Companies' Fields and Export.
import type { Ref } from "react";
import Icon, { type IconName } from "./Icon";
import styles from "./FilterButton.module.css";

interface FilterButtonProps {
  label: string; // "Due"
  value?: string | null; // "Overdue": the filter is on when it has one
  summary?: string | null; // a choice that is always made and never "on": Sort's "Deadline, earliest first"
  icon?: IconName;
  expanded?: boolean;
  onClick: () => void;
  onClear?: () => void;
  ref?: Ref<HTMLButtonElement>;
}

export default function FilterButton({ label, value, summary, icon, expanded, onClick, onClear, ref }: FilterButtonProps) {
  const on = !!value;
  const shown = value ?? summary;
  return (
    <span className={on ? `${styles.filter} ${styles.on}` : styles.filter}>
      <button ref={ref} type="button" className={styles.main} aria-haspopup="menu" aria-expanded={expanded} onClick={onClick}>
        {icon && <Icon name={icon} size={15} />}
        <span>{label}</span>
        {shown && <b className={styles.value}>{shown}</b>}
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

export function FilterToggle({ label, icon, pressed, onClick, ref }: { label: string; icon?: IconName; pressed: boolean; onClick: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <span className={pressed ? `${styles.filter} ${styles.on} ${styles.toggleOn}` : styles.filter}>
      <button ref={ref} type="button" className={styles.main} aria-pressed={pressed} onClick={onClick}>
        {icon && <Icon name={icon} size={15} />}
        <span>{label}</span>
      </button>
    </span>
  );
}

export function FilterAction({ label, icon, opens, onClick, ref }: { label: string; icon?: IconName; opens: "dialog"; onClick: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <span className={styles.filter}>
      <button ref={ref} type="button" className={styles.main} aria-haspopup={opens} onClick={onClick}>
        {icon && <Icon name={icon} size={15} />}
        <span>{label}</span>
      </button>
    </span>
  );
}
