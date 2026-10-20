// Choice chips (guide 4.4): a 36px white pill with a grey ring; pressed, it is blue-soft with a blue ring.
// Touch point, "Mark as important", quick dates.
import type { ComponentPropsWithRef } from "react";
import Icon, { type IconName } from "./Icon";
import styles from "./ChipGroup.module.css";

interface ChipProps extends Omit<ComponentPropsWithRef<"button">, "type"> {
  pressed: boolean;
  icon?: IconName;
}

export function Chip({ pressed, icon, children, ...props }: ChipProps) {
  return (
    <button {...props} type="button" className={styles.chip} aria-pressed={pressed}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface ChipGroupProps<T extends string> {
  label: string; // what is being chosen: "Touch point"
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean; // pressing the chosen one again clears it
}

export function ChipGroup<T extends string>({ label, options, value, onChange, allowClear = true }: ChipGroupProps<T>) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o.value} icon={o.icon} pressed={value === o.value} onClick={() => onChange(allowClear && value === o.value ? null : o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
