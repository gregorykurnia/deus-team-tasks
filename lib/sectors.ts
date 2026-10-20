// The sector picker (R6, guide 4.13): the sectors already in use with how many companies use each, and a note that
// says, before saving, whether the typed text is another spelling of one of them or a new sector.
import { cleanSector, normalizeSectorKey } from "./historicalClientTypes";

export interface SectorCount {
  name: string; // the spelling most companies use
  count: number;
}

export type SectorNote = { kind: "same" | "new"; sector: string } | null;

// "Same sector as “Retail”, so it's saved that way." or "“Agritech” will be a new sector." Nothing when
// the text is empty or is already the spelling in use.
export function sectorNote(input: string, sectors: SectorCount[]): SectorNote {
  const typed = cleanSector(input);
  if (!typed) return null;
  const key = normalizeSectorKey(typed);
  const match = sectors.find((s) => normalizeSectorKey(s.name) === key);
  if (!match) return { kind: "new", sector: typed };
  return match.name === typed ? null : { kind: "same", sector: match.name };
}

// Sectors that contain the text, ignoring case and extra spaces: the most used first, then A to Z.
export function suggestSectors(query: string, sectors: SectorCount[], limit = 8): SectorCount[] {
  const q = normalizeSectorKey(query);
  return sectors
    .filter((s) => normalizeSectorKey(s.name).includes(q))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
