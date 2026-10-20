import { describe, expect, it } from "vitest";
import type { HistoricalClient } from "@/lib/historicalClientTypes";
import {
  figures,
  figuresText,
  isOpen,
  listPast,
  nothingMatches,
  parsePastView,
  pastViewParams,
  percent,
  resultLine,
  sectorChoices,
  totalsSentence,
  type PastViewState,
} from "@/lib/pastView";

let n = 0;
const client = (name: string, f: Partial<HistoricalClient> = {}): HistoricalClient => ({
  id: `c${++n}`,
  name,
  parentId: null,
  sector: null,
  countHead: true,
  createdAt: 1,
  ...f,
});

const view = (f: Partial<PastViewState> = {}): PastViewState => ({ q: "", sec: null, nc: false, sort: "name-asc", view: "list", ...f });

function record() {
  const nusa = client("Nusa Retail", { id: "nusa", sector: "Retail" });
  const halcyon = client("Halcyon Group", { id: "halcyon", sector: null, countHead: false }); // an umbrella
  return [
    nusa,
    client("Nusa Outlet", { parentId: "nusa", sector: "retail" }),
    client("Nusa Online", { parentId: "nusa" }), // no sector of its own: its parent's
    halcyon,
    client("Halcyon Clinic", { parentId: "halcyon", sector: "Healthcare" }),
    client("Pelita Foods", { id: "pelita", sector: "Food" }),
    client("Zeta Works", { id: "zeta" }),
  ];
}

describe("the totals (R3, R4)", () => {
  it("adds counted parents and every subsidiary, and keeps umbrella companies out", () => {
    expect(figures(record())).toEqual({ parents: 4, counted: 3, excluded: 1, subs: 3, total: 6 });
  });
  it("says it in words", () => {
    expect(totalsSentence(figures(record()))).toBe("3 parent companies and 3 subsidiaries. 1 umbrella company is kept on record but not counted.");
    expect(totalsSentence(figures([]))).toBe("Nothing is counted yet.");
    expect(totalsSentence(figures([client("A", { countHead: false })]))).toBe("Nothing is counted yet. 1 umbrella company is kept on record but not counted.");
  });
  it("copies the figures with the three largest sectors", () => {
    expect(figuresText(record())).toBe(
      "We have served 6 clients: 3 parent companies and 3 subsidiaries. 1 umbrella company is on record but not counted. Largest sectors: Retail 3, Food 1, Healthcare 1."
    );
  });
  it("rounds a share, and says '<1%' for a sliver", () => {
    expect(percent(1, 3)).toBe("33%");
    expect(percent(1, 1000)).toBe("<1%");
    expect(percent(0, 10)).toBe("0%");
  });
});

describe("the address", () => {
  it("keeps defaults out and other params in", () => {
    expect(pastViewParams(view(), new URLSearchParams("task=new")).toString()).toBe("task=new");
    const p = pastViewParams(view({ q: "nusa", sec: "retail", nc: true, sort: "subs-desc", view: "sectors" }), new URLSearchParams("task=new"));
    expect(Object.fromEntries(p)).toEqual({ task: "new", q: "nusa", sec: "retail", nc: "1", sort: "subs-desc", view: "sectors" });
  });
  it("reads it back, ignoring an order that doesn't exist", () => {
    expect(parsePastView(new URLSearchParams("q=a&sec=-&nc=1&sort=subs-desc&view=sectors"))).toEqual(view({ q: "a", sec: "-", nc: true, sort: "subs-desc", view: "sectors" }));
    expect(parsePastView(new URLSearchParams("sort=nope")).sort).toBe("name-asc");
  });
});

