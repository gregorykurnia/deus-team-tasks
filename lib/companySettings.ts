// Shared company settings (C1 to C3, D-024): the options of each choice field
// and the fields of each company group, the same for everyone on the team.
// Task types share this live options record too.
// Stored in settings/companies in the tasks project (Q6). Until that record
// exists, the built-in defaults apply. The old UI keeps its own settings in
// the browser until the launch import (task 4.8).
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { useEffect, useState } from "react";
import { assertOnline, forgetSource, reportSnapshot, watchSource } from "./connection";
import { db } from "./firebase";
import type { CompanyGroup } from "./companies";
import { replaceFieldValue } from "./companyWrites";
import type { PipelineEntry } from "./clientTypes";
import {
  companyOption, DEFAULT_COMPANY_SETTINGS, lockReason, OPTION_COLOURS, readCompanySettings,
  type ChoiceOption, type CompanyField, type CompanySettings, type FieldType, type OptionColour,
} from "./companySettingsModel";

export { DEFAULT_COMPANY_SETTINGS, lockReason, OPTION_COLOURS, readCompanySettings };
export { LOCKED_DEPEND, LOCKED_OPTIONS, type LockedRole } from "./companySettingsModel";
export type { ChoiceOption, CompanyField, CompanySettings, FieldType, OptionColour };

/* ---------- Reading ---------- */

const SETTINGS_REF = () => doc(db, "settings", "companies");

export interface CompanySettingsState {
  settings: CompanySettings;
  loading: boolean;
  stored: boolean;
  error: Error | null; // the record couldn't be read: the defaults show instead
}

export function useCompanySettings(): CompanySettingsState {
  const [state, setState] = useState<CompanySettingsState>({ settings: DEFAULT_COMPANY_SETTINGS, loading: true, stored: false, error: null });
  useEffect(() => {
    watchSource("settings");
    const unsubscribe = onSnapshot(
      SETTINGS_REF(),
      { includeMetadataChanges: true },
      (snap) => {
        reportSnapshot("settings", snap.metadata.fromCache);
        setState({ settings: readCompanySettings(snap.data()), loading: false, stored: snap.exists(), error: null });
      },
      (error) => {
        console.error("Unable to load the company settings", error);
        forgetSource("settings"); // Firestore closes a listener that reports an error
        setState((s) => ({ ...s, loading: false, error }));
      }
    );
    return () => {
      unsubscribe();
      forgetSource("settings");
    };
  }, []);
  return state;
}

/* ---------- Changing ---------- */

export class SettingsError extends Error {
  constructor(
    public problem: "locked" | "missing" | "taken" | "notFound" | "notOwn" | "reserved",
    message: string
  ) {
    super(message);
  }
}

// Reads, changes and writes the record in one transaction, so two people
// changing settings at once don't undo each other.
async function changeSettings(message: string, change: (s: CompanySettings) => void): Promise<CompanySettings> {
  assertOnline(message);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(SETTINGS_REF());
    const settings = readCompanySettings(snap.data());
    change(settings);
    tx.set(SETTINGS_REF(), JSON.parse(JSON.stringify(settings)));
    return settings;
  });
}

function optionsOf(s: CompanySettings, fieldKey: string): ChoiceOption[] {
  return (s.options[fieldKey] ??= []);
}

function findOption(s: CompanySettings, fieldKey: string, name: string): ChoiceOption {
  const o = optionsOf(s, fieldKey).find((x) => x.name === name);
  if (!o) throw new SettingsError("notFound", `There's no option "${name}".`);
  return o;
}

function checkName(s: CompanySettings, fieldKey: string, name: string, except?: string) {
  const clean = name.trim();
  if (!clean) throw new SettingsError("missing", "Enter a name.");
  if (fieldKey === "taskType" && clean === "-") throw new SettingsError("reserved", "Choose a name other than “-”.");
  if (optionsOf(s, fieldKey).some((o) => o.name !== except && o.name.trim().toLowerCase() === clean.toLowerCase())) {
    throw new SettingsError("taken", "An option with that name already exists.");
  }
  return clean;
}

