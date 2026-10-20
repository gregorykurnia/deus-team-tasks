// Past clients: totals (R3, R4), the breakdown by sector (R5), sector
// spellings (R6) and search (R7). Pure functions; writes are in pastClientWrites.ts.
//
// Subsidiaries can have their own sector (D-016). Until the launch data step
// (task 4.8) fills them in, a subsidiary with no sector counts in its parent's.
import { buildGroups, cleanSector, countSummary, normalizeSectorKey, type HistoricalClient } from "./historicalClientTypes";

export { buildGroups, canonicalSector, cleanSector, countSummary, normalizeSectorKey, sortGroups } from "./historicalClientTypes";
export type { ClientGroup, CountSummary, HistoricalClient, SortDir, SortKey } from "./historicalClientTypes";

export function isParent(c: HistoricalClient): boolean {
  return !c.parentId;
}

// A company's sector: its own, or its parent's for a subsidiary with none.
export function sectorOf(c: HistoricalClient, byId: ReadonlyMap<string, HistoricalClient>): string {
  const own = cleanSector(c.sector ?? "");
  if (own || !c.parentId) return own;
  return cleanSector(byId.get(c.parentId)?.sector ?? "");
}

// One spelling per sector, ignoring case and spaces: the one most companies
// use, then a capitalised one, then A to Z.
export function sectorSpellings(clients: HistoricalClient[]): Map<string, string> {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const counts = new Map<string, Map<string, number>>();
  for (const c of clients) {
    const label = sectorOf(c, byId);
    if (!label) continue;
    const key = normalizeSectorKey(label);
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    counts.set(key, m);
  }
  const upper = (v: string) => (v[0] === v[0].toUpperCase() ? 1 : 0);
  return new Map(
    [...counts].map(([key, m]) => [
      key,
      [...m].sort((a, b) => b[1] - a[1] || upper(b[0]) - upper(a[0]) || a[0].localeCompare(b[0]))[0][0],
    ])
  );
}

// Is this company counted in the totals? Subsidiaries always are; a parent
// only when it isn't an umbrella kept out of the count (R3).
export function isCounted(c: HistoricalClient): boolean {
  return c.parentId ? true : c.countHead;
}

export function pastTotals(clients: HistoricalClient[]) {
  return countSummary(buildGroups(clients));
}

export interface SectorRow {
  key: string;
  label: string;
  count: number;
  share: number; // 0 to 1 of the total
}

export interface SectorBreakdown {
  rows: SectorRow[]; // largest first
  noSector: number;
  total: number; // always equals the client total
}

// Every counted company once, in its own sector (R5).
export function sectorBreakdown(clients: HistoricalClient[]): SectorBreakdown {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const spellings = sectorSpellings(clients);
  const counts = new Map<string, number>();
  let noSector = 0;
  let total = 0;
  for (const c of clients) {
    if (!isCounted(c)) continue;
    if (c.parentId && !byId.has(c.parentId)) continue; // an orphan isn't in the tree, so not in the total
    total++;
    const sector = sectorOf(c, byId);
    if (!sector) noSector++;
    else counts.set(normalizeSectorKey(sector), (counts.get(normalizeSectorKey(sector)) ?? 0) + 1);
  }
  const rows = [...counts]
    .map(([key, count]) => ({ key, label: spellings.get(key) ?? key, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { rows, noSector, total };
}

// Search covers names and sectors. A matching subsidiary shows under its
// parent; a matching parent shows with all its subsidiaries.
export function searchPastClients(
  clients: HistoricalClient[],
  query: string
): { parent: HistoricalClient; subs: HistoricalClient[]; otherSubs: number }[] {
  const q = query.trim().toLowerCase();
  const byId = new Map(clients.map((c) => [c.id, c]));
  const matches = (c: HistoricalClient) => c.name.toLowerCase().includes(q) || sectorOf(c, byId).toLowerCase().includes(q);
  return buildGroups(clients).flatMap(({ head, subs }) => {
    if (!q || matches(head)) return [{ parent: head, subs, otherSubs: 0 }];
    const hits = subs.filter(matches);
    return hits.length ? [{ parent: head, subs: hits, otherSubs: subs.length - hits.length }] : [];
  });
}
