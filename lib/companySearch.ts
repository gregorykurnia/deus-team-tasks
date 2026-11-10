// Shared pure company-name matching for both chat connectors. No result limit here:
// each caller caps its response and can detect whether more matches exist.
import type { PipelineEntry } from "./clientTypes";

// Drop legal suffixes as whole words, preserving names such as "PTara" and "Tbkarya".
export function companyNameKey(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().split(/\s+/).filter((word) => word !== "pt" && word !== "tbk").join("");
}

// Exact names first, then prefixes, then substrings; name and numeric ID break ties.
export function matchingCompanies(query: string, companies: readonly PipelineEntry[]): PipelineEntry[] {
  const key = companyNameKey(query);
  if (!key) return [];
  return companies.map((company) => {
    const name = companyNameKey(company.company);
    const rank = name === key ? 0 : name.startsWith(key) ? 1 : name.includes(key) ? 2 : 3;
    return { company, name, rank };
  }).filter(({ rank }) => rank < 3)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || a.company.id - b.company.id)
    .map(({ company }) => company);
}