// The settings changed, but not every company using the option followed. Running the same rename or removal again
// finishes them.
export class CompaniesBehindError extends Error {
  constructor(public reason: unknown) {
    super("The option changed, but not every company using it followed.");
  }
}

async function companiesFollow(write: () => Promise<number>): Promise<number> {
  try {
    return await write();
  } catch (err) {
    throw new CompaniesBehindError(err);
  }
}

const lockedMessage = (o: ChoiceOption) => `“${o.name}” can’t be renamed or removed: ${lockReason(o.role!).toLowerCase()}. Its colour and position can change.`;

export async function addOption(fieldKey: string, name: string, colour: OptionColour): Promise<void> {
  await changeSettings(`No connection. The ${fieldKey === "taskType" ? "task type" : "option"} wasn't added.`, (s) => {
    optionsOf(s, fieldKey).push(companyOption(checkName(s, fieldKey, name), colour));
  });
}

export async function recolourOption(fieldKey: string, name: string, colour: OptionColour): Promise<void> {
  await changeSettings("No connection. The colour wasn't changed.", (s) => {
    findOption(s, fieldKey, name).colour = colour;
  });
}

export async function moveOption(fieldKey: string, name: string, toIndex: number): Promise<void> {
  await changeSettings("No connection. The order wasn't changed.", (s) => {
    const option = findOption(s, fieldKey, name);
    const options = optionsOf(s, fieldKey);
    options.splice(options.indexOf(option), 1);
    options.splice(Math.max(0, Math.min(toIndex, options.length)), 0, option);
  });
}

// Renames an option and every company using it follows. Returns how many
// companies changed. CompaniesBehindError says the option is renamed but some
// companies didn't follow; running it again finishes them.
export async function renameOption(fieldKey: string, from: string, to: string, companies: PipelineEntry[]): Promise<number> {
  let newName = to;
  await changeSettings("No connection. The option wasn't renamed.", (s) => {
    const renamed = !optionsOf(s, fieldKey).some((x) => x.name === from) && optionsOf(s, fieldKey).find((x) => x.name === to.trim());
    if (renamed) {
      newName = renamed.name;
      return;
    }
    const o = findOption(s, fieldKey, from);
    if (o.role) throw new SettingsError("locked", lockedMessage(o));
    newName = checkName(s, fieldKey, to, from);
    o.name = newName;
  });
  return newName === from ? 0 : companiesFollow(() => replaceFieldValue(companies, fieldKey, from, newName));
}

// Removes an option and clears it from every company that uses it. Returns how
// many companies changed. CompaniesBehindError says the option is removed but
// some companies still have it; running it again finishes them.
export async function removeOption(fieldKey: string, name: string, companies: PipelineEntry[]): Promise<number> {
  await changeSettings("No connection. The option wasn't removed.", (s) => {
    const o = optionsOf(s, fieldKey).find((x) => x.name === name);
    if (!o) return; // already removed
    if (o.role) throw new SettingsError("locked", lockedMessage(o));
    s.options[fieldKey] = optionsOf(s, fieldKey).filter((x) => x !== o);
  });
  return companiesFollow(() => replaceFieldValue(companies, fieldKey, name, undefined));
}

function findField(s: CompanySettings, group: CompanyGroup, key: string): CompanyField {
  const f = s.fields[group].find((x) => x.key === key);
  if (!f) throw new SettingsError("notFound", "That field isn't in this group.");
  return f;
}

export async function setFieldShown(group: CompanyGroup, key: string, shown: boolean): Promise<void> {
  await changeSettings("No connection. The fields weren't changed.", (s) => {
    findField(s, group, key).shown = shown;
  });
}

