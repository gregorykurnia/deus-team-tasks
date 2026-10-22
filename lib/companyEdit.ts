// Changing companies (guide 4.9, 5.3, 5.4, 5.10, 6.5): what the quick editors offer, what a change says, what a move
// carries over and asks for, what the record warns about, and what a deletion leaves behind. Pure; the writes are in
// companyWrites.ts and the screen draws the rest.
import type { PipelineEntry } from "./clientTypes";
import { COMPANY_GROUP_LABELS, COMPANY_GROUPS, companyGroup, DEAL_DONE_STATUS, isCompanyParked, NOT_NOW_ANSWER, type CompanyGroup } from "./companies";
import type { ChoiceOption, CompanyField, CompanySettings } from "./companySettings";
import { addDays, daysBetween, plural, shortDate, todayIso } from "./dates";
import { GONE_COLD_DAYS } from "./urgency";

export type FieldValue = string | number | undefined;
export type CompanyPatch = Partial<Omit<PipelineEntry, "id">>;

/* ---------- Values ---------- */

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";

// A value in words, as a label or a carried-over chip says it: dates in full with the year.
export function fieldText(c: PipelineEntry, field: Pick<CompanyField, "key" | "type">): string {
  const v = c[field.key];
  if (isEmpty(v)) return "";
  if (field.type === "date" && typeof v === "string") return shortDate(v, "0000-01-01");
  if (field.type === "number") {
    const n = parseFloat(String(v));
    return isNaN(n) ? String(v) : n.toLocaleString("en-GB");
  }
  return String(v);
}

// What a text, number or date editor saves: trimmed, and nothing for an empty field (which clears it).
export function parseValue(field: Pick<CompanyField, "type">, raw: string): FieldValue {
  const clean = raw.trim();
  if (!clean) return undefined;
  if (field.type === "number") {
    const n = Number(clean.replace(/,/g, ""));
    return Number.isFinite(n) ? n : clean;
  }
  return clean;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return (isEmpty(a) ? "" : String(a)) === (isEmpty(b) ? "" : String(b));
}

// The last action and the target date are kept in step with the company's open tasks (B12).
export const KEPT_IN_STEP = ["date", "target"];
export const isKeptInStep = (key: string) => KEPT_IN_STEP.includes(key);

export interface QuickPick {
  label: string;
  iso: string;
}

// A date's quick picks: the last action looks back (Today, Yesterday), every other date looks ahead.
export function quickPicks(key: string, today: string = todayIso()): QuickPick[] {
  if (key === "date") {
    return [
      { label: "Today", iso: today },
      { label: "Yesterday", iso: addDays(today, -1) },
    ];
  }
  return [
    { label: "Today", iso: today },
    { label: "Tomorrow", iso: addDays(today, 1) },
    { label: "In a week", iso: addDays(today, 7) },
  ];
}

// Choosing Deal done as an Active company's status moves it to Deal done (5.10).
export function movesToDealDone(c: PipelineEntry, key: string, value: FieldValue): boolean {
  return key === "status" && value === DEAL_DONE_STATUS && companyGroup(c) === "active";
}

// "Status updated", "Target date cleared. 2 linked tasks now match".
export function changeMessage(label: string, cleared: boolean, tasksChanged: number): string {
  const lead = `${label} ${cleared ? "cleared" : "updated"}`;
  return tasksChanged ? `${lead}. ${plural(tasksChanged, "linked task")} now ${tasksChanged === 1 ? "matches" : "match"}` : lead;
}

export const hasField = (fields: CompanyField[], key: string) => fields.some((f) => f.key === key);

/* ---------- Moving between groups (B5, 5.10) ---------- */

export function moveTargets(from: CompanyGroup): CompanyGroup[] {
  return COMPANY_GROUPS.filter((g) => g !== from);
}

// Where a company usually goes next: To approach to Active, Active to Deal done, the others back to Active.
export function defaultMoveTarget(from: CompanyGroup): CompanyGroup {
  return from === "toApproach" ? "active" : from === "active" ? "dealDone" : "active";
}

// The choice options a move offers: Deal done is a group of its own, so it isn't a status to pick.
export function moveChoices(settings: CompanySettings, key: string): ChoiceOption[] {
  return (settings.options[key] ?? []).filter((o) => o.role !== "dealDone");
}

const MEETING_SOON = "Meeting Soon";

