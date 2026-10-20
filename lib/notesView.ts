// Qualification notes as the screen shows them (guide 6.6): the view in the address (search, likelihood, tracked or not,
// order), names, tags, the edited line, folding long remarks and the snippet under each name. Pure functions; the
// headings, likelihood and search themselves are in notes.ts.
import type { PipelineEntry } from "./clientTypes";
import { companyGroup, type CompanyGroup } from "./companies";
import { ago, isoOf, plural } from "./dates";
import type { CompaniesById } from "./kinds";
import { HEADINGS, LIKELIHOODS, likelihoodStep, searchNotes, type HeadingKey, type Likelihood, type NoteMatch } from "./notes";
import type { ProspectJournalEntry } from "./prospectJournalTypes";

// What each heading asks while it's empty.
export const HEADING_PROMPTS: Record<HeadingKey, string> = {
  clientNeed: "What are they trying to achieve?",
  currentSituation: "How do they do it today, and with what?",
  painAndBusinessImpact: "What does the problem cost them?",
  solutionFit: "Which of our products fit, and how well?",
  urgencyAndTiming: "Why now? Any dates that matter?",
  stakeholdersAndDecisionProcess: "Who decides, who influences, and how do they buy?",
  commercialReadiness: "Budget, procurement, contract terms",
  nextStepAndOwnership: "What happens next, and who owns it?",
  potentialBlockersAnalysis: "What could stop this?",
};

// The headings as the screen names them, in sentence case (guide 7).
export const HEADING_LABELS: Record<HeadingKey, string> = {
  clientNeed: "Client need",
  currentSituation: "Current situation",
  painAndBusinessImpact: "Pain and business impact",
  solutionFit: "Solution fit",
  urgencyAndTiming: "Urgency and timing",
  stakeholdersAndDecisionProcess: "Stakeholders and decision process",
  commercialReadiness: "Commercial readiness",
  nextStepAndOwnership: "Next step and ownership",
  potentialBlockersAnalysis: "Potential blockers",
};

// Likelihood's words on screen (guide 7: "Very high … Moderately low"); stored as notes.ts spells them.
export const LIKELIHOOD_WORDS: Record<Likelihood, string> = {
  "Very High": "Very high",
  High: "High",
  Medium: "Medium",
  "Moderately Low": "Moderately low",
  Low: "Low",
};
// In the address: ?lk=vhigh … low, or none for not rated.
export const LIKELIHOOD_IDS: Record<Likelihood, string> = { "Very High": "vhigh", High: "high", Medium: "med", "Moderately Low": "mlow", Low: "low" };
export const NOT_RATED = "none";

export type Track = "yes" | "no";
export type NotesSort = "edited" | "likely" | "name";
export const SORTS: Record<NotesSort, string> = {
  edited: "Last edited, newest first",
  likely: "Likelihood, highest first",
  name: "Name, A to Z",
};
export const TRACK_LABELS: Record<"" | Track, string> = { "": "All prospects", yes: "Tracked companies", no: "Not tracked yet" };

export interface NotesViewState {
  q: string;
  lk: string | null; // a LIKELIHOOD_IDS value or NOT_RATED
  track: Track | null;
  sort: NotesSort;
}

export const PAGE_SIZE = 100;

const LK_VALUES = new Set([...Object.values(LIKELIHOOD_IDS), NOT_RATED]);

export function parseNotesView(params: URLSearchParams): NotesViewState {
  const lk = params.get("lk");
  const track = params.get("track");
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    lk: lk && LK_VALUES.has(lk) ? lk : null,
    track: track === "yes" || track === "no" ? track : null,
    sort: sort === "likely" || sort === "name" ? sort : "edited",
  };
}

// The view written back into the address, keeping anything else that's there (?newNotes=1, ?task=…).
export function notesViewParams(state: NotesViewState, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of ["q", "lk", "track", "sort"]) p.delete(k);
  if (state.q) p.set("q", state.q);
  if (state.lk) p.set("lk", state.lk);
  if (state.track) p.set("track", state.track);
  if (state.sort !== "edited") p.set("sort", state.sort);
  return p;
}

