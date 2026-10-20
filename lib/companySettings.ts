// Shared company settings (C1 to C3, D-024): the options of each choice field
// and the fields of each company group, the same for everyone on the team.
// Stored in settings/companies in the tasks project (Q6). Until that record
// exists, the built-in defaults apply. The old UI keeps its own settings in
// the browser until the launch import (task 4.8).
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { useEffect, useState } from "react";
import { assertOnline, reportSnapshot } from "./connection";
import { db } from "./firebase";
import { DEAL_DONE_STATUS, FOLLOW_UP_STATUS, type CompanyGroup } from "./companies";
import { replaceFieldValue } from "./companyWrites";
import type { PipelineEntry } from "./clientTypes";

/* ---------- Shape ---------- */

// The nine option colours, each a pair of tokens: --opt-<name>-bg and --opt-<name>.
export const OPTION_COLOURS = ["blue", "sky", "teal", "green", "amber", "red", "violet", "pink", "slate"] as const;
export type OptionColour = (typeof OPTION_COLOURS)[number];

// The two options the groups and figures depend on: they can only be recoloured.
export type LockedRole = "dealDone" | "followUp";

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
  priority: [opt("High", "red"), opt("Medium", "amber"), opt("Low", "slate")],
  answer: [opt("Not now", "amber"), opt("No", "slate")],
};

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
  for (const [role, name, colour] of [
    ["dealDone", DEAL_DONE_STATUS, "green"],
    ["followUp", FOLLOW_UP_STATUS, "amber"],
  ] as const) {
    const status = (settings.options.status ??= []);
    const existing = status.find((o) => o.name === name);
    if (existing) existing.role = role;
    else status.unshift(opt(name, colour, role));
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

export function useCompanySettings(): { settings: CompanySettings; loading: boolean; stored: boolean } {
  const [state, setState] = useState({ settings: DEFAULT_COMPANY_SETTINGS, loading: true, stored: false });
  useEffect(
    () =>
      onSnapshot(
        SETTINGS_REF(),
        { includeMetadataChanges: true },
        (snap) => {
          reportSnapshot("settings", snap.metadata.fromCache);
          setState({ settings: readCompanySettings(snap.data()), loading: false, stored: snap.exists() });
        },
        (error) => {
          console.error("Unable to load the company settings", error);
          setState((s) => ({ ...s, loading: false }));
        }
      ),
    []
  );
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

const lockedMessage = (o: ChoiceOption) =>
  `"${o.name}" can't be renamed or removed: ${o.role === "dealDone" ? "it moves companies to Deal done" : "it shows who is waiting on our follow-up"}. It can be recoloured.`;

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
// companies changed.
export async function renameOption(fieldKey: string, from: string, to: string, companies: PipelineEntry[]): Promise<number> {
  let newName = to;
  await changeSettings("No connection. The option wasn't renamed.", (s) => {
    const o = findOption(s, fieldKey, from);
    if (o.role) throw new SettingsError("locked", lockedMessage(o));
    newName = checkName(s, fieldKey, to, from);
    o.name = newName;
  });
  return newName === from ? 0 : replaceFieldValue(companies, fieldKey, from, newName);
}

// Removes an option and clears it from every company that uses it. Returns how
// many companies changed.
export async function removeOption(fieldKey: string, name: string, companies: PipelineEntry[]): Promise<number> {
  await changeSettings("No connection. The option wasn't removed.", (s) => {
    const o = findOption(s, fieldKey, name);
    if (o.role) throw new SettingsError("locked", lockedMessage(o));
    s.options[fieldKey] = optionsOf(s, fieldKey).filter((x) => x !== o);
  });
  return replaceFieldValue(companies, fieldKey, name, undefined);
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

export async function renameField(group: CompanyGroup, key: string, label: string): Promise<void> {
  await changeSettings("No connection. The field wasn't renamed.", (s) => {
    const clean = label.trim();
    if (!clean) throw new SettingsError("missing", "Enter a name.");
    findField(s, group, key).label = clean;
  });
}

// Adds an own field to a group, with its options for a choice. Returns its key.
export async function addOwnField(group: CompanyGroup, label: string, type: FieldType, options: ChoiceOption[] = []): Promise<string> {
  const key = `cx_${Date.now()}`;
  await changeSettings("No connection. The field wasn't added.", (s) => {
    const clean = label.trim();
    if (!clean) throw new SettingsError("missing", "Enter a name.");
    s.fields[group].push({ key, label: clean, type, shown: true, own: true });
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
