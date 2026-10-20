// The sector picker (R6, guide 4.13): sectors already in use with how many companies use each, and a note
// that says, before saving, whether what's typed is a spelling of one of them or a new sector.
import { describe, expect, it } from "vitest";
import { sectorNote, suggestSectors } from "@/lib/sectors";

const sectors = [
  { name: "Retail", count: 12 },
  { name: "Healthcare", count: 7 },
  { name: "Food and beverage", count: 7 },
];

describe("sectorNote", () => {
  it("says a different spelling is the same sector, and saved that way", () => {
    expect(sectorNote("  retail ", sectors)).toEqual({ kind: "same", sector: "Retail" });
  });

  it("says nothing when the spelling is the one already in use", () => {
    expect(sectorNote("Retail", sectors)).toBeNull();
  });

  it("says a sector nobody uses will be a new one", () => {
    expect(sectorNote("Agritech", sectors)).toEqual({ kind: "new", sector: "Agritech" });
  });

  it("says nothing for empty text", () => {
    expect(sectorNote("   ", sectors)).toBeNull();
  });

  it("ignores extra spaces inside the name", () => {
    expect(sectorNote("food  and   Beverage", sectors)).toEqual({ kind: "same", sector: "Food and beverage" });
  });
});

describe("suggestSectors", () => {
  it("lists the most used first, then A to Z, when nothing is typed", () => {
    expect(suggestSectors("", sectors).map((s) => s.name)).toEqual(["Retail", "Food and beverage", "Healthcare"]);
  });

  it("keeps sectors that contain the text, ignoring case", () => {
    expect(suggestSectors("HEA", sectors).map((s) => s.name)).toEqual(["Healthcare"]);
  });

  it("keeps each sector's company count", () => {
    expect(suggestSectors("retail", sectors)).toEqual([{ name: "Retail", count: 12 }]);
  });

  it("shows at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Sector ${i}`, count: i }));
    expect(suggestSectors("", many)).toHaveLength(8);
  });
});
