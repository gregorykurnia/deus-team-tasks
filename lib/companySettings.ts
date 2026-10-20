// Shared company settings (C1 to C3, D-024): the options of each choice field
// and the fields of each company group, the same for everyone on the team.
// Stored in settings/companies in the tasks project (Q6). Until that record
// exists, the built-in defaults apply. The old UI keeps its own settings in
// the browser until the launch import (task 4.8).
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { useEffect, useState } from "react";
import { assertOnline, forgetSource, reportSnapshot, watchSource } from "./connection";
import { db } from "./firebase";
import { DEAL_DONE_STATUS, FOLLOW_UP_STATUS, HIGH_PRIORITY, NO_ANSWER, NOT_NOW_ANSWER, type CompanyGroup } from "./companies";
import { replaceFieldValue } from "./companyWrites";
import type { PipelineEntry } from "./clientTypes";

/* ---------- Shape ---------- */

// The nine option colours, each a pair of tokens: --opt-<name>-bg and --opt-<name>.
export const OPTION_COLOURS = ["blue", "sky", "teal", "green", "amber", "red", "violet", "pink", "slate"] as const;
export type OptionColour = (typeof OPTION_COLOURS)[number];

// The options the groups, where to act and follow-up tasks depend on: they can only be recoloured. Deal done and
// Follow-up due are the guide's (6.5). High, Not now and No follow the same rule (R1, gap N9, provisional): where to
// act counts High, a follow-up task takes its priority from it, and the two answers tell on hold from rejected.
export type LockedRole = "dealDone" | "followUp" | "highPriority" | "notNow" | "no";

export interface ChoiceOption {
  name: string; // the value stored on companies
  colour: OptionColour;
  role?: LockedRole;
}

export type FieldType = "text" | "long" | "number" | "date" | "choice";

export interface CompanyField {
  key: string; // where companies store the value
  label: string;
  type: FieldType;
  shown: boolean; // whether the group's list (and export) shows it
  own: boolean; // added by the team; only own fields can be removed
}

export interface CompanySettings {
  options: Record<string, ChoiceOption[]>; // by field key
  fields: Record<CompanyGroup, CompanyField[]>;
}

/* ---------- Defaults ---------- */

const opt = (name: string, colour: OptionColour, role?: LockedRole): ChoiceOption => (role ? { name, colour, role } : { name, colour });

// The option names are the values already stored on companies.
const DEFAULT_OPTIONS: Record<string, ChoiceOption[]> = {
  status: [
    opt(DEAL_DONE_STATUS, "green", "dealDone"),
    opt(FOLLOW_UP_STATUS, "amber", "followUp"),
    opt("Waiting For Our Actions", "blue"),
    opt("Scheduling In Progress", "violet"),
    opt("Meeting Soon", "teal"),
    opt("Raw List", "slate"),
    opt("Drop", "red"),
  ],
  type: [opt("Client", "blue"), opt("Partner", "green"), opt("Individual Partner", "violet")],
  priority: [opt(HIGH_PRIORITY, "red", "highPriority"), opt("Medium", "amber"), opt("Low", "slate")],
  answer: [opt(NOT_NOW_ANSWER, "amber", "notNow"), opt(NO_ANSWER, "slate", "no")],
};

// Each locked option: its field, its stored name, the colour it starts with, and why it's locked.
export const LOCKED_OPTIONS: { field: string; role: LockedRole; name: string; colour: OptionColour; reason: string }[] = [
  { field: "status", role: "dealDone", name: DEAL_DONE_STATUS, colour: "green", reason: "Moves the company to Deal done" },
  { field: "status", role: "followUp", name: FOLLOW_UP_STATUS, colour: "amber", reason: "Shows who is waiting on us" },
  { field: "priority", role: "highPriority", name: HIGH_PRIORITY, colour: "red", reason: "Counts in High priority, under Where to act" },
  { field: "answer", role: "notNow", name: NOT_NOW_ANSWER, colour: "amber", reason: "Means on hold" },
  { field: "answer", role: "no", name: NO_ANSWER, colour: "slate", reason: "Means rejected" },
];

// What depends on a field's locked options, for the options dialog: "the groups and the figures depend on them".
export const LOCKED_DEPEND: Record<string, string> = {
  status: "the groups and the figures depend on",
  priority: "Where to act and follow-up tasks depend on",
  answer: "the No or not now group depends on",
};

export function lockReason(role: LockedRole): string {
  return LOCKED_OPTIONS.find((l) => l.role === role)!.reason;
}

