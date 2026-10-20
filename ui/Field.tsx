"use client";

// A form field (guide 4.13): the label above, "optional" beside it, the control, then a hint or an error.
// The control gets its id and aria wiring through the child function, so the label names it and the error describes it.
import { useEffect, useId, useRef, type ReactNode } from "react";
import Icon from "./Icon";
import styles from "./Field.module.css";

export interface FieldControl {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

interface FieldProps {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string; // what to do, as a sentence: "Add a short description so the team knows what this is."
  focusKey?: number; // the form's submit count: each new try with an error moves focus to the control
  children: (control: FieldControl) => ReactNode;
}

export default function Field({ label, optional, hint, error, focusKey, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // Keyed on the try, not the message: a second try with the same error still takes focus back to the field.
  const lastKey = useRef(focusKey);
  useEffect(() => {
    if (focusKey === lastKey.current) return;
    lastKey.current = focusKey;
    if (error) document.getElementById(id)?.focus();
  }, [focusKey, error, id]);

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}>optional</span>}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : hint ? hintId : undefined,
      })}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}
    </div>
  );
}