export const clearedNotesView = (s: NotesViewState): NotesViewState => ({ ...s, q: "", lk: null, track: null });
export const notesFiltersOn = (s: NotesViewState) => !!(s.q.trim() || s.lk || s.track);

// The tracked company the notes belong to, if it's there. Notes whose company has gone read as not tracked yet.
export function companyOf(entry: ProspectJournalEntry, companies: CompaniesById): PipelineEntry | undefined {
  return entry.pipelineEntryId != null ? companies.get(entry.pipelineEntryId) : undefined;
}

export function groupOfNotes(entry: ProspectJournalEntry, companies: CompaniesById): CompanyGroup | null {
  const c = companyOf(entry, companies);
  return c ? companyGroup(c) : null;
}

export const UNTITLED = "Untitled prospect";

// A tracked company's notes go by the company's name as it is now.
export function notesName(entry: ProspectJournalEntry, companies: CompaniesById): string {
  return companyOf(entry, companies)?.company || entry.prospectName.trim() || UNTITLED;
}

export function likelihoodId(entry: Pick<ProspectJournalEntry, "opportunityStatus">): string {
  return likelihoodStep(entry) ? LIKELIHOOD_IDS[entry.opportunityStatus as Likelihood] : NOT_RATED;
}

export function likelihoodWord(entry: Pick<ProspectJournalEntry, "opportunityStatus">): string {
  return likelihoodStep(entry) ? LIKELIHOOD_WORDS[entry.opportunityStatus as Likelihood] : "Not rated";
}

// "Edited today", "Edited yesterday", "Edited 3 days ago".
export function editedLine(updatedAt: number, today: string): string {
  if (!updatedAt) return "Not edited yet";
  const when = ago(isoOf(new Date(updatedAt)), today);
  return `Edited ${when}`;
}

export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

// Remarks past this many characters fold to three lines (guide 6.6).
export const REMARKS_FOLD_AT = 280;
export const remarksFold = (text: string) => text.length > REMARKS_FOLD_AT;

export interface NotesRow {
  entry: ProspectJournalEntry;
  name: string;
  company: PipelineEntry | undefined;
  match: NoteMatch | null; // where the search found it, else null
}

export interface NotesListing {
  all: number;
  rows: NotesRow[]; // filtered and in order
}

// Search, likelihood and tracked-or-not narrow the list; the order is last edited unless chosen.
export function listNotes(entries: ProspectJournalEntry[], state: NotesViewState, companies: CompaniesById): NotesListing {
  const q = state.q.trim();
  let rows: NotesRow[] = searchNotes(entries, q).map(({ entry, matches }) => {
    const name = notesName(entry, companies);
    // A tracked company's own name isn't stored on the notes: search it too.
    const match = matches.find((m) => m.field !== "prospectName") ?? null;
    return { entry, name, company: companyOf(entry, companies), match };
  });
  if (q) {
    // searchNotes looked at the stored name; a tracked company's notes go by the company's name.
    const lower = q.toLowerCase();
    const found = new Set(rows.map((r) => r.entry.id));
    for (const entry of entries) {
      if (found.has(entry.id)) continue;
      const company = companyOf(entry, companies);
      if (company && company.company.toLowerCase().includes(lower)) rows.push({ entry, name: company.company, company, match: null });
    }
  }
  if (state.lk) rows = rows.filter((r) => likelihoodId(r.entry) === state.lk);
  if (state.track === "yes") rows = rows.filter((r) => r.company);
  if (state.track === "no") rows = rows.filter((r) => !r.company);
  const byName = (a: NotesRow, b: NotesRow) => a.name.localeCompare(b.name);
  const order: Record<NotesSort, (a: NotesRow, b: NotesRow) => number> = {
    edited: (a, b) => b.entry.updatedAt - a.entry.updatedAt || byName(a, b),
    likely: (a, b) => likelihoodStep(b.entry) - likelihoodStep(a.entry) || byName(a, b),
    name: byName,
  };
  return { all: entries.length, rows: [...rows].sort(order[state.sort]) };
}

