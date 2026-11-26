// Company settings shared by the app and chat previews, with no Firestore or React dependencies.
import { DEAL_DONE_STATUS, FOLLOW_UP_STATUS, GBA_TRIALS, HIGH_PRIORITY, NO_ANSWER, NOT_NOW_ANSWER, TEAM_PIC, type CompanyGroup } from "./companies";
import { TASK_TYPES } from "./types";

/* ---------- Shape ---------- */

// The nine option colours, each a pair of tokens: --opt-<name>-bg and --opt-<name>.
export const OPTION_COLOURS = ["blue", "sky", "teal", "green", "amber", "red", "violet", "pink", "slate"] as const;
export type OptionColour = (typeof OPTION_COLOURS)[number];

// The options the groups, where to act and follow-up tasks depend on keep their names and can be recoloured or moved.
// Deal done and Follow-up due are the guide's (6.5). High, Not now and No follow the same rule (R1, gap N9, provisional):
// where to act counts High, a follow-up task takes its priority from it, and the two answers tell on hold from rejected.
export type LockedRole = "dealDone" | "followUp" | "highPriority" | "notNow" | "no";

export interface ChoiceOption {
  name: string; // the value stored on companies or tasks
  colour: OptionColour;
  role?: LockedRole;
}

// "choices" picks several of a field's options, stored in option order as one comma-separated value (GBA trials, N22).
// "person" picks one team member, stored by the name tasks use for them (the team's PIC).
export type FieldType = "text" | "long" | "number" | "date" | "choice" | "choices" | "person";

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

export const companyOption = (name: string, colour: OptionColour, role?: LockedRole): ChoiceOption => (role ? { name, colour, role } : { name, colour });

// Option names are stored as values on companies or tasks.
const DEFAULT_OPTIONS: Record<string, ChoiceOption[]> = {
  taskType: TASK_TYPES.map((name) => companyOption(name, "violet")),
  status: [
    companyOption(DEAL_DONE_STATUS, "green", "dealDone"),
    companyOption(FOLLOW_UP_STATUS, "amber", "followUp"),
    companyOption("Waiting For Our Actions", "blue"),
    companyOption("Scheduling In Progress", "violet"),
    companyOption("Meeting Soon", "teal"),
    companyOption("Raw List", "slate"),
    companyOption("Drop", "red"),
  ],
  type: [companyOption("Client", "blue"), companyOption("Partner", "green"), companyOption("Individual Partner", "violet")],
  priority: [companyOption(HIGH_PRIORITY, "red", "highPriority"), companyOption("Medium", "amber"), companyOption("Low", "slate")],
  answer: [companyOption(NOT_NOW_ANSWER, "amber", "notNow"), companyOption(NO_ANSWER, "slate", "no")],
  [GBA_TRIALS]: [companyOption("Personality", "violet"), companyOption("Cognitive", "blue"), companyOption("Neuroscience", "teal"), companyOption("Simulation", "amber")],
};

// Each locked option: its field, its stored name, the colour it starts with, and why it's locked.
export const LOCKED_OPTIONS: { field: string; role: LockedRole; name: string; colour: OptionColour; reason: string }[] = [
  { field: "status", role: "dealDone", name: DEAL_DONE_STATUS, colour: "green", reason: "Moves the company to Active clients and partners" },
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
    field(TEAM_PIC, "PIC", "person", true),
    field("reach", "Planned outreach", "date", true),
    field("priority", "Priority", "choice", true),
    field("type", "Type", "choice", true),
    field("industry", "Industry", "text", true),
    field("sourcing", "How we found it", "text", true),
    field("notes", "Notes", "long", true),
    field(GBA_TRIALS, "GBA trials", "choices", false),
  ],
  active: [
    field(TEAM_PIC, "PIC", "person", true),
    field("status", "Status", "choice", true),
    field("priority", "Priority", "choice", true),
    field("date", "Last action", "date", true),
    field("target", "Target date", "date", true),
    field("product", "Products", "text", true),
    field(GBA_TRIALS, "GBA trials", "choices", true),
    field("notes", "Next actions", "long", true),
    field("pic", "Contact person", "text", false),
    field("type", "Type", "choice", false),
    field("trial", "Trial", "text", false),
    field("industry", "Industry", "text", false),
    field("sourcing", "How we found it", "text", false),
  ],
  dealDone: [
    field(TEAM_PIC, "PIC", "person", false),
    field("date", "Last action", "date", true),
    field("target", "Target date", "date", true),
    field("product", "Products", "text", true),
    field("notes", "Next actions", "long", true),
    field("type", "Type", "choice", true),
    field("pic", "Contact person", "text", false),
    field(GBA_TRIALS, "GBA trials", "choices", false),
    field("industry", "Industry", "text", false),
    field("sourcing", "How we found it", "text", false),
  ],
  noOrNotNow: [
    field(TEAM_PIC, "PIC", "person", true),
    field("answer", "Answer", "choice", true),
    field("reason", "Reason", "long", true),
    field("product", "Products", "text", true),
    field("type", "Type", "choice", true),
    field("date", "Last action", "date", true),
    field("pic", "Contact person", "text", false),
    field(GBA_TRIALS, "GBA trials", "choices", false),
  ],
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = { options: DEFAULT_OPTIONS, fields: DEFAULT_FIELDS };

const GROUPS: CompanyGroup[] = ["active", "dealDone", "noOrNotNow", "toApproach"];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function isColour(v: unknown): v is OptionColour {
  return typeof v === "string" && (OPTION_COLOURS as readonly string[]).includes(v);
}

// Reads the stored record, falling back to the defaults for anything missing.
// Built-in fields missing from a group come back where the defaults put them (after
// the built-in field before them, or first), and the locked options always exist.
export function readCompanySettings(data: unknown): CompanySettings {
  const stored = (data ?? {}) as Partial<CompanySettings>;
  const settings = clone(DEFAULT_COMPANY_SETTINGS);
  if (stored.options && typeof stored.options === "object") {
    for (const [key, list] of Object.entries(stored.options)) {
      if (!Array.isArray(list)) continue;
      settings.options[key] = list
        .filter((o) => o && typeof o.name === "string" && o.name.trim())
        .map((o) => companyOption(o.name, isColour(o.colour) ? o.colour : "slate")); // roles go by name, below
    }
  }
  for (const { field: key, role, name, colour } of LOCKED_OPTIONS) {
    const list = (settings.options[key] ??= []);
    const existing = list.find((o) => o.name === name);
    if (existing) existing.role = role;
    else list.unshift(companyOption(name, colour, role));
  }
  if (stored.fields && typeof stored.fields === "object") {
    for (const g of GROUPS) {
      const list = stored.fields[g];
      if (!Array.isArray(list)) continue;
      const kept = list.filter((f) => f && typeof f.key === "string" && typeof f.label === "string");
      const merged = kept.map((f) => ({ ...f, shown: f.shown !== false, own: !!f.own }));
      DEFAULT_FIELDS[g].forEach((d, i) => {
        if (merged.some((f) => f.key === d.key)) return;
        const before = DEFAULT_FIELDS[g].slice(0, i).reverse().find((p) => merged.some((f) => f.key === p.key));
        const added = clone(d);
        // The team may already call another field "PIC" (the old app's name for the contact person): two columns never share a name.
        if (d.key === TEAM_PIC && merged.some((f) => f.label.trim().toLowerCase() === d.label.toLowerCase())) added.label = "Team PIC";
        merged.splice(before ? merged.findIndex((f) => f.key === before.key) + 1 : 0, 0, added);
      });
      settings.fields[g] = merged;
    }
  }
  return settings;
}
