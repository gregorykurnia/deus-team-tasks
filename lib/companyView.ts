// What Companies shows (guide 6.5, 4.9, 5.6, 5.7): the view held in the address, the list it makes, the words for its
// filters, sort and empty states, and what each cell says. Pure; the screen only draws it. The address holds only the
// view's own params, so ?company= and ?task= pass.
import {
  COMPANY_GROUP_LABELS,
  COMPANY_GROUPS,
  companiesInGroup,
  defaultCompanySort,
  filterCompanies,
  matchesCompanySearch,
  sortCompanies,
  type CompanyGroup,
  type CompanySortDir,
  type ProductOption,
  type WhereToAct,
} from "./companies";
import type { PipelineEntry } from "./clientTypes";
import type { ChoiceOption, CompanyField, CompanySettings, OptionColour } from "./companySettings";
import { daysBetween, plural, shortDate, todayIso } from "./dates";
import { GONE_COLD_DAYS } from "./urgency";

export const PAGE_SIZE = 100;

export interface CompanyViewState {
  group: CompanyGroup;
  q: string;
  status: string | null; // an option name, or "-" for no status
  priority: string | null; // the same
  product: string | null; // a product's merged key
  act: WhereToAct | null; // Active only
  sort: string | null; // "company" or a field's key; null is the group's default
  dir: CompanySortDir | null;
}

export const DEFAULT_GROUP: CompanyGroup = "active";
export const VIEW_PARAMS = ["group", "q", "status", "priority", "product", "act", "sort", "dir"] as const;

const GROUP_SLUGS: Record<CompanyGroup, string> = {
  toApproach: "to-approach",
  active: "active",
  dealDone: "deal-done",
  noOrNotNow: "no-or-not-now",
};
const ACT_SLUGS: Record<WhereToAct, string> = {
  goneCold: "gone-cold",
  followUp: "follow-up",
  highPriority: "high-priority",
  targetClose: "target-close",
};
const fromSlug = <T extends string>(slugs: Record<T, string>, slug: string | null): T | null =>
  (Object.keys(slugs) as T[]).find((k) => slugs[k] === slug) ?? null;

export function parseCompanyView(params: URLSearchParams): CompanyViewState {
  const group = fromSlug(GROUP_SLUGS, params.get("group")) ?? DEFAULT_GROUP;
  const sort = params.get("sort") || null;
  const dir = params.get("dir");
  return {
    group,
    q: params.get("q") ?? "",
    status: params.get("status") || null,
    priority: params.get("priority") || null,
    product: params.get("product") || null,
    act: group === "active" ? fromSlug(ACT_SLUGS, params.get("act")) : null,
    sort,
    dir: sort && (dir === "asc" || dir === "desc") ? dir : null,
  };
}

// The view as address params, on top of the ones that aren't its own. Defaults stay out of the address.
export function viewParams(state: CompanyViewState, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(current);
  VIEW_PARAMS.forEach((key) => params.delete(key));
  const put = (key: string, value: string | null | undefined) => value && params.set(key, value);
  if (state.group !== DEFAULT_GROUP) put("group", GROUP_SLUGS[state.group]);
  put("q", state.q);
  put("status", state.status);
  put("priority", state.priority);
  put("product", state.product);
  if (state.group === "active" && state.act) put("act", ACT_SLUGS[state.act]);
  if (state.sort) {
    put("sort", state.sort);
    put("dir", state.dir ?? naturalDir(state.sort));
  }
  return params;
}

/* ---------- The group's fields ---------- */

// The fields a group has, whether or not its list shows them. Filters and sorts go by these.
export function groupFields(settings: CompanySettings, group: CompanyGroup): CompanyField[] {
  return settings.fields[group];
}

// What the list shows (C2): the fields switched on for the group, in their order.
export function shownFields(settings: CompanySettings, group: CompanyGroup): CompanyField[] {
  return settings.fields[group].filter((f) => f.shown);
}

const hasField = (fields: CompanyField[], key: string) => fields.some((f) => f.key === key);

// Status and Priority filters exist where the group has the field; Product too (guide 6.5).
export function availableFilters(fields: CompanyField[]): { status: boolean; priority: boolean; product: boolean } {
  return { status: hasField(fields, "status"), priority: hasField(fields, "priority"), product: hasField(fields, "product") };
}

/* ---------- Filters ---------- */

