// The launch data step (task 4.8), pure part: turns the company options and columns the old app kept in one browser
// (Q4: the owner's main computer) into the shared settings record, and lists the subsidiaries whose sector comes from
// their parent (D-016). The old app's storage keys and shapes are copied here, so this keeps working after task 4.7
// deletes the old files.
import {
  DEFAULT_COMPANY_SETTINGS,
  fieldNameTaken,
  LOCKED_OPTIONS,
  nearestOptionColour,
  readCompanySettings,
  type ChoiceOption,
  type CompanyField,
  type CompanySettings,
  type FieldType,
} from "../../lib/companySettings";
import type { CompanyGroup } from "../../lib/companies";
import { cleanSector } from "../../lib/historicalClientTypes";

/* ---------- The old app's shapes (copied from lib/clientTypes.ts and lib/clientLocalConfig.ts) ---------- */

export const OLD_OPTIONS_KEY = "clients_dp_options";
export const OLD_COLUMNS_KEY = "clients_col_config";

type OldOption = { label: string; bg: string; color: string };
type OldOptions = Record<string, OldOption[]>;
// type was "text" | "number" | "date" | "dropdown" | "textarea" | "computed"; kept a string, as the file is read as is.
type OldColumn = { key: string; label: string; type: string; visible: boolean; custom: boolean };
type OldTable = "main" | "raw" | "hold";
type OldColumns = Partial<Record<OldTable, OldColumn[]>>;

// What the export snippet (export-settings.js) saves: null where the browser kept nothing, so the old defaults applied.
export interface OldDeviceExport {
  exportedAt?: string;
  from?: string;
  options: OldOptions | null;
  columns: OldColumns | null;
}

// The old app's built-in option colours. An option still on its old colour was never picked by anyone, so it takes
// the new design's colour; a colour someone picked is mapped to the nearest of the nine.
const OLD_DEFAULT_BG: Record<string, Record<string, string>> = {
  type: { Client: "#EFF6FF", Partner: "#ECFDF5", "Individual Partner": "#FDF4FF" },
  status: {
    "Client / Partner Done Deal": "#ECFDF5",
    "To Follow Up": "#EFF6FF",
    "Waiting For Our Actions": "#FFFBEB",
    "Scheduling In Progress": "#F5F3FF",
    "Meeting Soon": "#ECFDF5",
    "Raw List": "#F9FAFB",
    Drop: "#FEF2F2",
  },
  priority: { High: "#FEF2F2", Medium: "#FFFBEB", Low: "#F0FDF4" },
};

// The old app's built-in column labels per table. A label that still matches was never renamed, so the new design's
// label stays; a label someone typed is kept.
const OLD_BUILTIN_LABELS: Record<OldTable, Record<string, string>> = {
  main: {
    company: "Company",
    type: "Type",
    date: "Last Action",
    since: "Since",
    status: "Status",
    pic: "PIC",
    sourcing: "Sourcing",
    product: "Product",
    trial: "Trial",
    priority: "Priority",
    industry: "Industry",
    notes: "Next Actions",
    target: "Target Date",
  },
  raw: {
    company: "Company",
    type: "Type",
    reach: "Planned Reach Out",
    industry: "Industry",
    sourcing: "Sourcing",
    priority: "Priority",
    notes: "Notes",
  },
  hold: { company: "Company", type: "Type", product: "Product Offered", reason: "Reason for Rejection / Hold" },
};

// Which old table each company group was shown in. Prospects and Deal done shared one table.
const TABLE_OF: Record<CompanyGroup, OldTable> = { toApproach: "raw", active: "main", dealDone: "main", noOrNotNow: "hold" };
const GROUPS = Object.keys(TABLE_OF) as CompanyGroup[];

const TYPE_OF: Record<string, FieldType | undefined> = {
  text: "text",
  number: "number",
  date: "date",
  dropdown: "choice",
  textarea: "long",
};

/* ---------- Settings ---------- */

