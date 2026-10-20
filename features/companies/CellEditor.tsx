"use client";

// The quick editor (guide 4.9): one detail changed in one step, in a menu anchored to the value. A choice shows its options
// as chips with the chosen one ticked, then Clear and Edit options. A date has a field, quick picks, then Clear and Save. Text has a field
// (or a 130px text box) with Save. Enter saves (Ctrl + Enter in a text box), and the screen's toast offers Undo.
import { useState, type KeyboardEvent, type RefObject } from "react";
import { parseValue, quickPicks, sameValue, type FieldValue } from "@/lib/companyEdit";
import type { ChoiceOption, CompanyField } from "@/lib/companySettings";
import Button from "@/ui/Button";
import { Chip } from "@/ui/ChipGroup";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { DateInput, NumberInput, TextArea, TextInput } from "@/ui/Inputs";
import Menu, { MenuChoice, MenuFoot, MenuHeading, MenuItem, MenuSeparator } from "@/ui/Menu";
import OptionChip from "@/ui/OptionChip";
import styles from "./Companies.module.css";

interface CellEditorProps {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  field: Pick<CompanyField, "key" | "label" | "type">;
  value: unknown; // what's stored now
  options?: ChoiceOption[]; // a choice field's
  optionNotes?: Record<string, string>; // a note beside an option: "Moves it to Deal done"
  synced?: boolean; // linked tasks follow this date (B12)
  required?: string; // the company's name: what to say when it's emptied
  onEditOptions?: () => void; // a choice field: its options dialog
  today: string;
  onSave: (value: FieldValue) => void;
}

export default function CellEditor(props: CellEditorProps) {
  const { field, anchorRef, onClose } = props;
  const text = field.type === "text" || field.type === "long" || field.type === "number";
  return (
    <Menu
      open
      anchorRef={anchorRef}
      onClose={onClose}
      label={field.label}
      form={field.type !== "choice"}
      initialFocus={text ? ["input", "textarea"] : field.type === "date" ? ["input"] : undefined}
    >
      <MenuHeading>{field.label}</MenuHeading>
      {field.type === "choice" ? <ChoiceEditor {...props} /> : field.type === "date" ? <DateEditor {...props} /> : <TextEditor {...props} />}
    </Menu>
  );
}

function ChoiceEditor({ value, options = [], optionNotes = {}, onSave, onEditOptions }: CellEditorProps) {
  return (
    <>
      {options.map((o) => (
        <MenuChoice key={o.name} checked={value === o.name} onSelect={() => onSave(o.name)}>
          <span className={styles.miChoice}>
            <OptionChip tone={o.colour}>{o.name}</OptionChip>
            {optionNotes[o.name] && <small className={styles.miNote}>{optionNotes[o.name]}</small>}
          </span>
        </MenuChoice>
      ))}
      {options.length === 0 && <MenuFoot>No options yet.</MenuFoot>}
      {value !== undefined && value !== "" && (
        <>
          <MenuSeparator />
          <MenuItem icon="x" onSelect={() => onSave(undefined)}>
            Clear
          </MenuItem>
        </>
      )}
      {onEditOptions && (
        <>
          <MenuSeparator />
          <MenuItem icon="sliders" onSelect={onEditOptions}>
            Edit options
          </MenuItem>
        </>
      )}
    </>
  );
}

function DateEditor({ field, value, synced, today, onSave, onClose }: CellEditorProps) {
  const stored = typeof value === "string" ? value : "";
  const [date, setDate] = useState(stored);
  const save = (iso: string) => {
    onClose();
    if (!sameValue(iso, stored)) onSave(iso || undefined);
  };
  return (
    <>
      <div className={styles.qe}>
        <DateInput
          aria-label={field.label}
          value={date}
          onChange={setDate}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save(date);
            }
          }}
        />
      </div>
      <div className={styles.qeQuick} role="group" aria-label="Quick dates">
        {quickPicks(field.key, today).map((p) => (
          <Chip key={p.label} pressed={stored === p.iso} onClick={() => save(p.iso)}>
            {p.label}
          </Chip>
        ))}
      </div>
      {synced && (
        <MenuFoot>
          <span className={styles.qeSync}>
            <Icon name="sync" size={13} />
            Linked tasks follow this date.
          </span>
        </MenuFoot>
      )}
      <div className={styles.qeActs}>
        {stored && (
          <Button small variant="quiet" onClick={() => save("")}>
            Clear
          </Button>
        )}
        <span className={styles.spacer} />
        <Button small onClick={onClose}>
          Cancel
        </Button>
        <Button small variant="main" onClick={() => save(date)}>
          Save
        </Button>
      </div>
    </>
  );
}

function TextEditor({ field, value, required, onSave, onClose }: CellEditorProps) {
  const stored = value === undefined || value === null ? "" : String(value);
  const [draft, setDraft] = useState(stored);
  const [missing, setMissing] = useState(false);
  const long = field.type === "long";
  const save = (raw: string) => {
    const next = parseValue(field, raw);
    if (required && next === undefined) {
      setMissing(true);
      return;
    }
    onClose();
    if (!sameValue(next, stored)) onSave(next);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (!long || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save(draft);
    }
  };
  const error = missing && !draft.trim() ? required : undefined;
  return (
    <>
      <div className={long ? `${styles.qe} ${styles.qeLong}` : styles.qe}>
        <Field label={field.label} hideLabel error={error}>
          {(control) =>
            long ? (
              <TextArea {...control} rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
            ) : field.type === "number" ? (
              <NumberInput {...control} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
            ) : (
              <TextInput
                {...control}
                value={draft}
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              />
            )
          }
        </Field>
      </div>
      <div className={styles.qeActs}>
        {stored && !required && (
          <Button small variant="quiet" onClick={() => save("")}>
            Clear
          </Button>
        )}
        <span className={styles.spacer} />
        <Button small onClick={onClose}>
          Cancel
        </Button>
        <Button small variant="main" onClick={() => save(draft)}>
          Save
        </Button>
      </div>
      {long && <MenuFoot>Ctrl + Enter saves.</MenuFoot>}
    </>
  );
}
