// The done circle (guide 4.6): 24px, a 2px ring in the kind's colour, an invisible hit area that reaches 44px.
// It is its own button, apart from the row that opens the task. Its label says what it does and to which task.
import type { ComponentPropsWithRef } from "react";
import type { Kind } from "@/lib/kinds";
import Icon from "./Icon";
import { kindStyle } from "./kindStyle";
import styles from "./DoneCircle.module.css";

interface DoneCircleProps extends Omit<ComponentPropsWithRef<"button">, "type" | "title"> {
  kind: Kind;
  done: boolean;
  title: string; // the task's name, for the label
}

export default function DoneCircle({ kind, done, title, className, style, ...props }: DoneCircleProps) {
  return (
    <button
      {...props}
      type="button"
      className={[styles.circle, className].filter(Boolean).join(" ")}
      style={{ ...kindStyle(kind), ...style }}
      data-done={done || undefined}
      aria-label={`${done ? "Mark not done" : "Mark done"}: ${title}`}
    >
      <Icon name="check" size={14} />
    </button>
  );
}
