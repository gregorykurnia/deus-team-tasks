// Qualification notes: the nine headings (U1), likelihood (U2), how much is
// written, and search across everything written (U7). Pure functions; writes
// are in noteWrites.ts.
import { PROSPECT_JOURNAL_FIELDS, type ProspectJournalEntry, type ProspectJournalField } from "./prospectJournalTypes";

export type HeadingKey = Exclude<ProspectJournalField, "opportunityStatus" | "detailedRemarks">;

// The nine fixed headings, in the inventory's order.
export const HEADINGS = PROSPECT_JOURNAL_FIELDS.filter(
  (f) => f.key !== "opportunityStatus" && f.key !== "detailedRemarks"
) as unknown as { key: HeadingKey; label: string }[];

// Likelihood is stored as opportunityStatus, from Very High down to Low.
export const LIKELIHOODS = ["Very High", "High", "Medium", "Moderately Low", "Low"] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];

// 5 for Very High down to 1 for Low; 0 when not rated.
export function likelihoodStep(entry: Pick<ProspectJournalEntry, "opportunityStatus">): number {
  const i = LIKELIHOODS.indexOf(entry.opportunityStatus as Likelihood);
  return i < 0 ? 0 : LIKELIHOODS.length - i;
}

export function likelihoodLabel(entry: Pick<ProspectJournalEntry, "opportunityStatus">): string {
  return likelihoodStep(entry) ? entry.opportunityStatus : "Not rated";
}

// How many prospects sit at each step, and how many aren't rated.
export function likelihoodSpread(entries: ProspectJournalEntry[]): { counts: Record<Likelihood, number>; notRated: number } {
  const counts = Object.fromEntries(LIKELIHOODS.map((l) => [l, 0])) as Record<Likelihood, number>;
  let notRated = 0;
  for (const e of entries) {
    if (likelihoodStep(e)) counts[e.opportunityStatus as Likelihood]++;
    else notRated++;
  }
  return { counts, notRated };
}

export function isWritten(value: string | undefined): boolean {
  return !!value && value.trim().length > 0;
}

// "6 of 9 headings written".
export function headingsWritten(entry: ProspectJournalEntry): number {
  return HEADINGS.filter((h) => isWritten(entry[h.key])).length;
}

export function isTracked(entry: Pick<ProspectJournalEntry, "pipelineEntryId">): boolean {
  return entry.pipelineEntryId != null;
}

// Last edited first.
export function sortNotes(entries: ProspectJournalEntry[]): ProspectJournalEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface NoteMatch {
  field: HeadingKey | "prospectName" | "detailedRemarks";
  label: string; // where it was found
  snippet: string;
  start: number; // where the match starts in the snippet
  length: number;
}

export interface NoteResult {
  entry: ProspectJournalEntry;
  matches: NoteMatch[];
}

const SEARCHED: { key: NoteMatch["field"]; label: string }[] = [
  { key: "prospectName", label: "Name" },
  ...HEADINGS,
  { key: "detailedRemarks", label: "Remarks" },
];

function snippetAround(text: string, at: number, length: number, radius = 40): { snippet: string; start: number } {
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + length + radius);
  const lead = from > 0 ? "…" : "";
  const snippet = lead + text.slice(from, to).replace(/\s+/g, " ") + (to < text.length ? "…" : "");
  // Collapsing spaces can shift the match; find it again in the snippet.
  const start = snippet.toLowerCase().indexOf(text.slice(at, at + length).replace(/\s+/g, " ").toLowerCase());
  return { snippet, start: Math.max(0, start) };
}

// Search covers names, every heading and the remarks. Each result says which
// heading the words were found under ("7 of 10 prospects mention 'budget'").
export function searchNotes(entries: ProspectJournalEntry[], query: string): NoteResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.map((entry) => ({ entry, matches: [] }));
  return entries.flatMap((entry) => {
    const matches: NoteMatch[] = [];
    for (const { key, label } of SEARCHED) {
      const text = entry[key] ?? "";
      const at = text.toLowerCase().indexOf(q);
      if (at < 0) continue;
      const { snippet, start } = snippetAround(text, at, q.length);
      matches.push({ field: key, label, snippet, start, length: q.length });
    }
    return matches.length ? [{ entry, matches }] : [];
  });
}
