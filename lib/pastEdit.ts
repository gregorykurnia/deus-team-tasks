// What changing past clients says (guide 6.7, 5.4, R1 to R3, R8, R9): the words for adding, deleting, counting and moving,
// and the parent companies offered when choosing one. Pure; the writes are in pastClientWrites.ts.
import { buildGroups, type HistoricalClient } from "./pastClients";
import { figures, subsidiaries } from "./pastView";

export const NAME_MISSING = "Add the company’s name. It’s the only thing needed.";
export const RENAME_MISSING = "A past client needs a name.";
export const PARENT_MISSING = "Choose its parent company first.";

const num = (n: number) => n.toLocaleString("en-GB");
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

// The client total once a change is made, for the words that say how it moves.
const totalWith = (clients: HistoricalClient[], change: (c: HistoricalClient[]) => HistoricalClient[]) => figures(change(clients)).total;

// The subsidiaries of each parent company on record.
export function subsByParent(clients: HistoricalClient[]): Map<string, number> {
  return new Map(buildGroups(clients).map(({ head, subs }) => [head.id, subs.length]));
}

// Parent companies A to Z whose name holds the typed words, leaving one out (the parent a subsidiary is under now).
export function parentsToPick(clients: HistoricalClient[], query: string, except?: string | null): HistoricalClient[] {
  const q = query.trim().toLowerCase();
  return clients
    .filter((c) => !c.parentId && c.id !== except && (!q || c.name.toLowerCase().includes(q)))
    .sort((a, b) => collator.compare(a.name, b.name));
}

// Under a parent company in a list to choose from: "Retail · 3 subsidiaries".
export const parentLine = (sector: string, subs: number) => `${sector || "No sector"} · ${subsidiaries(subs)}`;

export type DeleteWording =
  | { blocked: true; title: string; body: string }
  | { blocked: false; title: string; body: string; confirm: string };

// A parent company that still has subsidiaries can't be deleted (R8); anything else says how the total changes.
export function deleteWording(c: HistoricalClient, clients: HistoricalClient[]): DeleteWording {
  const subs = c.parentId ? 0 : clients.filter((x) => x.parentId === c.id).length;
  if (subs) {
    const them = subs === 1 ? "it" : "them";
    return {
      blocked: true,
      title: "Move or delete its subsidiaries first",
      body: `${c.name} still has ${subsidiaries(subs)}. Move ${them} to another parent company or delete ${them}, so no subsidiary is left without a parent. Then ${c.name} can be deleted.`,
    };
  }
  const before = figures(clients).total;
  const after = totalWith(clients, (all) => all.filter((x) => x.id !== c.id));
  const counts = before !== after;
  return {
    blocked: false,
    title: `Delete ${c.name}?`,
    body: `It comes off the record of past clients for everyone on the team. ${
      counts ? `The client total goes from ${num(before)} to ${num(after)}.` : "It isn’t counted, so the totals stay the same."
    }`,
    confirm: c.parentId ? "Delete subsidiary" : "Delete company",
  };
}

// Not counted, or counted again (R3), and how the total moves: "Halcyon Group no longer counted. Clients: 7 → 6".
export function countMessage(p: HistoricalClient, clients: HistoricalClient[], counted: boolean): string {
  const before = figures(clients).total;
  const after = totalWith(clients, (all) => all.map((x) => (x.id === p.id ? { ...x, countHead: counted } : x)));
  return `${p.name} ${counted ? "counted again" : "no longer counted"}. Clients: ${num(before)} → ${num(after)}`;
}

export const addedMessage = (name: string, parent?: string) => (parent ? `${name} added under ${parent}` : `${name} added`);

// The help under "Count it in the totals" while adding a parent company.
export const countHelp = (counted: boolean) =>
  `${counted ? "Counts as one client." : "Kept on record as an umbrella company. Its subsidiaries will still count."} Turn this off for a group that’s only on record for its subsidiaries.`;
