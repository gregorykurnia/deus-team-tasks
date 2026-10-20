import { describe, expect, it } from "vitest";
import { companiesById } from "@/lib/kinds";
import { companiesCsv, notesCsv, pastClientsCsv } from "@/lib/exports";
import { HEADINGS, headingsWritten, likelihoodLabel, likelihoodSpread, likelihoodStep, searchNotes, sortNotes } from "@/lib/notes";
import { pastTotals, searchPastClients, sectorBreakdown, sectorSpellings } from "@/lib/pastClients";
import { createEmptyProspectJournalEntry, type ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import type { HistoricalClient } from "@/lib/historicalClientTypes";
import type { PipelineEntry } from "@/lib/clientTypes";

const notes = (id: string, fields: Partial<ProspectJournalEntry> = {}): ProspectJournalEntry => ({
  ...createEmptyProspectJournalEntry(id),
  updatedAt: 1,
  ...fields,
});

describe("qualification notes (U1, U2, U7)", () => {
  it("has the nine fixed headings", () => {
    expect(HEADINGS.map((h) => h.key)).toEqual([
      "clientNeed",
      "currentSituation",
      "painAndBusinessImpact",
      "solutionFit",
      "urgencyAndTiming",
      "stakeholdersAndDecisionProcess",
      "commercialReadiness",
      "nextStepAndOwnership",
      "potentialBlockersAnalysis",
    ]);
  });
  it("counts the headings written, ignoring blank text", () => {
    expect(headingsWritten(notes("a", { clientNeed: "Visibility", solutionFit: "  ", detailedRemarks: "long" }))).toBe(1);
  });
  it("reads likelihood as a five-step scale", () => {
    expect(likelihoodStep(notes("a", { opportunityStatus: "Very High" }))).toBe(5);
    expect(likelihoodStep(notes("a", { opportunityStatus: "Low" }))).toBe(1);
    expect(likelihoodStep(notes("a"))).toBe(0);
    expect(likelihoodLabel(notes("a"))).toBe("Not rated");
    const spread = likelihoodSpread([notes("a", { opportunityStatus: "High" }), notes("b"), notes("c", { opportunityStatus: "High" })]);
    expect(spread.counts.High).toBe(2);
    expect(spread.notRated).toBe(1);
  });
  it("finds words under any heading and says where", () => {
    const results = searchNotes(
      [
        notes("a", { prospectName: "Pelita", potentialBlockersAnalysis: "The budget approval is slow and the CFO is away." }),
        notes("b", { prospectName: "Budget Hotels" }),
        notes("c", { prospectName: "Other" }),
      ],
      "budget"
    );
    expect(results.map((r) => [r.entry.id, r.matches.map((m) => m.label)])).toEqual([
      ["a", ["Potential Blockers Analysis"]],
      ["b", ["Name"]],
    ]);
    const m = results[0].matches[0];
    expect(m.snippet.slice(m.start, m.start + m.length).toLowerCase()).toBe("budget");
  });
  it("lists the last edited first", () => {
    expect(sortNotes([notes("old", { updatedAt: 1 }), notes("new", { updatedAt: 5 })]).map((n) => n.id)).toEqual(["new", "old"]);
  });
});

const pc = (id: string, fields: Partial<HistoricalClient> = {}): HistoricalClient => ({
  id,
  name: id,
  parentId: null,
  sector: null,
  countHead: true,
  createdAt: 1,
  ...fields,
});

describe("past clients (R3 to R7)", () => {
  const clients = [
    pc("Mandala", { sector: "Banking", countHead: false }),
    pc("Mandala Finance", { parentId: "Mandala" }), // takes the parent's sector until 4.8
    pc("Mandala Retail", { parentId: "Mandala", sector: "retail " }),
    pc("Toko", { sector: "Retail" }),
    pc("Pasar", { sector: "Retail" }),
    pc("Unsorted"),
  ];

  it("adds up the totals with umbrella parents left out", () => {
    expect(pastTotals(clients)).toEqual({ heads: 4, headsCounted: 3, headsNotCounted: 1, subsidiaries: 2, total: 5 });
  });
  it("breaks down by each company's own sector, falling back to the parent's", () => {
    const b = sectorBreakdown(clients);
    expect(b.rows.map((r) => [r.label, r.count])).toEqual([
      ["Retail", 3],
      ["Banking", 1],
    ]);
    expect(b.noSector).toBe(1);
    expect(b.total).toBe(5);
    expect(b.rows[0].share).toBeCloseTo(0.6);
  });
  it("merges sector spellings to the one most companies use", () => {
    expect(sectorSpellings(clients).get("retail")).toBe("Retail");
  });
  it("shows a matching subsidiary under its parent, and how many others it has", () => {
    expect(searchPastClients(clients, "finance").map((r) => [r.parent.id, r.subs.map((s) => s.id), r.otherSubs])).toEqual([
      ["Mandala", ["Mandala Finance"], 1],
    ]);
  });
});

describe("exports (E1)", () => {
  it("exports the companies shown with the fields shown", () => {
    const out = companiesCsv(
      [{ id: 1, company: "Pelita", date: "2026-10-10", _raw: false } as PipelineEntry],
      [
        { key: "company", label: "Company" },
        { key: "since", label: "Days since" },
        { key: "pic", label: "Contact" },
      ],
      "Active",
      "2026-10-20"
    );
    expect(out).toEqual({ filename: "companies-active-2026-10-20.csv", headers: ["Company", "Days since", "Contact"], rows: [["Pelita", 10, ""]] });
  });
  it("exports notes with whether they're tracked, the group and likelihood", () => {
    const companies = companiesById([{ id: 1, company: "Pelita", status: "To Follow Up" } as PipelineEntry]);
    const out = notesCsv([notes("a", { prospectName: "Pelita", pipelineEntryId: 1, opportunityStatus: "High" }), notes("b", { prospectName: "Walk-in" })], companies, "2026-10-20");
    expect(out.headers.slice(0, 4)).toEqual(["Prospect", "Tracked company", "Group", "Likelihood"]);
    expect(out.headers).toHaveLength(15);
    expect(out.rows.map((r) => r.slice(0, 4))).toEqual([
      ["Pelita", "Yes", "Active", "High"],
      ["Walk-in", "No", "", "Not rated"],
    ]);
  });
  it("exports the full record of past clients, each subsidiary after its parent", () => {
    const out = pastClientsCsv([pc("Toko", { sector: "retail" }), pc("Mandala", { sector: "Banking" }), pc("Fin", { parentId: "Mandala" })], "2026-10-20");
    expect(out.rows).toEqual([
      ["Mandala", "Parent company", "", "Banking", "Yes"],
      ["Fin", "Subsidiary", "Mandala", "Banking", "Yes"],
      ["Toko", "Parent company", "", "retail", "Yes"],
    ]);
  });
});
