// What Past clients shows (guide 6.7, 4.16, R1 to R7): the view held in the address, the list it makes, the words for
// its totals, filters and empty states, and the figures people copy. Pure; the screen only draws it. The address holds
// only the view's own params, so ?task= passes.
import { plural } from "./dates";
import { normalizeSectorKey } from "./historicalClientTypes";
import {
  buildGroups,
  isCounted,
  pastTotals,
  sectorBreakdown,
  sectorOf,
  sectorSpellings,
  type HistoricalClient,
} from "./pastClients";

export const PAGE_SIZE = 100; // parent companies at a time
export const SUBS_FIRST = 50; // subsidiaries shown under an opened parent, then 100 more at a time
export const SUBS_STEP = 100;
export const TOP_SECTORS = 8;
export const NO_SECTOR = "-"; // the sector filter's value for companies without one

export type PastSort = "name-asc" | "name-desc" | "subs-desc" | "subs-asc" | "sector-asc" | "sector-desc" | "counted-desc" | "counted-asc";
export const PAST_SORTS: Record<PastSort, string> = {
  "name-asc": "Name, A to Z",
  "name-desc": "Name, Z to A",
  "subs-desc": "Most subsidiaries first",
  "subs-asc": "Fewest subsidiaries first",
  "sector-asc": "Sector, A to Z",
  "sector-desc": "Sector, Z to A",
  "counted-desc": "Counted first",
  "counted-asc": "Not counted first",
};
const SORT_IDS = Object.keys(PAST_SORTS) as PastSort[];
export const DEFAULT_SORT: PastSort = "name-asc";

export interface PastViewState {
  q: string;
  sec: string | null; // a sector's key (lower case), or NO_SECTOR
  nc: boolean; // only the parents that aren't counted
  sort: PastSort;
  view: "list" | "sectors"; // phones show one side at a time
}

export const VIEW_PARAMS = ["q", "sec", "nc", "sort", "view"] as const;

export function parsePastView(params: URLSearchParams): PastViewState {
  const sort = params.get("sort") as PastSort | null;
  return {
    q: params.get("q") ?? "",
    sec: params.get("sec") || null,
    nc: params.has("nc"),
    sort: sort && SORT_IDS.includes(sort) ? sort : DEFAULT_SORT,
    view: params.get("view") === "sectors" ? "sectors" : "list",
  };
}

// The view as address params, on top of the ones that aren't its own. Defaults stay out of the address.
export function pastViewParams(state: PastViewState, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(current);
  VIEW_PARAMS.forEach((key) => params.delete(key));
  if (state.q) params.set("q", state.q);
  if (state.sec) params.set("sec", state.sec);
  if (state.nc) params.set("nc", "1");
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
  if (state.view === "sectors") params.set("view", "sectors");
  return params;
}

export const narrowing = (state: PastViewState) => !!(state.q.trim() || state.sec);
export const pastFiltersOn = (state: PastViewState) => narrowing(state) || state.nc;
export const clearedPastFilters = (state: PastViewState): PastViewState => ({ ...state, q: "", sec: null, nc: false });

/* ---------- Totals and words ---------- */

export interface Figures {
  parents: number; // parent companies on record
  counted: number; // of them, counted in the totals
  excluded: number; // umbrella companies kept on record but not counted
  subs: number; // subsidiaries, always counted
  total: number; // counted + subs
}

export function figures(clients: HistoricalClient[]): Figures {
  const t = pastTotals(clients);
  return { parents: t.heads, counted: t.headsCounted, excluded: t.headsNotCounted, subs: t.subsidiaries, total: t.total };
}

export const subsidiaries = (n: number) => plural(n, "subsidiary", "subsidiaries");
export const parentCompanies = (n: number) => plural(n, "parent company", "parent companies");
const umbrellas = (n: number) => plural(n, "umbrella company", "umbrella companies");

// "<1%" for a sector too small to round up; whole percentages otherwise.
export function percent(n: number, total: number): string {
  const v = total ? (n / total) * 100 : 0;
  return v > 0 && v < 1 ? "<1%" : `${Math.round(v)}%`;
}

export function totalsSentence(t: Figures): string {
  const counts = t.total ? `${parentCompanies(t.counted)} and ${subsidiaries(t.subs)}.` : "Nothing is counted yet.";
  const left = t.excluded ? ` ${umbrellas(t.excluded)} ${t.excluded === 1 ? "is" : "are"} kept on record but not counted.` : "";
  return counts + left;
}

// What "Copy these figures" puts on the clipboard (R4).
export function figuresText(clients: HistoricalClient[]): string {
  const t = figures(clients);
  const top = sectorBreakdown(clients)
    .rows.slice(0, 3)
    .map((r) => `${r.label} ${r.count.toLocaleString("en-GB")}`)
    .join(", ");
  const left = t.excluded ? ` ${umbrellas(t.excluded)} ${t.excluded === 1 ? "is" : "are"} on record but not counted.` : "";
  return `We have served ${plural(t.total, "client")}: ${parentCompanies(t.counted)} and ${subsidiaries(t.subs)}.${left}${top ? ` Largest sectors: ${top}.` : ""}`;
}

/* ---------- Sectors ---------- */

export interface SectorChoice {
  key: string;
  label: string;
  count: number; // companies on record in it, counted or not, parents and subsidiaries
}

