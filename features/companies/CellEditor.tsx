"use client";

// The quick editor (guide 4.9): one detail changed in one step, in a menu anchored to the value. A choice shows its options
// as chips with the chosen one ticked, then Clear and Edit options. A date has a field, quick picks, then Clear and Save. Text has a field
// (or a 130px text box) with Save. Pick several (GBA trials, N22) ticks and unticks options, each saved as it's ticked,
// and stays open. Enter saves (Ctrl + Enter in a text box), and the screen's toast offers Undo. It closes
// once saved: when saving fails, it stays open with what was typed, and the toast says what wasn't saved.
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { choicesOf, toggleChoice } from "@/lib/companies";
import { parseValue, quickPicks, sameValue, type FieldValue } from "@/lib/companyEdit";
import type { ChoiceOption, CompanyField } from "@/lib/companySettings";
import Button from "@/ui/Button";
import { ChoiceChip } from "@/ui/ChipGroup";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { DateInput, NumberInput, TextArea, TextInput } from "@/ui/Inputs";
import Menu, { MenuCheck, MenuChoice, MenuFoot, MenuHeading, MenuItem, MenuSeparator } from "@/ui/Menu";
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
  onSave: (value: FieldValue) => Promise<boolean>; // true once saved
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
      form={field.type !== "choice" && field.type !== "choices"}
      initialFocus={text ? ["input", "textarea"] : field.type === "date" ? ["input"] : undefined}
    >
      <MenuHeading>{field.label}</MenuHeading>
      {field.type === "choice" ? (
        <ChoiceEditor {...props} />
      ) : field.type === "choices" ? (
        <ChoicesEditor {...props} />
      ) : field.type === "date" ? (
        <DateEditor {...props} />
      ) : (
        <TextEditor {...props} />
      )}
    </Menu>
  );
}

function ChoiceEditor({ value, options = [], optionNotes = {}, onSave, onEditOptions }: CellEditorProps) {
  return (
    <>
      {options.map((o) => (
        <MenuChoice key={o.name} checked={value === o.name} onSelect={() => value !== o.name && void onSave(o.name)}>
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
          <MenuItem icon="x" onSelect={() => void onSave(undefined)}>
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

// Each tick saves the options picked so far. They're kept here too, so a quick second tick builds on the first before
// the company catches up.
function ChoicesEditor({ value, options = [], onSave }: CellEditorProps) {
  const [picked, setPicked] = useState<string | undefined>(choicesOf(value).join(", ") || undefined);
  const order = options.map((o) => o.name);
  const save = (next: string | undefined) => {
    const before = picked;
    setPicked(next);
    void onSave(next).then((saved) => !saved && setPicked(before));
  };
  return (
    <>
      {options.map((o) => (
        <MenuCheck key={o.name} checked={choicesOf(picked).includes(o.name)} onSelect={() => save(toggleChoice(picked, o.name, order))}>
          <OptionChip tone={o.colour}>{o.name}</OptionChip>
        </MenuCheck>
      ))}
      {picked && (
        <>
          <MenuSeparator />
          <MenuItem icon="x" onSelect={() => save(undefined)}>
            Clear
          </MenuItem>
        </>
      )}
    </>
  );
}

// Saves a typed value and closes once it's saved. A second Save while one runs is ignored. An editor closed meanwhile
// (another cell opened, say) doesn't close what's open now.
function useSave(onSave: CellEditorProps["onSave"], onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save(value: FieldValue) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const saved = await onSave(value);
    running.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (saved) onClose();
  }
  return { busy, save };
}

function DateEditor({ field, value, synced, today, onSave, onClose }: CellEditorProps) {
  const stored = typeof value === "string" ? value : "";
  const [date, setDate] = useState(stored);
  const saver = useSave(onSave, onClose);
  const save = (iso: string) => {
    if (sameValue(iso, stored)) onClose();
    else void saver.save(iso || undefined);
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
          <ChoiceChip key={p.label} pressed={stored === p.iso} onClick={() => save(p.iso)}>
            {p.label}
          </ChoiceChip>
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
        <Button small variant="main" busy={saver.busy} busyLabel="Saving…" onClick={() => save(date)}>
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
  const saver = useSave(onSave, onClose);
  const long = field.type === "long";
  const save = (raw: string) => {
    const next = parseValue(field, raw);
    if (required && next === undefined) {
      setMissing(true);
      return;
    }
    if (sameValue(next, stored)) onClose();
    else void saver.save(next);
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
        <Button small variant="main" busy={saver.busy} busyLabel="Saving…" onClick={() => save(draft)}>
          Save
        </Button>
      </div>
      {long && <MenuFoot>Ctrl + Enter saves.</MenuFoot>}
    </>
  );
}