// The filters that count in this group: one for a field the group doesn't have is let go (the address may be older).
export function appliedFilters(state: CompanyViewState, fields: CompanyField[]) {
  const has = availableFilters(fields);
  return {
    search: state.q.trim() || undefined,
    status: has.status ? state.status : null,
    priority: has.priority ? state.priority : null,
    productKey: has.product ? state.product : null,
    whereToAct: state.group === "active" ? state.act : null,
  };
}

export function filtersOn(state: CompanyViewState, fields: CompanyField[]): boolean {
  const f = appliedFilters(state, fields);
  return !!(f.search || f.status || f.priority || f.productKey || f.whereToAct);
}

// Clear filters keeps the group and the sort, and drops the rest.
export function clearedFilters(state: CompanyViewState): CompanyViewState {
  return { ...state, q: "", status: null, priority: null, product: null, act: null };
}

// Filters that aren't the search: "Clear filters" rather than "Clear search" (guide 6.5).
export function narrowedBeyondSearch(state: CompanyViewState, fields: CompanyField[]): boolean {
  const f = appliedFilters(state, fields);
  return !!(f.status || f.priority || f.productKey || f.whereToAct);
}

// "-" is a company with no value, and its filter says "None".
export function filterValueLabel(value: string): string {
  return value === "-" ? "None" : value;
}

/* ---------- Sort ---------- */

function naturalDir(key: string): CompanySortDir {
  return key === "date" ? "desc" : "asc"; // the last action: most recent first
}

export interface SortChoice {
  key: string;
  label: string;
}

// The sort menu: the company's name, then every field the group has.
export function sortChoices(fields: CompanyField[]): SortChoice[] {
  return [{ key: "company", label: "Company" }, ...fields.map((f) => ({ key: f.key, label: f.label }))];
}

export function effectiveSort(state: CompanyViewState, fields: CompanyField[]): { key: string; dir: CompanySortDir } {
  if (state.sort && (state.sort === "company" || hasField(fields, state.sort))) {
    return { key: state.sort, dir: state.dir ?? naturalDir(state.sort) };
  }
  return defaultCompanySort(state.group);
}

// Direction labels are in words (guide 5.6): [ascending, descending].
export function directionLabels(key: string, field: CompanyField | undefined): [string, string] {
  if (key === "company") return ["A to Z", "Z to A"];
  if (key === "date") return ["Longest ago first", "Most recent first"];
  if (key === "priority") return ["High first", "Low first"];
  switch (field?.type) {
    case "date":
      return ["Earliest first", "Latest first"];
    case "number":
      return ["Smallest first", "Largest first"];
    case "choice":
      return ["In option order", "Reverse order"];
    default:
      return ["A to Z", "Z to A"];
  }
}

export function sortLabel(key: string, fields: CompanyField[]): string {
  return key === "company" ? "Company" : (fields.find((f) => f.key === key)?.label ?? key);
}

export function sortSummary(sort: { key: string; dir: CompanySortDir }, fields: CompanyField[]): string {
  const dirs = directionLabels(sort.key, fields.find((f) => f.key === sort.key));
  return `${sortLabel(sort.key, fields)}, ${dirs[sort.dir === "asc" ? 0 : 1].toLowerCase()}`;
}

// A column head sorts by its field; pressing the one in use turns the order round (guide 5.6).
export function sortedByHead(state: CompanyViewState, fields: CompanyField[], key: string): CompanyViewState {
  const now = effectiveSort(state, fields);
  const dir: CompanySortDir = now.key === key ? (now.dir === "asc" ? "desc" : "asc") : naturalDir(key);
  return { ...state, sort: key, dir };
}

/* ---------- The list ---------- */

export interface CompanyListing {
  scoped: PipelineEntry[]; // everyone in the group
  sorted: PipelineEntry[]; // narrowed, then in order
  elsewhere: { group: CompanyGroup; count: number }[]; // other groups the search finds something in
}

export function listCompanies(
  companies: PipelineEntry[],
  state: CompanyViewState,
  settings: CompanySettings,
  today: string = todayIso()
): CompanyListing {
  const fields = groupFields(settings, state.group);
  const scoped = companiesInGroup(companies, state.group);
  const narrowed = filterCompanies(scoped, appliedFilters(state, fields), today);
  const sort = effectiveSort(state, fields);
  const field = fields.find((f) => f.key === sort.key);
  const order = field?.type === "choice" && sort.key !== "priority" ? settings.options[sort.key]?.map((o) => o.name) : undefined;
  const sorted = sortCompanies(narrowed, sort.key, sort.dir, { numeric: field?.type === "number", today, order });
  const q = state.q.trim();
  const elsewhere = q
    ? COMPANY_GROUPS.filter((g) => g !== state.group)
        .map((g) => ({ group: g, count: companiesInGroup(companies, g).filter((c) => matchesCompanySearch(c, q)).length }))
        .filter((x) => x.count > 0)
    : [];
  return { scoped, sorted, elsewhere };
}

