// What each export holds (E1, guide 5.12): headers, rows and the file name.
// downloadCsv in exportCsv.ts turns them into a file.
import { todayIso } from "./dates";
import { companyGroup, COMPANY_GROUP_LABELS } from "./companies";
import { HEADINGS, isTracked, likelihoodLabel } from "./notes";
import { buildGroups, sectorOf, sectorSpellings, type HistoricalClient } from "./pastClients";
import { normalizeSectorKey } from "./historicalClientTypes";
import { idleDays } from "./urgency";
import type { CompaniesById } from "./kinds";
import type { PipelineEntry } from "./clientTypes";
import type { ProspectJournalEntry } from "./prospectJournalTypes";

export interface CsvExport {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The companies shown now, with the fields the group's list shows.
export function companiesCsv(
  companies: PipelineEntry[],
  fields: { key: string; label: string }[],
  groupLabel: string,
  today: string = todayIso()
): CsvExport {
  return {
    filename: `companies-${slug(groupLabel)}-${today}.csv`,
    headers: fields.map((f) => f.label),
    rows: companies.map((c) =>
      fields.map((f) => {
        if (f.key === "since") return c.date ? idleDays(c.date, today) ?? "" : "";
        const v = c[f.key];
        return v === undefined || v === null ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : v;
      })
    ),
  };
}

// The notes shown now, one row per prospect.
export function notesCsv(entries: ProspectJournalEntry[], companies: CompaniesById, today: string = todayIso()): CsvExport {
  return {
    filename: `qualification-notes-${today}.csv`,
    headers: ["Prospect", "Tracked company", "Group", "Likelihood", ...HEADINGS.map((h) => h.label), "Remarks", "Last edited"],
    rows: entries.map((e) => {
      const company = e.pipelineEntryId != null ? companies.get(e.pipelineEntryId) : undefined;
      return [
        e.prospectName,
        isTracked(e) && company ? "Yes" : "No",
        company ? COMPANY_GROUP_LABELS[companyGroup(company)] : "",
        likelihoodLabel(e),
        ...HEADINGS.map((h) => e[h.key] ?? ""),
        e.detailedRemarks ?? "",
        e.updatedAt ? new Date(e.updatedAt).toISOString().slice(0, 16).replace("T", " ") : "",
      ];
    }),
  };
}

// Always the full record, each subsidiary after its parent, sectors spelled as
// the breakdown shows them.
export function pastClientsCsv(clients: HistoricalClient[], today: string = todayIso()): CsvExport {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const spellings = sectorSpellings(clients);
  const sector = (c: HistoricalClient) => {
    const s = sectorOf(c, byId);
    return s ? spellings.get(normalizeSectorKey(s)) ?? s : "";
  };
  const rows: string[][] = [];
  for (const { head, subs } of buildGroups(clients)) {
    rows.push([head.name, "Parent company", "", sector(head), head.countHead ? "Yes" : "No"]);
    for (const sub of subs) rows.push([sub.name, "Subsidiary", head.name, sector(sub), "Yes"]);
  }
  return {
    filename: `past-clients-${today}.csv`,
    headers: ["Name", "Parent or subsidiary", "Parent company", "Sector", "Counted"],
    rows,
  };
}
