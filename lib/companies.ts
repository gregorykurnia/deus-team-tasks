// Companies: their four groups (B2), search, filters, sorting, where to act (B6)
// and the follow-up task (B11). Pure functions; writes are in companyWrites.ts.
import { todayIso } from "./dates";
import { idleDays, isGoneCold, isTargetClose } from "./urgency";
import type { PipelineEntry, TableKey } from "./clientTypes";
import type { NewTask } from "./types";

export type CompanyGroup = "toApproach" | "active" | "dealDone" | "noOrNotNow";

export const COMPANY_GROUPS: CompanyGroup[] = ["toApproach", "active", "dealDone", "noOrNotNow"];

export const COMPANY_GROUP_LABELS: Record<CompanyGroup, string> = {
  toApproach: "To approach",
  active: "Active",
  dealDone: "Deal done",
  noOrNotNow: "No or not now",
};

// The stored statuses the groups and figures depend on (Q3). They can be
// recoloured but not renamed or removed (C3).
export const DEAL_DONE_STATUS = "Client / Partner Done Deal";
export const FOLLOW_UP_STATUS = "To Follow Up";

// "No or not now" tells on hold from rejected (D-011).
export const ANSWERS = ["Not now", "No"] as const;
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

/* ---------- Find and narrow (B8) ---------- */

const SEARCHED: Record<CompanyGroup, (keyof PipelineEntry)[]> = {
  toApproach: ["company", "pic", "sourcing", "product", "industry", "notes"],
  active: ["company", "pic", "sourcing", "product"],
  dealDone: ["company", "pic", "sourcing", "product"],
  noOrNotNow: ["company", "pic", "sourcing", "product", "reason"],
};

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
  status?: string | null;
  priority?: string | null;
  productKey?: string | null;
  whereToAct?: WhereToAct | null;
}

export function filterCompanies(companies: PipelineEntry[], f: CompanyFilter, today: string = todayIso()): PipelineEntry[] {
  return companies.filter((c) => {
    if (f.search && !matchesCompanySearch(c, f.search)) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.priority && c.priority !== f.priority) return false;
    if (f.productKey && !hasProduct(c, f.productKey)) return false;
    if (f.whereToAct && !isWhereToAct(c, f.whereToAct, today)) return false;
    return true;
  });
}

/* ---------- Order (B9) ---------- */

export type CompanySortDir = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function companySortValue(c: PipelineEntry, key: string, numeric: boolean, today: string): string | number | null {
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

// Any field, either way round. Empty values always go last (guide 5.6).
export function sortCompanies(
  companies: PipelineEntry[],
  key: string,
  dir: CompanySortDir,
  { numeric = false, today = todayIso() }: { numeric?: boolean; today?: string } = {}
): PipelineEntry[] {
  const sign = dir === "asc" ? 1 : -1;
  return companies
    .map((c, i) => ({ c, i, v: companySortValue(c, key, numeric, today) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      if (a.v < b.v) return -sign;
      if (a.v > b.v) return sign;
      return a.i - b.i;
    })
    .map((x) => x.c);
}

// Most recent action first; To approach opens on the soonest planned outreach.
export function defaultCompanySort(group: CompanyGroup): { key: string; dir: CompanySortDir } {
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
      return c.priority === "High";
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
    priority: c.priority === "High" ? "High" : undefined,
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