// Whether a group already has a field by this name, ignoring case and the spaces around it. "Company name" is taken.
export function fieldNameTaken(fields: Pick<CompanyField, "key" | "label">[], name: string, exceptKey?: string): boolean {
  const clean = name.trim().toLowerCase();
  return clean === "company name" || fields.some((f) => f.key !== exceptKey && f.label.trim().toLowerCase() === clean);
}

function checkFieldName(s: CompanySettings, group: CompanyGroup, label: string, exceptKey?: string): string {
  const clean = label.trim();
  if (!clean) throw new SettingsError("missing", "Enter a name.");
  if (fieldNameTaken(s.fields[group], clean, exceptKey)) throw new SettingsError("taken", "A field with that name already exists.");
  return clean;
}

export async function renameField(group: CompanyGroup, key: string, label: string): Promise<void> {
  await changeSettings("No connection. The field wasn't renamed.", (s) => {
    const f = findField(s, group, key);
    f.label = checkFieldName(s, group, label, key);
  });
}

const OWN_KEY_PREFIX = "cx_";

// Adds an own field to a group, with its options for a choice. Returns its key.
export async function addOwnField(group: CompanyGroup, label: string, type: FieldType, options: ChoiceOption[] = []): Promise<string> {
  const key = `${OWN_KEY_PREFIX}${Date.now()}`;
  await changeSettings("No connection. The field wasn't added.", (s) => {
    s.fields[group].push({ key, label: checkFieldName(s, group, label), type, shown: true, own: true });
    if (type === "choice") s.options[key] = options.map((o) => companyOption(o.name.trim(), o.colour)).filter((o) => o.name);
  });
  return key;
}

// Removes an own field from a group. What companies stored in it stays (C2).
export async function removeOwnField(group: CompanyGroup, key: string): Promise<void> {
  await changeSettings("No connection. The field wasn't removed.", (s) => {
    const f = findField(s, group, key);
    if (!f.own) throw new SettingsError("notOwn", "Only fields the team added can be removed.");
    s.fields[group] = s.fields[group].filter((x) => x !== f);
  });
}

// Own fields removed from every group whose values companies still hold (C2: removing keeps what was entered). Only the
// fields this app adds (cx_ keys) count, so nothing else stored on a company is mistaken for one.
export function removedFieldsWithValues(companies: PipelineEntry[], s: CompanySettings): number {
  const inUse = new Set(Object.values(s.fields).flatMap((list) => list.map((f) => f.key)));
  const left = new Set<string>();
  for (const c of companies) {
    for (const [k, v] of Object.entries(c)) {
      if (k.startsWith(OWN_KEY_PREFIX) && !inUse.has(k) && v !== undefined && v !== null && v !== "") left.add(k);
    }
  }
  return left.size;
}

/* ---------- Colours from the old settings ---------- */

const COLOUR_SAMPLES: Record<OptionColour, string> = {
  blue: "#e4edff",
  sky: "#dcf0fb",
  teal: "#d9f3f1",
  green: "#dcf5ea",
  amber: "#fff0d9",
  red: "#ffe5e8",
  violet: "#efe6ff",
  pink: "#ffe4f0",
  slate: "#e8ecf3",
};

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hueOf([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// The option colour nearest a background picked freely in the old app (for
// the launch import, task 4.8): the nearest hue, or slate for greys and
// unreadable values. The old colours are pale, so hue matters, not distance.
export function nearestOptionColour(hex: string): OptionColour {
  const c = rgb(hex);
  if (!c || Math.max(...c) - Math.min(...c) < 7) return "slate"; // near-greys
  const hue = hueOf(c);
  let best: OptionColour = "slate";
  let bestDist = Infinity;
  for (const name of OPTION_COLOURS) {
    if (name === "slate") continue;
    const diff = Math.abs(hueOf(rgb(COLOUR_SAMPLES[name])!) - hue);
    const dist = Math.min(diff, 360 - diff);
    if (dist < bestDist) [best, bestDist] = [name, dist];
  }
  return best;
}
