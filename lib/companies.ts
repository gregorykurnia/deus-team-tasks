// Companies: their four groups (B2), parking in Active (N20), search, filters, sorting, where to act (B6)
// and the follow-up task (B11). Pure functions; writes are in companyWrites.ts.
import { todayIso } from "./dates";
import { isParked } from "./parking";
import { idleDays, isGoneCold, isTargetClose } from "./urgency";
import type { PipelineEntry, TableKey } from "./clientTypes";
import type { NewTask } from "./types";

export type CompanyGroup = "toApproach" | "active" | "dealDone" | "noOrNotNow";

export const COMPANY_GROUPS: CompanyGroup[] = ["active", "dealDone", "noOrNotNow", "toApproach"];

export const COMPANY_GROUP_LABELS: Record<CompanyGroup, string> = {
  toApproach: "To approach",
  active: "Active",
  dealDone: "Active clients and partners",
  noOrNotNow: "No or not now",
};

// The stored statuses the groups and figures depend on (Q3). They can be
// recoloured but not renamed or removed (C3).
export const DEAL_DONE_STATUS = "Client / Partner Done Deal";
export const FOLLOW_UP_STATUS = "To Follow Up";

// The priority Where to act counts, and a follow-up task takes on.
export const HIGH_PRIORITY = "High";

// The Discover GBA modules a prospect has trialled (N22): a field that picks several of its options.
export const GBA_TRIALS = "gbaTrials";

// "No or not now" tells on hold from rejected (D-011).
export const NOT_NOW_ANSWER = "Not now";
export const NO_ANSWER = "No";
export const ANSWERS = [NOT_NOW_ANSWER, NO_ANSWER] as const;
export type Answer = (typeof ANSWERS)[number];

export function companyGroup(c: Pick<PipelineEntry, "_raw" | "_hold" | "status">): CompanyGroup {
  if (c._raw) return "toApproach";
  if (c._hold) return "noOrNotNow";
  return c.status === DEAL_DONE_STATUS ? "dealDone" : "active";
}

// How the data stores each group: the old app's three tables.
export function tableKeyOf(group: CompanyGroup): TableKey {
  return group === "toApproach" ? "raw" : group === "noOrNotNow" ? "hold" : "main";
}

export function groupFlags(group: CompanyGroup): { _raw: boolean; _hold: boolean } {
  return { _raw: group === "toApproach", _hold: group === "noOrNotNow" };
}

export function companiesInGroup(companies: PipelineEntry[], group: CompanyGroup): PipelineEntry[] {
  return companies.filter((c) => companyGroup(c) === group);
}

export function groupSizes(companies: PipelineEntry[]): Record<CompanyGroup, number> {
  const sizes: Record<CompanyGroup, number> = { toApproach: 0, active: 0, dealDone: 0, noOrNotNow: 0 };
  for (const c of companies) sizes[companyGroup(c)]++;
  return sizes;
}

/* ---------- Parked (N20) ---------- */

// An Active company someone has set aside: it stays Active, but leaves Where to act and never shows as gone cold or
// late, until it's brought back or the day it was parked until comes round. Moving it to another group ends it.
export function isCompanyParked(c: PipelineEntry, today: string = todayIso()): boolean {
  return companyGroup(c) === "active" && isParked({ parkedAt: c.parkedAt, parkedUntil: c.parkedUntil }, today);
}

/* ---------- Products (D-012): free text, comma separated ---------- */

