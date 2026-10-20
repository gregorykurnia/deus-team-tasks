// People named on tasks: the names already in use (W4), initials and a stable hue.
import type { FlowRole, Task } from "./types";

// "Full Team" is a placeholder some tasks carry, not a person.
const NOT_A_PERSON = new Set(["Full Team"]);

export function isPerson(name: string): boolean {
  return !!name.trim() && !NOT_A_PERSON.has(name);
}

// Every name in use, A to Z: on tasks (responsible and informed), flow roles,
// and any extra names the caller adds.
export function namesInUse(
  tasks: Pick<Task, "responsible" | "informed">[],
  extra: Iterable<string> = [],
  flowRoles: FlowRole[] = []
): string[] {
  const set = new Set<string>(extra);
  for (const t of tasks) {
    t.responsible.forEach((n) => set.add(n));
    t.informed.forEach((p) => set.add(p.name));
  }
  for (const role of flowRoles) role.names.forEach((n) => set.add(n));
  return [...set].filter(isPerson).sort((a, b) => a.localeCompare(b));
}

const CJK_OR_HANGUL = /[　-鿿가-힯]+/;

// Two letters for an avatar: first and last word ("Maya Chen" → "MC"), the
// first two letters of a single word, or the first two characters of a CJK name.
export function initials(name: string): string {
  const n = name.trim();
  const cjk = n.match(CJK_OR_HANGUL);
  if (cjk) return cjk[0].slice(0, 2);
  const words = n.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

export const HUE_COUNT = 6;

// The same person always gets the same of the six avatar hues.
export function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % HUE_COUNT;
}

/* ---------- The people picker (W4, guide 4.13, 5.11) ---------- */

export interface NameCount {
  name: string;
  open: number; // open tasks the person owns or is kept informed on
}

// Every name in use with its open tasks, A to Z. A person on no open task is listed with 0.
export function openCountsByName(
  tasks: Pick<Task, "responsible" | "informed" | "completed">[],
  extra: Iterable<string> = [],
  flowRoles: FlowRole[] = []
): NameCount[] {
  const counts = new Map<string, number>();
  for (const name of namesInUse(tasks, extra, flowRoles)) counts.set(name, 0);
  for (const t of tasks) {
    if (t.completed) continue;
    const people = new Set([...t.responsible, ...t.informed.map((p) => p.name)].filter(isPerson));
    for (const name of people) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, open]) => ({ name, open })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface NameMatches {
  existing: NameCount[]; // names already in use, best match first
  addNew: string | null; // the typed text, offered as a new name
}

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const keyOf = (s: string) => tidy(s).toLowerCase();

// Names already in use come first: those that start with the text, then those with a word that starts with
// it, then the rest, A to Z within each. People already chosen are left out. The typed text is offered as a
// new name unless it is already in use or already chosen, ignoring case and extra spaces.
export function matchNames(query: string, names: NameCount[], chosen: string[]): NameMatches {
  const typed = tidy(query);
  const q = typed.toLowerCase();
  const taken = new Set(chosen.map(keyOf));
  const free = names.filter((n) => !taken.has(keyOf(n.name)));
  const rank = (name: string) => {
    const k = keyOf(name);
    if (k.startsWith(q)) return 0;
    return k.split(" ").some((word) => word.startsWith(q)) ? 1 : 2;
  };
  const existing = (q ? free.filter((n) => keyOf(n.name).includes(q)) : free).sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
  );
  const inUse = taken.has(q) || names.some((n) => keyOf(n.name) === q);
  return { existing, addNew: typed && !inUse ? typed : null };
}
