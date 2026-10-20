import { describe, expect, it } from "vitest";
import { companiesById } from "@/lib/kinds";
import { notesCsv } from "@/lib/exports";
import {
  changedByOthers,
  companiesToPick,
  editedLine,
  listNotes,
  noMatchCopy,
  notesName,
  notesViewParams,
  parseNotesView,
  remarksFold,
  resultLine,
  snippetOf,
  type NotesViewState,
} from "@/lib/notesView";
import { createEmptyProspectJournalEntry, type ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import type { PipelineEntry } from "@/lib/clientTypes";

const notes = (id: string, fields: Partial<ProspectJournalEntry> = {}): ProspectJournalEntry => ({
  ...createEmptyProspectJournalEntry(id),
  updatedAt: 1,
  ...fields,
});
const view = (s: Partial<NotesViewState> = {}): NotesViewState => ({ q: "", lk: null, track: null, sort: "edited", ...s });
const companies = companiesById([
  { id: 1, company: "Pelita Foods", status: "To Follow Up" } as PipelineEntry,
  { id: 2, company: "Kopi Nusantara", status: "Client / Partner Done Deal" } as PipelineEntry,
]);
const entries = [
  notes("a", { prospectName: "old name", pipelineEntryId: 1, opportunityStatus: "High", updatedAt: 10, nextStepAndOwnership: "Send the quote" }),
  notes("b", { prospectName: "Walk-in", updatedAt: 30, painAndBusinessImpact: "The budget is tight" }),
  notes("c", { prospectName: "Gone company", pipelineEntryId: 9, opportunityStatus: "Very High", updatedAt: 20 }),
];

describe("the notes view in the address", () => {
  it("reads and writes search, likelihood, tracked or not and order, keeping other params", () => {
    const state = parseNotesView(new URLSearchParams("q=budget&lk=high&track=no&sort=name&newNotes=1"));
    expect(state).toEqual({ q: "budget", lk: "high", track: "no", sort: "name" });
    expect(notesViewParams({ ...state, sort: "edited" }, new URLSearchParams("newNotes=1&q=old")).toString()).toBe("newNotes=1&q=budget&lk=high&track=no");
    expect(parseNotesView(new URLSearchParams("lk=nope&track=x&sort=y"))).toEqual(view());
  });
});

describe("listing notes (U2, U6, U7)", () => {
  it("names tracked notes after the company as it is now, and notes whose company has gone as not tracked", () => {
    expect(notesName(entries[0], companies)).toBe("Pelita Foods");
    expect(notesName(notes("x"), companies)).toBe("Untitled prospect");
    const tracked = listNotes(entries, view({ track: "yes" }), companies).rows.map((r) => r.entry.id);
    const untracked = listNotes(entries, view({ track: "no" }), companies).rows.map((r) => r.entry.id);
    expect(tracked).toEqual(["a"]);
    expect(untracked).toEqual(["b", "c"]);
  });
  it("orders by last edited, likelihood or name", () => {
    expect(listNotes(entries, view(), companies).rows.map((r) => r.entry.id)).toEqual(["b", "c", "a"]);
    expect(listNotes(entries, view({ sort: "likely" }), companies).rows.map((r) => r.entry.id)).toEqual(["c", "a", "b"]);
    expect(listNotes(entries, view({ sort: "name" }), companies).rows.map((r) => r.name)).toEqual(["Gone company", "Pelita Foods", "Walk-in"]);
  });
  it("filters one likelihood, or the ones not rated", () => {
    expect(listNotes(entries, view({ lk: "vhigh" }), companies).rows.map((r) => r.entry.id)).toEqual(["c"]);
    expect(listNotes(entries, view({ lk: "none" }), companies).rows.map((r) => r.entry.id)).toEqual(["b"]);
  });
  it("searches the company's name too, and says under which heading it found the words", () => {
    const byCompany = listNotes(entries, view({ q: "pelita" }), companies).rows;
    expect(byCompany.map((r) => r.entry.id)).toEqual(["a"]);
    const byHeading = listNotes(entries, view({ q: "budget" }), companies).rows;
    expect(snippetOf(byHeading[0])).toMatchObject({ label: "Pain and business impact", highlight: true });
    expect(snippetOf(listNotes(entries, view(), companies).rows[2])).toEqual({ label: "Next step", text: "Send the quote", highlight: false });
  });
  it("says how many match, and what to clear when none do", () => {
    expect(resultLine(7, 10, view({ q: "budget" }))).toEqual({ lead: "7", rest: " of 10 prospects mention “budget”" });
    expect(resultLine(10, 10, view())).toEqual({ lead: "10 prospects", rest: " with notes" });
    expect(noMatchCopy(view({ q: "budget" }))).toMatchObject({ title: "No notes mention “budget”", clear: "Clear search" });
    expect(noMatchCopy(view({ lk: "mlow", track: "yes" }))).toEqual({
      title: "No notes match",
      text: "Showing only moderately low likelihood. Showing only tracked companies.",
      clear: "Clear filters",
    });
  });
});

describe("writing and reading notes", () => {
  it("says when they were last edited", () => {
    const today = "2026-10-20";
    expect(editedLine(new Date(2026, 9, 20, 9).getTime(), today)).toBe("Edited today");
    expect(editedLine(new Date(2026, 9, 19, 9).getTime(), today)).toBe("Edited yesterday");
    expect(editedLine(new Date(2026, 9, 17, 9).getTime(), today)).toBe("Edited 3 days ago");
  });
  it("folds remarks past 280 characters", () => {
    expect(remarksFold("x".repeat(280))).toBe(false);
    expect(remarksFold("x".repeat(281))).toBe(true);
  });
  it("tells a colleague's change from this device's own change coming back (5.8)", () => {
    const before = notes("a", { clientNeed: "one", solutionFit: "fit" });
    const after = notes("a", { clientNeed: "mine", solutionFit: "theirs" });
    expect(changedByOthers(before, after, { clientNeed: "mine" })).toEqual(["solutionFit"]);
  });
  it("offers companies to pick with Active first, leaving Deal done out of new notes", () => {
    const all = [{ id: 1, company: "Pelita Foods", status: "To Follow Up" }, { id: 2, company: "Kopi Nusantara", status: "Client / Partner Done Deal" }, { id: 3, company: "Arum", _raw: true }] as PipelineEntry[];
    expect(companiesToPick(all, "", false).map((c) => c.id)).toEqual([1, 3]);
    expect(companiesToPick(all, "kopi", true).map((c) => c.id)).toEqual([2]);
  });
  it("exports one prospect's notes under its name, with the headings as the screen names them", () => {
    const out = notesCsv([entries[0]], companies, "2026-10-20", "Pelita Foods");
    expect(out.filename).toBe("qualification-notes-pelita-foods-2026-10-20.csv");
    expect(out.headers[4]).toBe("Client need");
    expect(out.rows[0].slice(0, 4)).toEqual(["Pelita Foods", "Yes", "Active", "High"]);
  });
});
