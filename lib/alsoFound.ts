// A search from Today covers tasks, companies and qualification notes (N3). The design only has results for tasks, so the
// tasks list carries the words, and this says how many companies and notes mention them too, with a way to each.
import type { PipelineEntry } from "./clientTypes";
import { matchesCompanySearch } from "./companies";
import { plural } from "./dates";
import { searchNotes } from "./notes";
import type { ProspectJournalEntry } from "./prospectJournalTypes";

export interface AlsoFound {
  companies: number;
  notes: number;
}

export function alsoFound(query: string, companies: PipelineEntry[], notes: ProspectJournalEntry[]): AlsoFound | null {
  const q = query.trim();
  if (!q) return null;
  const found = { companies: companies.filter((c) => matchesCompanySearch(c, q)).length, notes: searchNotes(notes, q).length };
  return found.companies || found.notes ? found : null;
}

export const companiesFound = (n: number) => plural(n, "company", "companies");
export const notesFound = (n: number) => plural(n, "set of qualification notes", "sets of qualification notes");