const field = (key: string, label: string, type: FieldType, shown: boolean): CompanyField => ({ key, label, type, shown, own: false });

const DEFAULT_FIELDS: Record<CompanyGroup, CompanyField[]> = {
  toApproach: [
    field("reach", "Planned outreach", "date", true),
    field("priority", "Priority", "choice", true),
    field("type", "Type", "choice", true),
    field("industry", "Industry", "text", true),
    field("sourcing", "How we found it", "text", true),
    field("notes", "Notes", "long", true),
  ],
  active: [
    field("status", "Status", "choice", true),
    field("priority", "Priority", "choice", true),
    field("date", "Last action", "date", true),
    field("target", "Target date", "date", true),
    field("product", "Products", "text", true),
    field("notes", "Next actions", "long", true),
    field("pic", "Contact person", "text", false),
    field("type", "Type", "choice", false),
    field("trial", "Trial", "text", false),
    field("industry", "Industry", "text", false),
    field("sourcing", "How we found it", "text", false),
  ],
  dealDone: [
    field("date", "Last action", "date", true),
    field("target", "Target date", "date", true),
    field("product", "Products", "text", true),
    field("notes", "Next actions", "long", true),
    field("type", "Type", "choice", true),
    field("pic", "Contact person", "text", false),
    field("industry", "Industry", "text", false),
    field("sourcing", "How we found it", "text", false),
  ],
  noOrNotNow: [
    field("answer", "Answer", "choice", true),
    field("reason", "Reason", "long", true),
    field("product", "Products", "text", true),
    field("type", "Type", "choice", true),
    field("date", "Last action", "date", true),
    field("pic", "Contact person", "text", false),
  ],
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = { options: DEFAULT_OPTIONS, fields: DEFAULT_FIELDS };

const GROUPS: CompanyGroup[] = ["toApproach", "active", "dealDone", "noOrNotNow"];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function isColour(v: unknown): v is OptionColour {
  return typeof v === "string" && (OPTION_COLOURS as readonly string[]).includes(v);
}

// Reads the stored record, falling back to the defaults for anything missing.
// Built-in fields missing from a group come back (after the ones kept), and the
// locked options always exist.
export function readCompanySettings(data: unknown): CompanySettings {
  const stored = (data ?? {}) as Partial<CompanySettings>;
  const settings = clone(DEFAULT_COMPANY_SETTINGS);
  if (stored.options && typeof stored.options === "object") {
    for (const [key, list] of Object.entries(stored.options)) {
      if (!Array.isArray(list)) continue;
      settings.options[key] = list
        .filter((o) => o && typeof o.name === "string" && o.name.trim())
        .map((o) => opt(o.name, isColour(o.colour) ? o.colour : "slate")); // roles go by name, below
    }
  }
  for (const { field: key, role, name, colour } of LOCKED_OPTIONS) {
    const list = (settings.options[key] ??= []);
    const existing = list.find((o) => o.name === name);
    if (existing) existing.role = role;
    else list.unshift(opt(name, colour, role));
  }
  if (stored.fields && typeof stored.fields === "object") {
    for (const g of GROUPS) {
      const list = stored.fields[g];
      if (!Array.isArray(list)) continue;
      const kept = list.filter((f) => f && typeof f.key === "string" && typeof f.label === "string");
      const missing = DEFAULT_FIELDS[g].filter((d) => !kept.some((f) => f.key === d.key));
      settings.fields[g] = [...kept.map((f) => ({ ...f, shown: f.shown !== false, own: !!f.own })), ...clone(missing)];
    }
  }
  return settings;
}

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
    public problem: "locked" | "missing" | "taken" | "notFound" | "notOwn",
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

const lockedMessage = (o: ChoiceOption) => `“${o.name}” can’t be renamed or removed: ${lockReason(o.role!).toLowerCase()}. Its colour can change.`;

export async function addOption(fieldKey: string, name: string, colour: OptionColour): Promise<void> {
  await changeSettings("No connection. The option wasn't added.", (s) => {
    optionsOf(s, fieldKey).push(opt(checkName(s, fieldKey, name), colour));
  });
}

export async function recolourOption(fieldKey: string, name: string, colour: OptionColour): Promise<void> {
  await changeSettings("No connection. The colour wasn't changed.", (s) => {
    findOption(s, fieldKey, name).colour = colour;
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
    if (type === "choice") s.options[key] = options.map((o) => opt(o.name.trim(), o.colour)).filter((o) => o.name);
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
