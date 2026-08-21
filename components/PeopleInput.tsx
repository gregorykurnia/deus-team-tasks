"use client";

import { useState } from "react";
import { Chip } from "./Chip";

// Generic chip-list editor. Each entry is "Name" or "Name (note)".
export function PeopleInput({
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  values: { name: string; note?: string }[];
  onChange: (v: { name: string; note?: string }[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = `sugg-${placeholder ?? "people"}`;

  function commit() {
    const raw = draft.trim();
    if (!raw) return;
    const match = raw.match(/^(.+?)\s*\((.+)\)\s*$/);
    const entry = match ? { name: match[1].trim(), note: match[2].trim() } : { name: raw };
    if (entry.name) onChange([...values, entry]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-2 focus-within:ring-2 focus-within:ring-accent/30">
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center">
          <Chip name={v.name} note={v.note} />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="-ml-1.5 text-gray-400 hover:text-gray-700 text-xs px-1"
            aria-label={`Remove ${v.name}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder ?? "Add name…"}
        className="flex-1 min-w-[100px] outline-none text-sm py-0.5 px-1"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