// The line over the list: "7 of 10 prospects mention “budget”", "3 of 10 prospects", "10 prospects with notes".
export function resultLine(shown: number, all: number, state: NotesViewState): { lead: string; rest: string } {
  const q = state.q.trim();
  if (q) return { lead: shown.toLocaleString("en-US"), rest: ` of ${plural(all, "prospect")} mention “${q}”` };
  if (notesFiltersOn(state)) return { lead: shown.toLocaleString("en-US"), rest: ` of ${plural(all, "prospect")}` };
  return { lead: plural(all, "prospect"), rest: " with notes" };
}

// What the empty list says when nothing matches.
export function noMatchCopy(state: NotesViewState): { title: string; text: string; clear: string } {
  const q = state.q.trim();
  const parts: string[] = [];
  if (q) parts.push("Search looks at every heading, the remarks and the names.");
  if (state.lk) {
    const word = state.lk === NOT_RATED ? "not rated" : LIKELIHOOD_WORDS[likelihoodOfId(state.lk) ?? "Medium"].toLowerCase();
    parts.push(state.lk === NOT_RATED ? "Showing only notes not rated." : `Showing only ${word} likelihood.`);
  }
  if (state.track) parts.push(`Showing only ${TRACK_LABELS[state.track].toLowerCase()}.`);
  return {
    title: q ? `No notes mention “${q}”` : "No notes match",
    text: parts.join(" "),
    clear: q && !state.lk && !state.track ? "Clear search" : "Clear filters",
  };
}

export function likelihoodOfId(id: string): Likelihood | null {
  return LIKELIHOODS.find((l) => LIKELIHOOD_IDS[l] === id) ?? null;
}

// The snippet under a name: where the search found it, or else the next step, the most useful line to skim.
export function snippetOf(row: NotesRow): { label: string; text: string; highlight: boolean } | null {
  if (row.match) return { label: labelOf(row.match.field), text: row.match.snippet, highlight: true };
  const next = row.entry.nextStepAndOwnership?.trim();
  return next ? { label: "Next step", text: next.replace(/\s+/g, " "), highlight: false } : null;
}

function labelOf(field: NoteMatch["field"]): string {
  if (field === "prospectName") return "Name";
  if (field === "detailedRemarks") return "Remarks";
  return HEADING_LABELS[field];
}

// Each company has at most one set of notes (U5).
export function notesOfCompany(entries: ProspectJournalEntry[], companyId: number): ProspectJournalEntry | undefined {
  return entries.find((n) => n.pipelineEntryId === companyId);
}

// Companies for the pickers: Active first, then To approach, No or not now and Deal done, each A to Z.
const PICK_ORDER: CompanyGroup[] = ["active", "toApproach", "noOrNotNow", "dealDone"];
export function companiesToPick(companies: PipelineEntry[], query: string, withDealDone: boolean): PipelineEntry[] {
  const q = query.trim().toLowerCase();
  return companies
    .filter((c) => (withDealDone || companyGroup(c) !== "dealDone") && (!q || c.company.toLowerCase().includes(q)))
    .sort((a, b) => PICK_ORDER.indexOf(companyGroup(a)) - PICK_ORDER.indexOf(companyGroup(b)) || a.company.localeCompare(b.company));
}

// The text fields that save as you write.
export type NotesTextKey = HeadingKey | "detailedRemarks" | "prospectName";
export const TEXT_KEYS: NotesTextKey[] = [...HEADINGS.map((h) => h.key), "detailedRemarks", "prospectName"];

// Which text fields a colleague changed between two versions of the same notes, leaving out the ones that now hold
// what this device last wrote there (our own change coming back).
export function changedByOthers(
  before: ProspectJournalEntry,
  after: ProspectJournalEntry,
  ownWrites: Partial<Record<NotesTextKey, string>>
): NotesTextKey[] {
  return TEXT_KEYS.filter((k) => (before[k] ?? "") !== (after[k] ?? "") && ownWrites[k] !== (after[k] ?? ""));
}
