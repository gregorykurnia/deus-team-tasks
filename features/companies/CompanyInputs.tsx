"use client";

// What the move dialog and the new company sheet share (guide 5.10, 6.5): the groups as options to choose from, and one
// field per detail the group asks for, each marked optional (5.5).
import type { KeyboardEvent } from "react";
import { parseValue, type CompanyPatch } from "@/lib/companyEdit";
import type { CompanyGroup } from "@/lib/companies";
import type { ChoiceOption, CompanyField } from "@/lib/companySettings";
import { lookOf } from "@/lib/companyView";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { DateInput, NumberInput, SelectInput, TextArea, TextInput } from "@/ui/Inputs";
import styles from "./Companies.module.css";

interface GroupOptionsProps {
  groups: CompanyGroup[];
  value: CompanyGroup;
  onChange: (group: CompanyGroup) => void;
  label?: string; // what the choice is, for a screen reader, when nothing on screen names it
  labelledBy?: string;
  four?: boolean; // all four groups, two by two
}

// One card per group: its icon in a tinted square, the name and what it holds. Arrow keys move the choice.
export function GroupOptions({ groups, value, onChange, label, labelledBy, four }: GroupOptionsProps) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = groups[(groups.indexOf(value) + step + groups.length) % groups.length];
    onChange(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-group="${next}"]`)?.focus();
  }
  return (
    <div className={four ? `${styles.gopts} ${styles.four}` : styles.gopts} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {groups.map((g) => {
        const look = lookOf(g);
        const on = g === value;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-group={g}
            className={`${styles.gopt} ${styles[g]}`}
            onClick={() => onChange(g)}
          >
            <i>
              <Icon name={look.icon} size={16} />
            </i>
            <span>
              <b>{look.label}</b>
              <small>{look.blurb}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// A detail's value while it's being written: text as typed, a date or choice as stored, "" for nothing.
export const inputValue = (v: unknown) => (v === undefined || v === null ? "" : String(v));

interface DetailFieldProps {
  field: CompanyField;
  value: unknown;
  options: ChoiceOption[]; // a choice field's, without Deal done
  onChange: (value: string) => void;
}

export function DetailField({ field, value, options, onChange }: DetailFieldProps) {
  const v = inputValue(value);
  return (
    <Field label={field.label} optional>
      {(control) => {
        switch (field.type) {
          case "choice":
            return (
              <SelectInput {...control} value={v} onChange={(e) => onChange(e.target.value)}>
                <option value="">None</option>
                {v && !options.some((o) => o.name === v) && <option value={v}>{v}</option>}
                {options.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </SelectInput>
            );
          case "date":
            return <DateInput {...control} value={v} onChange={onChange} />;
          case "long":
            return <TextArea {...control} rows={3} value={v} onChange={(e) => onChange(e.target.value)} />;
          case "number":
            return <NumberInput {...control} inputMode="decimal" value={v} onChange={(e) => onChange(e.target.value)} />;
          default:
            return <TextInput {...control} value={v} autoComplete="off" onChange={(e) => onChange(e.target.value)} />;
        }
      }}
    </Field>
  );
}

// What the fields hold, ready to store: trimmed, numbers as numbers, nothing for an empty field.
export function storedValues(fields: CompanyField[], values: CompanyPatch): CompanyPatch {
  return Object.fromEntries(fields.filter((f) => f.key in values).map((f) => [f.key, parseValue(f, inputValue(values[f.key]))]));
}