export function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function productsOf(c: Pick<PipelineEntry, "product">): string[] {
  return (c.product ?? "")
    .split(",")
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

export interface ProductOption {
  key: string;
  label: string; // the spelling most companies use
  count: number;
}

// The products written in a group, most used first, with spellings merged
// ignoring case and spaces.
export function productOptions(companies: PipelineEntry[]): ProductOption[] {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const c of companies) {
    for (const p of new Set(productsOf(c))) {
      const key = normalizeKey(p);
      const entry = byKey.get(key) ?? { count: 0, spellings: new Map() };
      entry.count++;
      entry.spellings.set(p, (entry.spellings.get(p) ?? 0) + 1);
      byKey.set(key, entry);
    }
  }
  return [...byKey]
    .map(([key, { count, spellings }]) => ({
      key,
      count,
      label: [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function hasProduct(c: Pick<PipelineEntry, "product">, productKey: string): boolean {
  return productsOf(c).some((p) => normalizeKey(p) === productKey);
}

/* ---------- Several options in one value (N22) ---------- */

// The options a "choices" value holds: "Personality, Cognitive" is two.
export function choicesOf(value: unknown): string[] {
  return typeof value === "string" ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
}

// A value with one option added or taken away, in the options' order (ones no longer among them last), or nothing.
export function toggleChoice(value: unknown, name: string, order: string[]): string | undefined {
  const now = choicesOf(value);
  const next = now.includes(name) ? now.filter((v) => v !== name) : [...now, name];
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  return next.sort((a, b) => rank(a) - rank(b)).join(", ") || undefined;
}

/* ---------- Find and narrow (B8) ---------- */

const SEARCHED: Record<CompanyGroup, (keyof PipelineEntry)[]> = {
  toApproach: ["company", "pic", "sourcing", "product", "industry", "notes"],
  active: ["company", "pic", "sourcing", "product"],
  dealDone: ["company", "pic", "sourcing", "product"],
  noOrNotNow: ["company", "pic", "sourcing", "product", "reason"],
};

// The fields Search looks at in a group, for the highlight on the words that matched.
export function searchedFields(group: CompanyGroup): string[] {
  return SEARCHED[group] as string[];
}

// Search covers the name, contact person, source and products, plus industry
// and notes in To approach, and the reason in No or not now.
export function matchesCompanySearch(c: PipelineEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return SEARCHED[companyGroup(c)].some((k) => {
    const v = c[k];
    return typeof v === "string" && v.toLowerCase().includes(q);
  });
}

export interface CompanyFilter {
  search?: string;
  status?: string | null; // an option name, or "-" for companies without one
  priority?: string | null; // the same
  productKey?: string | null;
  trial?: string | null; // a GBA module, or "-" for companies that have trialled none
  whereToAct?: WhereToAct | null;
}

// The value a Status or Priority filter wants: "-" is none, so an empty or missing value matches it.
export const NO_VALUE = "-";

function choiceMatches(value: unknown, wanted: string): boolean {
  return wanted === NO_VALUE ? value === undefined || value === null || value === "" : value === wanted;
}

export function filterCompanies(companies: PipelineEntry[], f: CompanyFilter, today: string = todayIso()): PipelineEntry[] {
  return companies.filter((c) => {
    if (f.search && !matchesCompanySearch(c, f.search)) return false;
    if (f.status && !choiceMatches(c.status, f.status)) return false;
    if (f.priority && !choiceMatches(c.priority, f.priority)) return false;
    if (f.productKey && !hasProduct(c, f.productKey)) return false;
    if (f.trial && !(f.trial === NO_VALUE ? !choicesOf(c[GBA_TRIALS]).length : choicesOf(c[GBA_TRIALS]).includes(f.trial))) return false;
    if (f.whereToAct && !isWhereToAct(c, f.whereToAct, today)) return false;
    return true;
  });
}

/* ---------- Order (B9) ---------- */

export type CompanySortDir = "asc" | "desc";

// The old UI's priority order, for a sort given no option order. The redesign passes the options' order instead.
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function companySortValue(c: PipelineEntry, key: string, numeric: boolean, today: string, order?: string[]): string | number | null {
  if (order) {
    const at = order.indexOf(String(c[key] ?? ""));
    return at < 0 ? null : at; // a choice field goes by the order of its options; a value that isn't one of them counts as empty
  }
  if (key === "priority") return c.priority ? PRIORITY_RANK[c.priority] ?? 3 : null;
  if (key === "since") return c.date ? idleDays(c.date, today) : null; // days since the last action
  const v = c[key];
  if (v === undefined || v === null || v === "") return null;
  if (numeric) {
    const n = parseFloat(String(v));
    return isNaN(n) ? null : n;
  }
  return typeof v === "string" ? v.toLowerCase() : String(v);
}

// Any field, either way round. Empty values always go last (guide 5.6). A choice field passes its option names as `order`.
export function sortCompanies(
  companies: PipelineEntry[],
  key: string,
  dir: CompanySortDir,
  { numeric = false, today = todayIso(), order }: { numeric?: boolean; today?: string; order?: string[] } = {}
): PipelineEntry[] {
  const sign = dir === "asc" ? 1 : -1;
  return companies
    .map((c, i) => ({ c, i, v: companySortValue(c, key, numeric, today, order) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      if (a.v < b.v) return -sign;
      if (a.v > b.v) return sign;
      return a.i - b.i;
    })
    .map((x) => x.c);
}

// The day a parked company comes back, as a sort key; one waiting to be brought back has none, so goes last.
export const COMES_BACK = "parkedUntil";

// Most recent action first; To approach opens on the soonest planned outreach, and parked companies on the soonest back.
export function defaultCompanySort(group: CompanyGroup, parked = false): { key: string; dir: CompanySortDir } {
  if (parked) return { key: COMES_BACK, dir: "asc" };
  return group === "toApproach" ? { key: "reach", dir: "asc" } : { key: "date", dir: "desc" };
}

/* ---------- Where to act (B6), on Active ---------- */

export type WhereToAct = "goneCold" | "followUp" | "highPriority" | "targetClose";

export function isWhereToAct(c: PipelineEntry, kind: WhereToAct, today: string = todayIso()): boolean {
  switch (kind) {
    case "goneCold":
      return isGoneCold(c.date, today);
    case "followUp":
      return c.status === FOLLOW_UP_STATUS;
    case "highPriority":
      return c.priority === HIGH_PRIORITY;
    case "targetClose":
      return isTargetClose(c.target, today);
  }
}

export function whereToActCounts(companies: PipelineEntry[], today: string = todayIso()): Record<WhereToAct, number> & { of: number } {
  const counts = { goneCold: 0, followUp: 0, highPriority: 0, targetClose: 0, of: companies.length };
  for (const c of companies) {
    for (const k of ["goneCold", "followUp", "highPriority", "targetClose"] as WhereToAct[]) {
      if (isWhereToAct(c, k, today)) counts[k]++;
    }
  }
  return counts;
}

/* ---------- Follow-up task (B11, D-011) ---------- */

// "Follow up with <company>": type Follow up, deadline = target date, last
// action = the company's, key points = next actions, high priority if the company is.
export function followUpTaskFor(c: PipelineEntry, today: string = todayIso()): NewTask {
  const due = c.target || today;
  return {
    task: `Follow up with ${c.company}`,
    taskType: "Follow Up",
    priority: c.priority === HIGH_PRIORITY ? "High" : undefined,
    responsible: [],
    informed: [],
    keyPoints: c.notes ?? "",
    startDate: due,
    endDate: due,
    lastActionDate: c.date || undefined,
    linkedClientId: c.id,
    order: Date.now(),
  };
}

/* ---------- Kept in step (B12) ---------- */

// The task fields that follow a company's last action and target dates. Only
// open tasks follow; finished tasks keep theirs.
export function taskDatesFromCompany(
  c: Pick<PipelineEntry, "date" | "target">,
  t: { startDate: string; endDate: string; lastActionDate?: string }
): { lastActionDate?: string; endDate?: string; startDate?: string } | null {
  const patch: { lastActionDate?: string; endDate?: string; startDate?: string } = {};
  const date = c.date || undefined;
  if ((t.lastActionDate || undefined) !== date) patch.lastActionDate = date;
  if (c.target && t.endDate !== c.target) {
    patch.endDate = c.target;
    if (t.startDate && t.startDate > c.target) patch.startDate = c.target; // a start can't come after the deadline
  }
  return Object.keys(patch).length ? patch : null;
}