// The product filter's words: the spelling most companies use, or the key if nobody uses it any more.
export function productLabel(key: string, choices: ProductOption[]): string {
  return choices.find((p) => p.key === key)?.label ?? key;
}

/* ---------- Where to act (guide 4.10, B6) ---------- */

export interface ActCard {
  id: WhereToAct;
  label: string;
  hint: string; // on hover
  icon: "snow" | "hourglass" | "flag" | "clock";
  tone: "red" | "amber" | "violet" | "blue";
}

export const ACT_CARDS: ActCard[] = [
  { id: "goneCold", label: "Gone cold", hint: `No action for ${GONE_COLD_DAYS} days or more`, icon: "snow", tone: "red" },
  { id: "followUp", label: "Waiting on our follow-up", hint: "Status is Follow-up due", icon: "hourglass", tone: "amber" },
  { id: "highPriority", label: "High priority", hint: "Priority is High", icon: "flag", tone: "violet" },
  { id: "targetClose", label: "Target date close or missed", hint: "Within 3 days, or already passed", icon: "clock", tone: "blue" },
];

/* ---------- Group tiles (guide 4.10) ---------- */

export interface GroupLook {
  id: CompanyGroup;
  label: string;
  blurb: string;
  icon: "flag" | "bolt" | "done" | "pause";
  noun: [string, string];
}

export const GROUP_LOOKS: GroupLook[] = [
  { id: "toApproach", label: COMPANY_GROUP_LABELS.toApproach, blurb: "Not contacted yet", icon: "flag", noun: ["company to approach", "companies to approach"] },
  { id: "active", label: COMPANY_GROUP_LABELS.active, blurb: "Prospects we’re working", icon: "bolt", noun: ["active prospect", "active prospects"] },
  { id: "dealDone", label: COMPANY_GROUP_LABELS.dealDone, blurb: "Our clients", icon: "done", noun: ["client", "clients"] },
  { id: "noOrNotNow", label: COMPANY_GROUP_LABELS.noOrNotNow, blurb: "On hold or rejected", icon: "pause", noun: ["company on hold or rejected", "companies on hold or rejected"] },
];

export const lookOf = (group: CompanyGroup): GroupLook => GROUP_LOOKS.find((g) => g.id === group)!;