export interface SettingsImport {
  settings: CompanySettings;
  notes: string[]; // what the import did beyond the defaults, one line each, for the run's report
  warnings: string[]; // things to look at before the live run
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const sameColour = (a: string, b: string | undefined) => !!b && a.trim().toLowerCase() === b.toLowerCase();

function importOptions(field: string, list: OldOption[], s: SettingsImport): ChoiceOption[] {
  const defaults = DEFAULT_COMPANY_SETTINGS.options[field] ?? [];
  const out: ChoiceOption[] = [];
  for (const o of list) {
    const name = typeof o?.label === "string" ? o.label.trim() : "";
    if (!name || out.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    const designColour = defaults.find((d) => d.name === name)?.colour;
    const bg = typeof o.bg === "string" ? o.bg : "";
    if (designColour && sameColour(bg, OLD_DEFAULT_BG[field]?.[name])) {
      out.push({ name, colour: designColour });
      continue;
    }
    const colour = nearestOptionColour(bg);
    out.push({ name, colour });
    if (!designColour) s.notes.push(`${field}: option "${name}" kept, ${bg || "no colour"} → ${colour}`);
    else if (designColour !== colour) s.notes.push(`${field}: "${name}" keeps its picked colour ${bg} → ${colour}`);
  }
  for (const d of defaults) {
    if (!out.some((x) => x.name === d.name)) s.notes.push(`${field}: option "${d.name}" was removed on that computer, so it's left out`);
  }
  return out;
}

function uniqueLabel(fields: CompanyField[], label: string): string {
  if (!fieldNameTaken(fields, label)) return label;
  for (let n = 2; ; n++) if (!fieldNameTaken(fields, `${label} ${n}`)) return `${label} ${n}`;
}

// The shared settings record built from one browser's old settings. Anything that browser didn't keep stays as the new
// design's default, and the locked options are always there (readCompanySettings adds them back).
export function settingsFromOldDevice(data: OldDeviceExport): SettingsImport {
  const s: SettingsImport = { settings: clone(DEFAULT_COMPANY_SETTINGS), notes: [], warnings: [] };
  const columns = data.columns ?? {};
  const options = data.options ?? {};
  if (!data.options) s.notes.push("options: that computer kept none, so the defaults stay");
  if (!data.columns) s.notes.push("columns: that computer kept none, so the defaults stay");

  // Fields: the design's own, renamed or hidden as they were, then the team's own columns.
  const ownChoices = new Set<string>();
  for (const group of GROUPS) {
    const table = TABLE_OF[group];
    const old = Array.isArray(columns[table]) ? columns[table]! : [];
    const fields = s.settings.fields[group];
    for (const f of fields) {
      const col = old.find((c) => c?.key === f.key);
      if (!col) continue;
      const label = typeof col.label === "string" ? col.label.trim() : "";
      if (label && label !== OLD_BUILTIN_LABELS[table][f.key] && !fieldNameTaken(fields, label, f.key)) {
        s.notes.push(`${group}: "${f.label}" is called "${label}", as on that computer`);
        f.label = label;
      }
      if (col.visible === false && f.shown) {
        s.notes.push(`${group}: "${f.label}" is hidden, as on that computer`);
        f.shown = false;
      }
    }
    for (const col of old) {
      if (!col?.custom || typeof col.key !== "string" || fields.some((f) => f.key === col.key)) continue;
      const type = TYPE_OF[col.type];
      const label = typeof col.label === "string" ? col.label.trim() : "";
      if (!type || !label) {
        s.warnings.push(`${group}: own column ${col.key} (${col.type}, "${label}") can't be a field here, so it's left out`);
        continue;
      }
      const unique = uniqueLabel(fields, label);
      fields.push({ key: col.key, label: unique, type, shown: col.visible !== false, own: true });
      if (type === "choice") ownChoices.add(col.key);
      s.notes.push(`${group}: own field "${unique}" (${type}${col.visible === false ? ", hidden" : ""})`);
    }
  }

  // Options: the built-in choice fields, and the team's own choice fields.
  for (const [field, list] of Object.entries(options)) {
    if (!Array.isArray(list)) continue;
    if (field in DEFAULT_COMPANY_SETTINGS.options || ownChoices.has(field)) s.settings.options[field] = importOptions(field, list, s);
    else if (list.length) s.notes.push(`options for "${field}" left out: no field uses them`);
  }
  for (const key of ownChoices) s.settings.options[key] ??= [];

  for (const { field, name } of LOCKED_OPTIONS) {
    if (data.options?.[field] && !s.settings.options[field]?.some((o) => o.name === name)) {
      s.warnings.push(`${field}: "${name}" isn't among that computer's options (renamed or removed there?). It comes back locked; companies using another name for it won't count as ${name}.`);
    }
  }

  s.settings = readCompanySettings(s.settings);
  return s;
}

/* ---------- Sectors ---------- */

export type PastClientDoc = { id: string; parentId?: string | null; sector?: string | null };

// Subsidiaries with no sector of their own take their parent's (D-016). Parents, subsidiaries with a sector and those
// whose parent has none (or is gone) are left as they are.
export function sectorBackfill(clients: PastClientDoc[]): { id: string; sector: string }[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out: { id: string; sector: string }[] = [];
  for (const c of clients) {
    if (!c.parentId || cleanSector(c.sector ?? "")) continue;
    const parentSector = cleanSector(byId.get(c.parentId)?.sector ?? "");
    if (parentSector) out.push({ id: c.id, sector: parentSector });
  }
  return out;
}

/* ---------- Report helpers ---------- */

// Values stored on companies that no option of their field has: they'd show as plain text after the import.
export function valuesWithoutOption(companies: Record<string, unknown>[], settings: CompanySettings): string[] {
  const choiceFields = new Set(Object.values(settings.fields).flatMap((list) => list.filter((f) => f.type === "choice").map((f) => f.key)));
  const out: string[] = [];
  for (const field of choiceFields) {
    const names = new Set((settings.options[field] ?? []).map((o) => o.name));
    const missing = new Map<string, number>();
    for (const c of companies) {
      const v = c[field];
      if (typeof v === "string" && v.trim() && !names.has(v)) missing.set(v, (missing.get(v) ?? 0) + 1);
    }
    for (const [v, n] of missing) out.push(`${field}: "${v}" on ${n} ${n === 1 ? "company" : "companies"} has no option`);
  }
  return out;
}

// What the stored record has that the import replaces: options and own fields that aren't in the import.
export function droppedByImport(stored: CompanySettings | null, next: CompanySettings): string[] {
  if (!stored) return [];
  const out: string[] = [];
  for (const [field, list] of Object.entries(stored.options)) {
    for (const o of list) if (!next.options[field]?.some((x) => x.name === o.name)) out.push(`${field}: option "${o.name}"`);
  }
  for (const g of GROUPS) {
    for (const f of stored.fields[g]) if (f.own && !next.fields[g].some((x) => x.key === f.key)) out.push(`${g}: own field "${f.label}"`);
  }
  return out;
}