// What the move dialog fills in before anyone types: an Active company needs a status (the first contact was made, so
// coming from To approach the last action is today), and No or not now starts on "Not now".
export function moveDefaults(c: PipelineEntry, to: CompanyGroup, settings: CompanySettings, today: string = todayIso()): CompanyPatch {
  const from = companyGroup(c);
  const d: CompanyPatch = {};
  if (to === "active") {
    if ((!c.status || c.status === DEAL_DONE_STATUS) && moveChoices(settings, "status").some((o) => o.name === MEETING_SOON)) d.status = MEETING_SOON;
    if (from === "toApproach") d.date = today;
  }
  if (to === "noOrNotNow" && !c.answer && (settings.options.answer ?? []).some((o) => o.name === NOT_NOW_ANSWER)) d.answer = NOT_NOW_ANSWER;
  return d;
}

export interface MovePlan {
  carried: { field: CompanyField; text: string }[]; // what's already known, as grey chips
  toFill: CompanyField[]; // what the new group's list shows that isn't known yet, plus anything filled in for it
  values: CompanyPatch; // what the fields to fill start with
  kindSwitch: number; // open tasks that switch between prospect and client work
}

// What a move carries over and what it asks for (5.10). A value counts as carried when the new group has the field, the
// old group had it too, and it isn't empty.
export function movePlan(c: PipelineEntry, to: CompanyGroup, settings: CompanySettings, openTasks: number, today: string = todayIso()): MovePlan {
  const from = companyGroup(c);
  const before = settings.fields[from].map((f) => f.key);
  const defaults = moveDefaults(c, to, settings, today);
  const target = settings.fields[to];
  const carried = target.filter((f) => before.includes(f.key) && !isEmpty(c[f.key]) && !(f.key in defaults));
  const toFill = target.filter((f) => !carried.includes(f) && (f.shown || f.key in defaults));
  const values: CompanyPatch = {};
  for (const f of toFill) {
    const own = c[f.key];
    values[f.key] = f.key in defaults ? defaults[f.key] : f.key === "status" && own === DEAL_DONE_STATUS ? undefined : own;
  }
  return {
    carried: carried.map((field) => ({ field, text: fieldText(c, field) })),
    toFill,
    values,
    kindSwitch: (from === "dealDone") !== (to === "dealDone") ? openTasks : 0,
  };
}

// The fields the dialog changes: only the ones that differ from what's stored.
export function movePatch(c: PipelineEntry, values: CompanyPatch): CompanyPatch {
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => !sameValue(c[k], v)).map(([k, v]) => [k, isEmpty(v) ? undefined : v]));
}

export function kindSwitchNote(n: number, to: CompanyGroup, done = false): string {
  if (!n) return "";
  const what = to === "dealDone" ? "as client work" : "as prospect work again";
  const verb = done ? (n === 1 ? "now counts" : "now count") : "will count";
  return `Its ${plural(n, "open task")} ${verb} ${what}.`;
}

// "Deal done. Halcyon Logistics moved to Deal done. Its 2 open tasks now count as client work."
export function moveMessage(name: string, to: CompanyGroup, kindSwitch: number): string {
  const note = kindSwitchNote(kindSwitch, to, true);
  return `${to === "dealDone" ? "Deal done. " : ""}${name} moved to ${COMPANY_GROUP_LABELS[to]}.${note ? ` ${note}` : ""}`;
}

/* ---------- The record (6.5) ---------- */

// The record's sections, by field key; fields the team added go under "Added by the team".
const SECTIONS: [string, string[]][] = [
  ["Where we stand", ["status", "answer", "priority", "product", "reason"]],
  ["What’s happening", ["date", "target", "reach", "notes", "trial"]],
  ["Who they are", ["pic", "type", "industry", "sourcing"]],
];

export interface RecordSection {
  title: string;
  fields: CompanyField[];
  own?: boolean;
}

// Every field the group has, shown in the list or not, in sections. Sections with nothing in them go, except the team's own.
export function recordSections(fields: CompanyField[]): RecordSection[] {
  const placed = new Set<string>();
  const sections: RecordSection[] = SECTIONS.map(([title, keys]) => {
    const list = keys.flatMap((k) => fields.filter((f) => f.key === k && !f.own));
    list.forEach((f) => placed.add(f.key));
    return { title, fields: list };
  }).filter((s) => s.fields.length > 0);
  sections.push({ title: "Added by the team", fields: fields.filter((f) => !placed.has(f.key)), own: true });
  return sections;
}

export interface RecordAlert {
  tone: "error" | "warning";
  title: string;
  text: string;
  icon?: "snow" | "flag"; // gone cold and a missed outreach have their own icons, as on their tiles
}

