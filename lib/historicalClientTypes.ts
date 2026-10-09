// Data model and counting rules for the Clients Historical page.
//
//   total        = counted heads + every subsidiary
//   sector row   = counted heads in that sector + their subsidiaries
//   Unassigned   = same, for heads with no sector
//
// A head with countHead = false is still listed, but is not counted itself.
// Its subsidiaries are always counted. Sector rows therefore add up to the total.

export interface HistoricalClient {
  id: string;
  name: string;
  parentId: string | null; // null = head (client); otherwise the id of its head
  sector: string | null; // heads only
  countHead: boolean; // heads only; false = listed but not counted
  createdAt: number;
}

export interface ClientGroup {
  head: HistoricalClient;
  subs: HistoricalClient[];
}

export interface CountSummary {
  heads: number;
  headsCounted: number;
  headsNotCounted: number;
  subsidiaries: number;
  total: number;
}

export interface SectorRow {
  key: string;
  label: string;
  count: number;
}

export interface SectorSummary {
  rows: SectorRow[]; // highest count first; sectors with a count of 0 are left out
  unassigned: number;
  total: number;
}

// Collapses stray whitespace so "  Retail  " and "Retail" are the same value.
export function cleanSector(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSectorKey(value: string): string {
  return cleanSector(value).toLowerCase();
}

// One display spelling per sector, ignoring case and extra spaces.
// The most-used spelling wins. Ties go to a capitalised spelling ("Retail" over
// "retail"), then to the alphabetically first one.
export function sectorLabelMap(clients: HistoricalClient[]): Map<string, string> {
  const startsUpper = (value: string) => (value[0] === value[0].toUpperCase() ? 1 : 0);
  const spellings = new Map<string, Map<string, number>>();
  for (const client of clients) {
    if (client.parentId) continue;
    const label = cleanSector(client.sector ?? "");
    if (!label) continue;
    const key = normalizeSectorKey(label);
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(label, (counts.get(label) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const labels = new Map<string, string>();
  for (const [key, counts] of spellings) {
    const [best] = Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1] || startsUpper(b[0]) - startsUpper(a[0]) || a[0].localeCompare(b[0])
    )[0];
    labels.set(key, best);
  }
  return labels;
}

// Turns typed input into the sector name the page should store.
// Reuses the existing spelling when one matches, so "retail" becomes "Retail".
export function canonicalSector(input: string, labels: Map<string, string>): string | null {
  const clean = cleanSector(input);
  if (!clean) return null;
  return labels.get(normalizeSectorKey(clean)) ?? clean;
}

export function buildGroups(clients: HistoricalClient[]): ClientGroup[] {
  const byName = (a: HistoricalClient, b: HistoricalClient) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  const heads = clients.filter((client) => !client.parentId).sort(byName);
  const subsByHead = new Map<string, HistoricalClient[]>();
  for (const client of clients) {
    if (!client.parentId) continue;
    const list = subsByHead.get(client.parentId) ?? [];
    list.push(client);
    subsByHead.set(client.parentId, list);
  }

  return heads.map((head) => ({
    head,
    subs: (subsByHead.get(head.id) ?? []).sort(byName),
  }));
}

// How many entries a group adds to the total.
export function groupCount(group: ClientGroup): number {
  return (group.head.countHead ? 1 : 0) + group.subs.length;
}

export function countSummary(groups: ClientGroup[]): CountSummary {
  const heads = groups.length;
  const headsCounted = groups.filter((group) => group.head.countHead).length;
  const subsidiaries = groups.reduce((sum, group) => sum + group.subs.length, 0);
  return {
    heads,
    headsCounted,
    headsNotCounted: heads - headsCounted,
    subsidiaries,
    total: headsCounted + subsidiaries,
  };
}

export function sectorSummary(groups: ClientGroup[], labels: Map<string, string>): SectorSummary {
  const countByKey = new Map<string, number>();
  let unassigned = 0;

  for (const group of groups) {
    const count = groupCount(group);
    if (count === 0) continue;
    const clean = cleanSector(group.head.sector ?? "");
    if (!clean) {
      unassigned += count;
      continue;
    }
    const key = normalizeSectorKey(clean);
    countByKey.set(key, (countByKey.get(key) ?? 0) + count);
  }

  const rows = Array.from(countByKey, ([key, count]) => ({ key, label: labels.get(key) ?? key, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
  const total = unassigned + rows.reduce((sum, row) => sum + row.count, 0);

  return { rows, unassigned, total };
}
