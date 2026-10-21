"use client";

// The people picker and the informed list (guide 4.13, W4).
// The picker is a field holding person chips with a borderless input after them. Typing offers the names already in use,
// each with its open tasks, then "Add “Nadia” as a new name". The informed list is a row per person with a note for their part.
import { useState } from "react";
import { matchNames, type NameCount } from "@/lib/people";
import Avatar from "./Avatar";
import type { Informed } from "./AvatarStack";
import Combobox, { type ComboOption } from "./Combobox";
import Icon from "./Icon";
import PersonChip from "./PersonChip";
import styles from "./PeoplePicker.module.css";

interface ControlProps {
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true";
  "aria-describedby"?: string;
}

interface NameInputProps extends ControlProps {
  suggestions: NameCount[];
  chosen: string[];
  onPick: (name: string) => void;
  onBackspaceEmpty?: () => void;
  placeholder?: string;
}

// The text field with names under it, used by both.
function NameInput({ suggestions, chosen, onPick, onBackspaceEmpty, placeholder, ...aria }: NameInputProps) {
  const [text, setText] = useState("");
  const { existing, addNew } = matchNames(text, suggestions, chosen);
  const options: ComboOption[] = existing.map((n) => ({
    key: n.name,
    content: (
      <>
        <Avatar name={n.name} size="chip" />
        <span>{n.name}</span>
        <small>{n.open} open</small>
      </>
    ),
  }));
  if (addNew) {
    options.push({
      key: addNew,
      isNew: true,
      content: (
        <>
          <span className={styles.plus}>
            <Icon name="plus" size={13} />
          </span>
          <span>Add “{addNew}” as a new name</span>
        </>
      ),
    });
  }
  return (
    <Combobox
      {...aria}
      bare
      placeholder={placeholder}
      text={text}
      onText={setText}
      options={options}
      heading={existing.length ? "Names already in use" : undefined}
      onPick={(name) => {
        onPick(name);
        setText("");
      }}
      onBackspaceEmpty={onBackspaceEmpty}
    />
  );
}

interface PeoplePickerProps extends ControlProps {
  value: string[];
  onChange: (names: string[]) => void;
  suggestions: NameCount[];
  placeholder?: string;
  morePlaceholder?: string; // once someone is in the field
}

export default function PeoplePicker({ value, onChange, suggestions, placeholder, morePlaceholder = "Add someone else", ...aria }: PeoplePickerProps) {
  return (
    <div className={styles.people}>
      {value.map((name) => (
        <PersonChip key={name} name={name} removable onRemove={() => onChange(value.filter((n) => n !== name))} />
      ))}
      <NameInput
        {...aria}
        suggestions={suggestions}
        chosen={value}
        placeholder={value.length ? (placeholder ? morePlaceholder : "") : placeholder}
        onPick={(name) => onChange([...value, name])}
        onBackspaceEmpty={() => onChange(value.slice(0, -1))}
      />
    </div>
  );
}

interface InformedListProps extends ControlProps {
  value: Informed[];
  onChange: (people: Informed[]) => void;
  suggestions: NameCount[];
}

// A Field's id goes on the add input, so the field's label points at it.
export function InformedList({ value, onChange, suggestions, ...control }: InformedListProps) {
  return (
    <div className={styles.informed}>
      {value.map((person) => (
        <div key={person.name} className={styles.row}>
          <span className={styles.who}>
            <Avatar name={person.name} size="chip" />
            <span className={styles.name}>{person.name}</span>
          </span>
          <input
            className={styles.note}
            aria-label={`Their part for ${person.name}`}
            placeholder="Their part, like “backup”"
            value={person.note ?? ""}
            onChange={(e) => onChange(value.map((p) => (p.name === person.name ? { ...p, note: e.target.value } : p)))}
          />
          <button type="button" className={styles.remove} aria-label={`Remove ${person.name}`} onClick={() => onChange(value.filter((p) => p.name !== person.name))}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <div className={styles.add}>
        <Icon name="plus" size={16} />
        <NameInput
          {...control}
          aria-label="Add someone to keep informed"
          placeholder="Add someone to keep informed"
          suggestions={suggestions}
          chosen={value.map((p) => p.name)}
          onPick={(name) => onChange([...value, { name }])}
        />
      </div>
    </div>
  );
}
