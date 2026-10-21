"use client";

// The Fields sheet (guide 6.5, C1, C2): one group's fields, each with a switch for whether the list (and export) shows it,
// and rename. Own fields are tagged and can be removed, after a confirmation that says what entered values stay stored.
// "Add a field" asks for a name and a kind: short text, long text, number, date or choice, with its options. A choice
// field's Options opens the options dialog. Each change saves itself, for everyone. It opens from the address
// (?fields=<group>), so a reload keeps it and Back closes it.
import { useState } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { COMPANY_GROUP_LABELS, COMPANY_GROUPS, type CompanyGroup } from "@/lib/companies";
import {
  addOwnField,
  fieldNameTaken,
  OPTION_COLOURS,
  removedFieldsWithValues,
  removeOwnField,
  renameField,
  setFieldShown,
  SettingsError,
  type ChoiceOption,
  type CompanyField,
  type CompanySettings,
  type FieldType,
} from "@/lib/companySettings";
import { failureMessage } from "@/lib/connection";
import { plural } from "@/lib/dates";
import Button from "@/ui/Button";
import { ChipGroup } from "@/ui/ChipGroup";
import { Confirm } from "@/ui/Dialog";
import Field from "@/ui/Field";
import Icon, { type IconName } from "@/ui/Icon";
import { Switch, TextInput } from "@/ui/Inputs";
import OptionChip from "@/ui/OptionChip";
import Segmented from "@/ui/Segmented";
import Sheet, { SheetSpacer } from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import OptionsDialog, { type OptionChanges } from "./OptionsDialog";
import { usePending } from "./usePending";
import styles from "./Settings.module.css";

export const KIND_LABELS: Record<FieldType, string> = { text: "Short text", long: "Long text", number: "Number", date: "Date", choice: "Choice" };
const KIND_ICONS: Record<FieldType, IconName> = { text: "text", long: "para", number: "hash", date: "cal", choice: "choice" };
const KINDS: FieldType[] = ["text", "long", "number", "date", "choice"];

interface FieldsSheetProps extends OptionChanges {
  group: CompanyGroup;
  settings: CompanySettings;
  companies: PipelineEntry[];
  online: boolean;
  onGroup: (group: CompanyGroup) => void;
  onClose: () => void;
}

interface Adding {
  name: string;
  type: FieldType;
  options: ChoiceOption[];
  optionText: string;
  error: string | null;
  tries: number; // each try with an error takes focus back to the name
}

const blankAdding = (): Adding => ({ name: "", type: "text", options: [], optionText: "", error: null, tries: 0 });

