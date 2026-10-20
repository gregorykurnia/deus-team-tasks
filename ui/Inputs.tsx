// The basic controls (guide 4.13): single line, text box, select, number, date with clear and quick picks, switch,
// search, and the field that edits in place. They sit in a Field, which gives them their id and aria wiring.
import type { ComponentPropsWithRef, ComponentPropsWithoutRef } from "react";
import { addDays, todayIso } from "@/lib/dates";
import { Chip } from "./ChipGroup";
import Icon from "./Icon";
import styles from "./Inputs.module.css";

const join = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export function TextInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input {...props} className={join(styles.input, className)} />;
}

export function NumberInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input inputMode="numeric" {...props} type="number" className={join(styles.input, styles.number, className)} />;
}

// big is the task description's text box: 17px, 700.
export function TextArea({ big, className, ...props }: ComponentPropsWithRef<"textarea"> & { big?: boolean }) {
  return <textarea {...props} className={join(styles.input, styles.textarea, big && styles.big, className)} />;
}

export function SelectInput({ className, ...props }: ComponentPropsWithRef<"select">) {
  return <select {...props} className={join(styles.input, styles.select, className)} />;
}

interface DateInputProps extends Omit<ComponentPropsWithRef<"input">, "type" | "value" | "onChange"> {
  value: string; // 2026-10-21, or "" for no date
  onChange: (value: string) => void;
}

// A date with a round × that clears it.
export function DateInput({ value, onChange, className, ...props }: DateInputProps) {
  return (
    <div className={styles.date}>
      <input {...props} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={join(styles.input, styles.dateInput, className)} />
      {value && (
        <button type="button" className={styles.clear} aria-label="Clear date" onClick={() => onChange("")}>
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

// Today, Tomorrow and In a week, as choice chips under a date.
export function QuickDates({ value, onPick, today = todayIso() }: { value: string; onPick: (iso: string) => void; today?: string }) {
  const picks = [
    { label: "Today", iso: today },
    { label: "Tomorrow", iso: addDays(today, 1) },
    { label: "In a week", iso: addDays(today, 7) },
  ];
  return (
    <div className={styles.quick} role="group" aria-label="Quick dates">
      {picks.map((p) => (
        <Chip key={p.label} pressed={value === p.iso} onClick={() => onPick(p.iso)}>
          {p.label}
        </Chip>
      ))}
    </div>
  );
}

// A switch: 42 × 26, blue when on. Named by its label, and pressed when on (guide 8).
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className={styles.switch} aria-pressed={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

interface SearchFieldProps {
  label: string; // what it searches, for a screen reader
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// A glass pill with a search icon; 300px in a page header, full width on phones.
export function SearchField({ label, value, onChange, placeholder, className }: SearchFieldProps) {
  return (
    <label className={join(styles.search, className)}>
      <Icon name="search" />
      <input type="search" aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// Editing in place (notes headings, flow titles): no box until hover, a white field with a blue outline on focus.
export function InPlaceField({ multiline, className, ...props }: ComponentPropsWithoutRef<"input"> & { multiline?: boolean }) {
  if (multiline) return <textarea {...(props as ComponentPropsWithoutRef<"textarea">)} className={join(styles.inplace, styles.inplaceText, className)} />;
  return <input {...props} className={join(styles.inplace, className)} />;
}
