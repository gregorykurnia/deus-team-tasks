"use client";

import { useState } from "react";
import { isIsoDay, parseDayFirstDate, shortDate } from "@/lib/dates";
import type { FieldControl } from "@/ui/Field";
import Icon from "@/ui/Icon";
import { TextInput } from "@/ui/Inputs";
import styles from "./Leave.module.css";

export default function LeaveDateInput({ value, onChange, label, ...control }: FieldControl & {
  value: string;
  onChange: (date: string) => void;
  label: string;
  required?: boolean;
}) {
  const [edit, setEdit] = useState<{ text: string; date: string } | null>(null);
  const iso = isIsoDay(value) ? value : "";
  const display = edit?.date === value ? edit.text : iso ? shortDate(iso, "") : value;
  const field = label.toLowerCase();

  function choose(date: string) {
    setEdit(null);
    if (date !== value) onChange(date);
  }

  return <div className={styles.dateField}>
    <TextInput {...control} className={styles.dateText} value={display} placeholder="dd mmm yyyy" autoComplete="off" maxLength={32}
      onBlur={() => setEdit(null)} onChange={(event) => {
        const text = event.target.value;
        // Keep an invalid draft so an optional date cannot be saved as an accidental clear.
        const date = parseDayFirstDate(text) ?? text.trim();
        setEdit({ text, date });
        if (date !== value) onChange(date);
      }} />
    <span className={styles.dateCalendar}>
      <Icon name="cal" size={14} />
      <input type="date" aria-label={`Choose ${field}`} value={iso} onChange={(event) => choose(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if (typeof event.currentTarget.showPicker !== "function") return;
          try {
            event.currentTarget.showPicker();
            event.preventDefault();
          } catch {
            // The native control still handles its own keyboard and pointer interaction.
          }
        }} />
    </span>
    {value && <button className={styles.dateClear} type="button" aria-label={`Clear ${field}`} onClick={() => choose("")}>
      <Icon name="x" size={13} />
    </button>}
  </div>;
}