export default function FieldsSheet({ group, settings, companies, online, onGroup, onClose, onRenamed, onRemoved }: FieldsSheetProps) {
  const toast = useToast();
  const fields = settings.fields[group];
  const label = COMPANY_GROUP_LABELS[group];
  const shown = usePending<boolean>();

  const [renaming, setRenaming] = useState<{ key: string; value: string; error: string | null } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [removing, setRemoving] = useState<CompanyField | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [optionsFor, setOptionsFor] = useState<CompanyField | null>(null);
  const leftOver = removedFieldsWithValues(companies, settings);

  function pickGroup(next: CompanyGroup | null) {
    if (!next || next === group) return;
    setRenaming(null);
    setAdding(null);
    onGroup(next);
  }

  async function toggle(f: CompanyField, on: boolean) {
    shown.set(f.key, on, f.shown);
    try {
      await setFieldShown(group, f.key, on);
    } catch (err) {
      shown.drop(f.key);
      toast(failureMessage(err, "The change couldn’t be saved. Check your connection and try again."), { error: true });
    }
  }

  async function saveRename() {
    if (!renaming || renameBusy) return;
    const f = fields.find((x) => x.key === renaming.key);
    const name = renaming.value.trim();
    if (!f || name === f.label) return setRenaming(null);
    if (!name) return setRenaming({ ...renaming, error: "A field needs a name." });
    if (fieldNameTaken(fields, name, f.key)) return setRenaming({ ...renaming, error: `There’s already a field called “${name}”.` });
    setRenameBusy(true);
    try {
      await renameField(group, f.key, name);
      setRenaming(null);
      toast(`Renamed to “${name}” in ${label}`);
    } catch (err) {
      if (err instanceof SettingsError && err.problem === "taken") setRenaming({ ...renaming, error: `There’s already a field called “${name}”.` });
      else toast(failureMessage(err, "The field couldn’t be renamed. Check your connection and try again."), { error: true });
    } finally {
      setRenameBusy(false);
    }
  }

  // An option typed for a new choice field: Enter adds it, in the next colour; a name already there isn't added twice.
  function addTypedOption(a: Adding): Adding {
    const name = a.optionText.trim();
    if (!name || a.options.some((o) => o.name.toLowerCase() === name.toLowerCase())) return { ...a, optionText: "" };
    return { ...a, optionText: "", options: [...a.options, { name, colour: OPTION_COLOURS[a.options.length % OPTION_COLOURS.length] }] };
  }

  async function saveAdding() {
    if (!adding || addBusy) return;
    const name = adding.name.trim();
    const fail = (error: string) => setAdding({ ...adding, error, tries: adding.tries + 1 });
    if (!name) return fail("Give the field a name.");
    if (fieldNameTaken(fields, name)) return fail(`${label} already has a field called “${name}”.`);
    const ready = adding.type === "choice" ? addTypedOption(adding) : adding;
    setAddBusy(true);
    try {
      await addOwnField(group, name, adding.type, adding.type === "choice" ? ready.options : []);
      setAdding(null);
      toast(`“${name}” added to ${label}, and shown in its list`);
    } catch (err) {
      if (err instanceof SettingsError && err.problem === "taken") fail(`${label} already has a field called “${name}”.`);
      else toast(failureMessage(err, "The field couldn’t be added. Check your connection and try again."), { error: true });
    } finally {
      setAddBusy(false);
    }
  }

  const valuesIn = (f: CompanyField) => companies.filter((c) => c[f.key] !== undefined && c[f.key] !== null && c[f.key] !== "").length;

  async function confirmRemove() {
    if (!removing || removeBusy) return;
    const f = removing;
    setRemoveBusy(true);
    try {
      await removeOwnField(group, f.key);
      setRemoving(null);
      toast(`“${f.label}” removed from ${label}`);
    } catch (err) {
      setRemoving(null);
      toast(failureMessage(err, "The field couldn’t be removed. Check your connection and try again."), { error: true });
    } finally {
      setRemoveBusy(false);
    }
  }

  function row(f: CompanyField) {
    const on = shown.value(f.key, f.shown);
    const editing = renaming?.key === f.key ? renaming : null;
    const count = f.type === "choice" ? (settings.options[f.key] ?? []).length : 0;
    return (
      <div key={f.key} className={on ? styles.row : `${styles.row} ${styles.off}`}>
        <Switch on={on} onChange={(v) => void toggle(f, v)} label={`Show ${f.label} in the ${label} list`} />
        {editing ? (
          <div className={styles.rename}>
            <Field label={`New name for ${f.label}`} hideLabel error={editing.error ?? undefined}>
              {(control) => (
                <TextInput
                  {...control}
                  autoFocus
                  value={editing.value}
                  autoComplete="off"
                  onChange={(e) => setRenaming({ ...editing, value: e.target.value, error: null })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveRename();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault(); // closes the rename, not the sheet
                      setRenaming(null);
                    }
                  }}
                />
              )}
            </Field>
            <div className={styles.renameActs}>
              <Button small onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button small variant="main" busy={renameBusy} busyLabel="Saving…" onClick={() => void saveRename()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.name}>
            <b>{f.label}</b>
            <small>
              <Icon name={KIND_ICONS[f.type]} size={13} />
              {KIND_LABELS[f.type]}
              {f.own && <span className={styles.own}>Own</span>}
              {f.type === "choice" && ` · ${plural(count, "option")}`}
            </small>
          </div>
        )}
        {!editing && (
          <div className={styles.acts}>
            {f.type === "choice" && (
              <Button small variant="quiet" onClick={() => setOptionsFor(f)}>
                <Icon name="choice" size={16} />
                Options
              </Button>
            )}
            <Button variant="icon" aria-label={`Rename ${f.label}`} title="Rename" onClick={() => setRenaming({ key: f.key, value: f.label, error: null })}>
              <Icon name="edit" size={16} />
            </Button>
            {f.own && (
              <Button variant="icon" className={styles.redIcon} aria-label={`Remove ${f.label}`} title="Remove" onClick={() => setRemoving(f)}>
                <Icon name="trash" size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title="Fields"
        size="wide"
        initialFocus="[data-done]"
        footer={
          <>
            <span className={online ? styles.saved : `${styles.saved} ${styles.savedOff}`}>
              <Icon name={online ? "done" : "wifi"} size={15} />
              {online ? "Saved as you go." : "Offline. Changes can’t be saved."}
            </span>
            <SheetSpacer />
            <Button variant="main" data-done onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <Segmented label="Group of companies" full options={COMPANY_GROUPS.map((g) => ({ value: g, label: COMPANY_GROUP_LABELS[g] }))} value={group} onChange={pickGroup} />
        <p className={styles.intro}>
          Switch on what the <b>{label}</b> list shows. Every field stays in each company’s record, and exports use the fields shown here. Changes apply for
          everyone on the team.
        </p>
        <div className={styles.list} role="list" aria-label={`Fields of ${label}`}>
          <div className={`${styles.row} ${styles.fixed}`} role="listitem">
            <span className={styles.fixedSwitch} aria-hidden="true">
              <i />
            </span>
            <div className={styles.name}>
              <b>Company name</b>
              <small>
                <Icon name="lock" size={13} />
                Always shown, and the only required field
              </small>
            </div>
          </div>
          {fields.map((f) => (
            <div key={f.key} role="listitem">
              {row(f)}
            </div>
          ))}
        </div>

        {adding ? (
          <AddField
            adding={adding}
            busy={addBusy}
            onChange={setAdding}
            onAddOption={() => setAdding(addTypedOption(adding))}
            onCancel={() => setAdding(null)}
            onSave={() => void saveAdding()}
          />
        ) : (
          <button type="button" className={styles.addLine} onClick={() => setAdding(blankAdding())}>
            <Icon name="plus" size={16} />
            <span>Add a field</span>
            <small>Short text, long text, number, date or choice</small>
          </button>
        )}
        {leftOver > 0 && (
          <p className={styles.help}>
            {plural(leftOver, "removed field")} still {leftOver === 1 ? "has" : "have"} stored values. They aren’t shown anywhere.
          </p>
        )}
      </Sheet>

      {optionsFor && (
        <OptionsDialog field={optionsFor} settings={settings} companies={companies} onClose={() => setOptionsFor(null)} onRenamed={onRenamed} onRemoved={onRemoved} />
      )}
      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={`Remove “${removing?.label ?? ""}”?`}
        confirmLabel="Remove field"
        busyLabel="Removing…"
        busy={removeBusy}
      >
        {removing &&
          `It disappears from ${label}, its list and its records. ${
            valuesIn(removing) ? `The values already entered for ${plural(valuesIn(removing), "company", "companies")} stay stored.` : "No company has a value in it yet."
          }`}
      </Confirm>
    </>
  );
}

function AddField({
  adding,
  busy,
  onChange,
  onAddOption,
  onCancel,
  onSave,
}: {
  adding: Adding;
  busy: boolean;
  onChange: (next: Adding) => void;
  onAddOption: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className={styles.add} role="group" aria-label="Add a field">
      <Field label="Field name" error={adding.error ?? undefined} focusKey={adding.tries}>
        {(control) => (
          <TextInput
            {...control}
            autoFocus
            value={adding.name}
            placeholder="Like “Decision maker” or “Branches”"
            autoComplete="off"
            onChange={(e) => onChange({ ...adding, name: e.target.value, error: null })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
              }
            }}
          />
        )}
      </Field>
      <Field label="Kind" group>
        {() => (
          <ChipGroup
            label="Kind"
            allowClear={false}
            options={KINDS.map((k) => ({ value: k, label: KIND_LABELS[k], icon: KIND_ICONS[k] }))}
            value={adding.type}
            onChange={(type) => type && onChange({ ...adding, type })}
          />
        )}
      </Field>
      {adding.type === "choice" && (
        <Field label="Options" optional="add as many as you need; more can come later" group>
          {() => (
            <div className={styles.newOptions} role="group" aria-label="Options">
              {adding.options.map((o, i) => (
                <span key={o.name} className={styles.newOption}>
                  <OptionChip tone={o.colour}>{o.name}</OptionChip>
                  <button
                    type="button"
                    aria-label={`Remove ${o.name}`}
                    onClick={() => onChange({ ...adding, options: adding.options.filter((_, j) => j !== i) })}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
              <input
                value={adding.optionText}
                placeholder="Type an option, then Enter"
                aria-label="New option"
                autoComplete="off"
                onChange={(e) => onChange({ ...adding, optionText: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddOption();
                  }
                  if (e.key === "Backspace" && !adding.optionText && adding.options.length) {
                    onChange({ ...adding, options: adding.options.slice(0, -1) });
                  }
                }}
              />
            </div>
          )}
        </Field>
      )}
      <div className={styles.addActs}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="main" busy={busy} busyLabel="Adding…" onClick={onSave}>
          Add field
        </Button>
      </div>
    </div>
  );
}