// Every sector in use, largest first, one spelling each (R6).
export function sectorChoices(clients: HistoricalClient[]): SectorChoice[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const spellings = sectorSpellings(clients);
  const counts = new Map<string, number>();
  for (const c of clients) {
    if (c.parentId && !byId.has(c.parentId)) continue;
    const sector = sectorOf(c, byId);
    if (sector) counts.set(normalizeSectorKey(sector), (counts.get(normalizeSectorKey(sector)) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, label: spellings.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function sectorFilterLabel(sec: string, choices: SectorChoice[]): string {
  return sec === NO_SECTOR ? "None" : choices.find((c) => c.key === sec)?.label ?? sec;
}

/* ---------- The record ---------- */

export interface PastEntry {
  parent: HistoricalClient;
  subs: HistoricalClient[]; // all of them, A to Z
  own: boolean; // the parent itself matches the search and sector
  hits: HistoricalClient[] | null; // the subsidiaries that match, when the view is narrowed
}

export interface PastListing {
  entries: PastEntry[];
  labelOf: (c: HistoricalClient) => string; // the sector shown for a company: its own spelling-merged one, or its parent's
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

// Parent companies with their subsidiaries, narrowed by search, sector and "not counted", in the chosen order (R7).
// A matching subsidiary lists under its parent. A matching parent lists with the subsidiaries that match too, or with
// all of them when none does; the screen offers the rest ("Show its other n subsidiaries").
export function listPast(clients: HistoricalClient[], state: PastViewState): PastListing {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const spellings = sectorSpellings(clients);
  const labelOf = (c: HistoricalClient) => {
    const sector = sectorOf(c, byId);
    return sector ? (spellings.get(normalizeSectorKey(sector)) ?? sector) : "";
  };
  const q = state.q.trim().toLowerCase();
  const narrowed = narrowing(state);
  const hit = (c: HistoricalClient) => {
    if (q && !c.name.toLowerCase().includes(q) && !labelOf(c).toLowerCase().includes(q)) return false;
    if (!state.sec) return true;
    const key = normalizeSectorKey(sectorOf(c, byId));
    return state.sec === NO_SECTOR ? !key : key === state.sec;
  };

  const entries: PastEntry[] = [];
  for (const { head, subs: unsorted } of buildGroups(clients)) {
    if (state.nc && isCounted(head)) continue;
    const subs = [...unsorted].sort((a, b) => collator.compare(a.name, b.name));
    const own = narrowed ? hit(head) : true;
    const hits = narrowed ? subs.filter(hit) : null;
    if (!own && !hits?.length) continue;
    entries.push({ parent: head, subs, own, hits });
  }

  const [key, dir] = state.sort.split("-") as ["name" | "subs" | "sector" | "counted", "asc" | "desc"];
  const s = dir === "asc" ? 1 : -1;
  const byName = (a: PastEntry, b: PastEntry) => collator.compare(a.parent.name, b.parent.name);
  const compare: Record<typeof key, (a: PastEntry, b: PastEntry) => number> = {
    name: (a, b) => s * byName(a, b),
    subs: (a, b) => s * (a.subs.length - b.subs.length) || byName(a, b),
    // Companies without a sector always go last.
    sector: (a, b) => {
      const x = labelOf(a.parent);
      const y = labelOf(b.parent);
      if (!x !== !y) return x ? -1 : 1;
      return s * collator.compare(x, y) || byName(a, b);
    },
    counted: (a, b) => s * (Number(isCounted(a.parent)) - Number(isCounted(b.parent))) || byName(a, b),
  };
  return { entries: entries.sort(compare[key]), labelOf };
}

// A parent's subsidiaries are open when asked for, or when the search found one of them; "closed" wins over both.
export interface OpenState {
  open: ReadonlySet<string>;
  closed: ReadonlySet<string>;
}
export const isOpen = (e: PastEntry, { open, closed }: OpenState) =>
  e.subs.length > 0 && !closed.has(e.parent.id) && (open.has(e.parent.id) || !!e.hits?.length);

// The line above the record: how many parents and subsidiaries, or what matched.
export function resultLine(entries: PastEntry[], state: PastViewState, totals: Figures) {
  if (!pastFiltersOn(state)) {
    return { count: parentCompanies(totals.parents), rest: totals.subs ? `, with ${subsidiaries(totals.subs)} under them` : ", no subsidiaries yet" };
  }
  const own = entries.filter((e) => e.own).length;
  const subs = entries.reduce((n, e) => n + (e.hits?.length ?? 0), 0);
  const n = narrowing(state) ? own + subs : own;
  return {
    count: n.toLocaleString("en-GB"),
    rest: ` ${n === 1 ? "match" : "matches"}: ${parentCompanies(own)}${narrowing(state) ? ` and ${subsidiaries(subs)}` : ""}`,
  };
}

// The empty list's title: what no past client does.
export function nothingMatches(state: PastViewState, choices: SectorChoice[]): string {
  const what = [
    state.q.trim() ? `matches “${state.q.trim()}”` : "",
    state.sec ? `is in ${state.sec === NO_SECTOR ? "no sector" : sectorFilterLabel(state.sec, choices)}` : "",
    state.nc ? "is left out of the count" : "",
  ].filter(Boolean);
  return `No past client ${what.join(" and ")}`;
}
