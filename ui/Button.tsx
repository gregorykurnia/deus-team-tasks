// Buttons (guide 4.1). Every variant is a class here, so a link can look the same through buttonClass.
import type { ButtonHTMLAttributes } from "react";
import Spinner from "./Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "main" | "danger" | "secondary" | "quiet" | "quietRed" | "icon" | "link" | "addLine";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // secondary by default
  small?: boolean; // 34px: main small, small secondary
  glass?: boolean; // icon only: the 44px glass version
  busy?: boolean; // blocks a second press; the busy label shows with a spinner
  busyLabel?: string; // "Adding…", "Moving…"
}

// The classes for a button, for a link that should look like one. An icon button needs an aria-label.
export function buttonClass(variant: ButtonVariant = "secondary", small = false, glass = false): string {
  return [styles.button, styles[variant], small && styles.small, glass && styles.glass].filter(Boolean).join(" ");
}

export default function Button({
  variant = "secondary",
  small,
  glass,
  busy,
  busyLabel,
  disabled,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={[buttonClass(variant, small, glass), className].filter(Boolean).join(" ")}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <Spinner light={variant === "main" || variant === "danger"} />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
