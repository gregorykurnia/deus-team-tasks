// The checkbox that replaces the done circle when selecting several tasks (guide 4.7): a 22px rounded square, blue with a
// white tick when on. The head one can be mixed, shown as a minus.
import type { ComponentPropsWithRef } from "react";
import Icon from "./Icon";
import styles from "./SelectBox.module.css";

interface SelectBoxProps extends Omit<ComponentPropsWithRef<"button">, "type" | "role" | "aria-checked" | "aria-label"> {
  checked: boolean | "mixed";
  label: string; // "Select: Call Pelita Foods", or "Select every task in the list"
}

export default function SelectBox({ checked, label, className, ...props }: SelectBoxProps) {
  return (
    <button {...props} type="button" role="checkbox" aria-checked={checked} aria-label={label} className={[styles.box, className].filter(Boolean).join(" ")}>
      <Icon name={checked === "mixed" ? "minus" : "check"} size={14} />
    </button>
  );
}
