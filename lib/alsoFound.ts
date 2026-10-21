// A search from Today covers tasks, companies and qualification notes (N3). The design only has results for tasks, so the
// tasks list carries the words, and this says how many companies and notes mention them too, with a way to each.
import type { PipelineEntry } from "./clientTypes";
import { companyGroup, matchesCompanySearch, type CompanyGroup } from "./companies";
import { parseCompanyView, viewParams } from "./companyView";
import { plural } from "./dates";
import { searchNotes } from "./notes";
import type { ProspectJournalEntry } from "./prospectJournalTypes";

export interface AlsoFound {
  companies: number;
  notes: number;
  companiesHref: string; // the group with the most of them, searched (the list says which other groups have more)
}

export function alsoFound(query: string, companies: PipelineEntry[], notes: ProspectJournalEntry[]): AlsoFound | null {
  const q = query.trim();
  if (!q) return null;
  const matching = companies.filter((c) => matchesCompanySearch(c, q));
  const view = parseCompanyView(new URLSearchParams());
  const byGroup = new Map<CompanyGroup, number>();
  for (const c of matching) byGroup.set(companyGroup(c), (byGroup.get(companyGroup(c)) ?? 0) + 1);
  let group = view.group;
  byGroup.forEach((n, g) => {
    if (n > (byGroup.get(group) ?? 0)) group = g;
  });
  const found = { companies: matching.length, notes: searchNotes(notes, q).length, companiesHref: `/companies?${viewParams({ ...view, group, q })}` };
  return found.companies || found.notes ? found : null;
}

export const companiesFound = (n: number) => plural(n, "company", "companies");
export const notesFound = (n: number) => plural(n, "set of qualification notes", "sets of qualification notes");
