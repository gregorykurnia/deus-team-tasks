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