describe("the record (R2, R7)", () => {
  it("lists parents A to Z with their subsidiaries A to Z", () => {
    const { entries } = listPast(record(), view());
    expect(entries.map((e) => e.parent.name)).toEqual(["Halcyon Group", "Nusa Retail", "Pelita Foods", "Zeta Works"]);
    expect(entries[1].subs.map((s) => s.name)).toEqual(["Nusa Online", "Nusa Outlet"]);
  });
  it("orders by subsidiaries, sector (none last either way) and counted", () => {
    const names = (sort: PastViewState["sort"]) => listPast(record(), view({ sort })).entries.map((e) => e.parent.name);
    expect(names("subs-desc")).toEqual(["Nusa Retail", "Halcyon Group", "Pelita Foods", "Zeta Works"]);
    expect(names("sector-asc")).toEqual(["Pelita Foods", "Nusa Retail", "Halcyon Group", "Zeta Works"]);
    expect(names("sector-desc")).toEqual(["Nusa Retail", "Pelita Foods", "Halcyon Group", "Zeta Works"]);
    expect(names("counted-asc")).toEqual(["Halcyon Group", "Nusa Retail", "Pelita Foods", "Zeta Works"]);
    expect(names("counted-desc")).toEqual(["Nusa Retail", "Pelita Foods", "Zeta Works", "Halcyon Group"]);
  });
  it("shows a spelling once, and a subsidiary with none in its parent's sector", () => {
    const { labelOf } = listPast(record(), view());
    const all = record();
    expect(labelOf(all[1])).toBe("Retail"); // "retail" typed another way
    expect(labelOf(all[2])).toBe("Retail"); // its parent's
    expect(labelOf(all[6])).toBe("");
  });
  it("search: a matching subsidiary lists under its parent, a matching parent with the subsidiaries that match too", () => {
    const byName = (q: string) => listPast(record(), view({ q })).entries.map((e) => [e.parent.name, e.own, e.hits?.map((h) => h.name)]);
    expect(byName("outlet")).toEqual([["Nusa Retail", false, ["Nusa Outlet"]]]);
    expect(byName("nusa")).toEqual([["Nusa Retail", true, ["Nusa Online", "Nusa Outlet"]]]);
    expect(byName("clinic")).toEqual([["Halcyon Group", false, ["Halcyon Clinic"]]]);
    expect(byName("  NUSA ")).toEqual(byName("nusa"));
    expect(byName("nothing")).toEqual([]);
  });
  it("search looks at sectors too", () => {
    expect(listPast(record(), view({ q: "health" })).entries.map((e) => e.parent.name)).toEqual(["Halcyon Group"]);
  });
  it("filters by sector, or by no sector", () => {
    expect(listPast(record(), view({ sec: "food" })).entries.map((e) => e.parent.name)).toEqual(["Pelita Foods"]);
    // Retail: the parent and both subsidiaries (one through its parent)
    const retail = listPast(record(), view({ sec: "retail" })).entries;
    expect(retail.map((e) => [e.parent.name, e.hits?.length])).toEqual([["Nusa Retail", 2]]);
    expect(listPast(record(), view({ sec: "-" })).entries.map((e) => e.parent.name)).toEqual(["Halcyon Group", "Zeta Works"]);
  });
  it("Not counted shows only the umbrella companies", () => {
    expect(listPast(record(), view({ nc: true })).entries.map((e) => e.parent.name)).toEqual(["Halcyon Group"]);
  });
  it("opens a parent when asked, or when the search found one of its subsidiaries, unless it was closed", () => {
    const [halcyon, nusa, , zeta] = listPast(record(), view()).entries;
    const none = { open: new Set<string>(), closed: new Set<string>() };
    expect(isOpen(nusa, none)).toBe(false);
    expect(isOpen(nusa, { ...none, open: new Set(["nusa"]) })).toBe(true);
    expect(isOpen(zeta, { ...none, open: new Set(["zeta"]) })).toBe(false); // nothing to show
    const [found] = listPast(record(), view({ q: "outlet" })).entries;
    expect(isOpen(found, none)).toBe(true);
    expect(isOpen(found, { ...none, closed: new Set(["nusa"]) })).toBe(false);
    expect(isOpen(halcyon, none)).toBe(false);
  });
  it("says what's shown", () => {
    const totals = figures(record());
    expect(resultLine(listPast(record(), view()).entries, view(), totals)).toEqual({ count: "4 parent companies", rest: ", with 3 subsidiaries under them" });
    expect(resultLine([], view(), figures([client("A")]))).toEqual({ count: "1 parent company", rest: ", no subsidiaries yet" });
    const q = view({ q: "nusa" });
    expect(resultLine(listPast(record(), q).entries, q, totals)).toEqual({ count: "3", rest: " matches: 1 parent company and 2 subsidiaries" });
    const o = view({ q: "outlet" });
    expect(resultLine(listPast(record(), o).entries, o, totals)).toEqual({ count: "1", rest: " match: 0 parent companies and 1 subsidiary" });
    const nc = view({ nc: true });
    expect(resultLine(listPast(record(), nc).entries, nc, totals)).toEqual({ count: "1", rest: " match: 1 parent company" });
  });
  it("says what nothing matches", () => {
    const choices = sectorChoices(record());
    expect(nothingMatches(view({ q: "zzz" }), choices)).toBe("No past client matches “zzz”");
    expect(nothingMatches(view({ q: "zzz", sec: "food", nc: true }), choices)).toBe("No past client matches “zzz” and is in Food and is left out of the count");
    expect(nothingMatches(view({ sec: "-" }), choices)).toBe("No past client is in no sector");
  });
  it("lists the sectors in use, largest first, one spelling each", () => {
    expect(sectorChoices(record())).toEqual([
      { key: "retail", label: "Retail", count: 3 },
      { key: "food", label: "Food", count: 1 },
      { key: "healthcare", label: "Healthcare", count: 1 },
    ]);
  });
});