// What needs doing about this company, at the top of its record (guide 5.1).
export function recordAlerts(c: PipelineEntry, fields: CompanyField[], today: string = todayIso()): RecordAlert[] {
  const group = companyGroup(c);
  const alerts: RecordAlert[] = [];
  if (isCompanyParked(c, today)) return alerts; // a parked company shows no urgency, only that it's parked (N20)
  if (group === "active" && c.date) {
    const idle = daysBetween(c.date, today);
    if (idle >= GONE_COLD_DAYS) alerts.push({ tone: "error", icon: "snow", title: "Gone cold.", text: `No action for ${plural(idle, "day")}.` });
  }
  if (hasField(fields, "target") && c.target) {
    const late = daysBetween(c.target, today);
    if (late > 0) alerts.push({ tone: "warning", title: `Target date missed ${plural(late, "day")} ago.`, text: "Set a new one, or log what happened." });
  }
  if (group === "toApproach" && c.reach) {
    const late = daysBetween(c.reach, today);
    if (late > 0) alerts.push({ tone: "warning", icon: "flag", title: `Outreach was planned ${plural(late, "day")} ago.`, text: "Reach out, or plan a new date." });
  }
  return alerts;
}

// "The last action and target date stay in step with these 3 tasks." Only the dates the group has.
export function keptInStepNote(fields: CompanyField[], openTasks: number): string | null {
  const has = (k: string) => hasField(fields, k);
  if (!openTasks || (!has("date") && !has("target"))) return null;
  const what = has("date") && has("target") ? "The last action and target date stay" : has("date") ? "The last action stays" : "The target date stays";
  const which = openTasks === 1 ? "this task" : `these ${openTasks.toLocaleString("en-GB")} tasks`;
  return `${what} in step with ${which}. Change either side and the other follows.`;
}

/* ---------- Deleting (B14, 5.4) ---------- */

// What the confirmation says happens to the company's tasks and notes.
export function deleteWording(tasks: { total: number; open: number }, hasNotes: boolean): string {
  const parts = ["It will be removed for everyone on the team."];
  if (tasks.total) {
    const open = tasks.open && tasks.open !== tasks.total ? ` (${tasks.open.toLocaleString("en-GB")} open)` : "";
    parts.push(`Its ${plural(tasks.total, "task")}${open} ${tasks.total === 1 ? "stays" : "stay"}, as internal work.`);
  }
  if (hasNotes) parts.push("Its qualification notes stay too, without a company.");
  return parts.join(" ");
}

// A delete that stopped part way (N13), worded as the task screens word a bulk change that only partly saved: how far it
// got and what didn't. The company is still there, and pressing Delete again finishes it.
export function partlyDeleteWording(name: string, changed: number, left: number): string {
  const num = (n: number) => n.toLocaleString("en-GB");
  const total = changed + left;
  return `${num(changed)} of ${plural(total, "task")} of ${name} became internal work. Couldn’t change the other ${num(left)}, so ${name} wasn’t deleted. Check your connection and press Delete again to finish.`;
}

type SourceState = { loading: boolean; fromCache: boolean; error: Error | null };

// Why Delete company can't be pressed yet, or null when it can. Deleting turns every task of the company into internal
// work and its notes into notes not tracked yet, so both have to be as the server has them, or some would be missed.
export function deleteBlocked(tasks: SourceState, notes: SourceState, online: boolean): string | null {
  if (!online) return "Deleting needs a connection.";
  if (tasks.error || notes.error) {
    const what = tasks.error && notes.error ? "tasks and qualification notes" : tasks.error ? "tasks" : "qualification notes";
    return `Couldn’t load its ${what}, so it can’t be deleted yet. Reload the page.`;
  }
  if (tasks.loading || tasks.fromCache || notes.loading || notes.fromCache) return "Its tasks and qualification notes are still loading.";
  return null;
}

/* ---------- New company (B1, B3, 5.5) ---------- */

// The fields the new company sheet asks for: what the group's list shows, and the contact person.
export function newCompanyFields(settings: CompanySettings, group: CompanyGroup): CompanyField[] {
  const shown = settings.fields[group].filter((f) => f.shown || f.key === "pic");
  return [...shown.filter((f) => f.key === "pic"), ...shown.filter((f) => f.key !== "pic")]; // the contact comes first, as in the prototype
}

export const NAME_MISSING = "Add the company’s name. It’s the only thing needed.";
export const RENAME_MISSING = "A company needs a name.";

// The highest id in use, so a new company's id is always above it.
export function maxCompanyId(companies: PipelineEntry[]): number {
  return companies.reduce((n, c) => Math.max(n, c.id), 0);
}