export function countNoun(group: CompanyGroup, n: number): string {
  const [one, many] = lookOf(group).noun;
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/* ---------- Empty states (guide 4.15, 6.5) ---------- */

export type CompanyEmpty = "nothingYet" | "groupEmpty" | "nothingMatches";

export function emptyCase(scopedCount: number, totalCount: number): CompanyEmpty {
  if (totalCount === 0) return "nothingYet";
  return scopedCount === 0 ? "groupEmpty" : "nothingMatches";
}

export const GROUP_EMPTY_COPY: Record<CompanyGroup, [string, string]> = {
  toApproach: ["Nothing to approach", "Companies you plan to contact go here, with a planned outreach date, so the backlog of leads is in one place."],
  active: ["No active prospects", "Companies you’re working with go here. Move one in from To approach once you’ve made contact."],
  dealDone: ["No deals done yet", "When a deal is done, the company moves here and its tasks count as client work."],
  noOrNotNow: ["Nobody has said no or not now", "Companies that say no or not now go here with the reason, so the team can learn from it and revisit later."],
};

// What Search looks at in this group, for the nothing-matches line.
export function searchedWords(group: CompanyGroup): string {
  const base = "the name, contact person, source and products";
  if (group === "toApproach") return `${base}, industry and notes`;
  if (group === "noOrNotNow") return `${base}, and the reason`;
  return base;
}

/* ---------- Cells (guide 4.9) ---------- */

export type CellTone = "plain" | "amber" | "red";

export type Cell =
  | { kind: "empty" }
  | { kind: "choice"; label: string; colour: OptionColour }
  | { kind: "date"; label: string; tone: CellTone; title: string; pill: boolean } // pill: a target date or planned outreach
  | { kind: "number"; label: string }
  | { kind: "text"; label: string };

function fullDate(iso: string): string {
  return shortDate(iso, "0000-01-01"); // always with the year
}

// The last action in words: "Today", "Yesterday", "12 days ago". Amber from 7 days and red from 14 in Active and Deal done.
function lastActionCell(iso: string, group: CompanyGroup, today: string): Cell {
  const n = daysBetween(iso, today);
  const label = n === 0 ? "Today" : n === 1 ? "Yesterday" : n < 0 ? shortDate(iso, today) : `${n.toLocaleString("en-GB")} days ago`;
  const warm = group === "active" || group === "dealDone";
  const tone: CellTone = warm && n >= GONE_COLD_DAYS ? "red" : warm && n >= 7 ? "amber" : "plain";
  return { kind: "date", label, tone, title: `Last action ${fullDate(iso)}${tone === "red" ? ". Gone cold" : ""}`, pill: false };
}

// A target date in words, the same tones as a task's deadline; a missed planned outreach is amber, not red.
function pillCell(iso: string, outreach: boolean, today: string): Cell {
  const n = daysBetween(today, iso);
  let label: string;
  let tone: CellTone;
  if (n < 0) {
    label = outreach ? `${plural(-n, "day")} overdue` : `Missed by ${plural(-n, "day")}`;
    tone = outreach ? "amber" : "red";
  } else if (n === 0) [label, tone] = ["Today", "amber"];
  else if (n === 1) [label, tone] = ["Tomorrow", "amber"];
  else if (n <= 3) [label, tone] = [`In ${n} days`, "amber"];
  else if (n <= 30) [label, tone] = [`In ${n} days`, "plain"];
  else [label, tone] = [shortDate(iso, today), "plain"];
  return { kind: "date", label, tone, title: `${outreach ? "Planned outreach" : "Target date"} ${fullDate(iso)}`, pill: true };
}

export function optionOf(settings: CompanySettings, key: string, name: string): ChoiceOption | undefined {
  return settings.options[key]?.find((o) => o.name === name);
}

export function cellOf(c: PipelineEntry, field: CompanyField, group: CompanyGroup, settings: CompanySettings, today: string = todayIso()): Cell {
  const v = c[field.key];
  if (v === undefined || v === null || v === "") return { kind: "empty" };
  const text = String(v);
  switch (field.type) {
    case "choice":
      // A value that isn't one of the options any more still shows, in grey.
      return { kind: "choice", label: text, colour: optionOf(settings, field.key, text)?.colour ?? "slate" };
    case "date":
      if (field.key === "date") return lastActionCell(text, group, today);
      if (field.key === "target" || field.key === "reach") return pillCell(text, field.key === "reach", today);
      return { kind: "date", label: fullDate(text), tone: "plain", title: fullDate(text), pill: false };
    case "number": {
      const n = parseFloat(text);
      return { kind: "number", label: isNaN(n) ? text : n.toLocaleString("en-GB") };
    }
    default:
      return { kind: "text", label: text };
  }
}

// What a cell says in words, for its label: "Status: To Follow Up".
export function cellWords(cell: Cell): string {
  return cell.kind === "empty" ? "empty" : cell.label;
}

// The line under a company's name: the industry in To approach, the contact person elsewhere.
export function subline(c: PipelineEntry, group: CompanyGroup): string {
  return ((group === "toApproach" ? c.industry : c.pic) ?? "").toString().trim();
}

/* ---------- The grid (guide 4.9, 5.14) ---------- */

const COLUMN_WIDTH: Record<CompanyField["type"], { css: string; min: number }> = {
  choice: { css: "150px", min: 150 },
  date: { css: "150px", min: 150 },
  text: { css: "minmax(150px, 1fr)", min: 150 },
  long: { css: "minmax(220px, 1.6fr)", min: 220 },
  number: { css: "120px", min: 120 },
};

// The columns: the pinned name, then each shown field, then the row menu's.
export function gridOf(fields: CompanyField[]): { columns: string; minWidth: number } {
  return {
    columns: ["minmax(230px, 1.5fr)", ...fields.map((f) => COLUMN_WIDTH[f.type].css), "40px"].join(" "),
    minWidth: 230 + fields.reduce((n, f) => n + COLUMN_WIDTH[f.type].min, 0) + 40 + 14 * (fields.length + 1) + 28,
  };
}
