// Flows (guide 6.8, 4.16, D-018): the rules behind the flows screen, kept apart from it so they can be tested.
// A flow is ordered steps, each with roles (a label and the people in it), and at most one decision after the last
// step, whose good and bad outcomes either end the flow or send the work back to an earlier step.
//
// Stored shape (shared with the old screen until the merge, so only fields are added): the decision's question is
// `label`, an outcome is a "branch" with `tone` and `loopTo`. The decision's `description` and a role's `id` are new in
// 3.14.
import { ago, isoOf, plural } from "./dates";
import { isPerson } from "./people";
import type { Flow, FlowBranch, FlowDecision, FlowRole, FlowStep, NewFlow } from "./types";

export const UNTITLED_FLOW = "Untitled flow";
export const UNTITLED_STEP = "Untitled step";
export const UNTITLED_OUTCOME = "Untitled outcome";

// Role labels offered before any are in use (W4 for labels).
export const ROLE_LABELS = ["Responsible", "Accountable", "Consulted", "Informed", "Approves", "Backup"];

// A role, with the id that names it the same way on every device. Roles stored before 3.14 have none until the flow is
// next saved (withRoleIds).
export type Role = FlowRole;
const idOf = (r: FlowRole) => r.id;

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export const flowName = (f: Pick<Flow, "name">) => f.name.trim() || UNTITLED_FLOW;

// A to Z by name (guide 5.6), untitled ones last.
export function sortFlows(flows: Flow[]): Flow[] {
  return [...flows].sort((a, b) => {
    const an = a.name.trim();
    const bn = b.name.trim();
    if (!an !== !bn) return an ? -1 : 1;
    return collator.compare(an, bn) || a.id.localeCompare(b.id);
  });
}

export const outcomesOf = (f: Pick<Flow, "decision">): FlowBranch[] => f.decision?.branches ?? [];

// Every place in a flow that has roles: its steps, then its outcomes.
const partsOf = (f: Flow): (FlowStep | FlowBranch)[] => [...f.steps, ...outcomesOf(f)];

export function peopleIn(f: Flow): string[] {
  const set = new Set<string>();
  for (const part of partsOf(f)) for (const r of part.roles) r.names.filter(isPerson).forEach((n) => set.add(n));
  return [...set];
}

export const rolesIn = (flows: Flow[]): FlowRole[] => flows.flatMap((f) => partsOf(f).flatMap((p) => p.roles));

// "5 steps · a decision", "No steps yet".
export function flowSummary(f: Flow): string {
  return [f.steps.length ? plural(f.steps.length, "step") : "No steps yet", f.decision ? "a decision" : ""].filter(Boolean).join(" · ");
}

// "Edited today". A flow changed before edits were recorded has no date, and says nothing (gap N1).
export function flowEdited(updatedAt: number | undefined, today: string): string | null {
  if (!updatedAt) return null;
  return `Edited ${ago(isoOf(new Date(updatedAt)), today)}`;
}

/* ---------- Search: names, descriptions, steps, outcomes, roles and people ---------- */

function searchText(f: Flow): string {
  const parts = [f.name, f.description, f.decision?.label ?? "", f.decision?.description ?? ""];
  for (const p of partsOf(f)) {
    // An outcome's old `label` isn't shown anywhere, so it isn't searched either.
    parts.push(p.title, p.description);
    for (const r of p.roles) parts.push(r.label, ...r.names);
  }
  return parts.join("\n").toLowerCase();
}

export function searchFlows(flows: Flow[], q: string): Flow[] {
  const words = q.trim().toLowerCase();
  if (!words) return flows;
  return flows.filter((f) => searchText(f).includes(words));
}

/* ---------- Loop backs ---------- */

export const stepNumber = (f: Flow, stepId: string) => f.steps.findIndex((s) => s.id === stepId) + 1;

// Where an outcome sends the work: the step it goes back to, or null when the flow ends there (or the step is gone).
export function loopTarget(f: Flow, o: FlowBranch): { step: FlowStep; number: number } | null {
  if (!o.loopTo) return null;
  const i = f.steps.findIndex((s) => s.id === o.loopTo);
  return i < 0 ? null : { step: f.steps[i], number: i + 1 };
}

export const outcomesBackTo = (f: Flow, stepId: string) => outcomesOf(f).filter((o) => o.loopTo === stepId);

/* ---------- New parts ---------- */

const freshId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Ids made while a replayable change runs, handed out again in the same order when it runs again.
let replaying: { ids: string[]; at: number } | null = null;

export function newId(prefix: string): string {
  if (!replaying) return freshId(prefix);
  if (replaying.at === replaying.ids.length) replaying.ids.push(freshId(prefix));
  return replaying.ids[replaying.at++];
}

// A change that names the parts it adds the same way every time it runs: on this device's copy first, then on the stored
// flow in a transaction (which may run it more than once), so what's typed next into a new part finds it there (R3).
export function replayable(change: FlowChange): FlowChange {
  const ids: string[] = [];
  return (f) => {
    const outer = replaying;
    replaying = { ids, at: 0 };
    try {
      return change(f);
    } finally {
      replaying = outer;
    }
  };
}

export const blankRole = (label = ""): Role => ({ id: newId("role"), label, names: [] });
export const blankStep = (): FlowStep => ({ id: newId("step"), title: "", description: "", roles: [blankRole("Responsible")] });
export const blankOutcome = (tone: FlowBranch["tone"]): FlowBranch => ({ id: newId("out"), label: "", tone, title: "", description: "", roles: [] });

// A new flow: its name, and its first step ready to write. It goes after the others in the stored order.
export function newFlowData(name: string, flows: Pick<Flow, "order">[]): NewFlow {
  const order = flows.reduce((max, f) => Math.max(max, Number.isFinite(f.order) ? f.order : 0), -1) + 1;
  return { name: name.trim(), description: "", order, steps: [blankStep()], decision: null };
}

/* ---------- Changes to the structure. Each returns a new flow and leaves the one given alone. ---------- */

const move = <T>(list: T[], from: number, to: number): T[] => {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

const withDecision = (f: Flow, change: (d: FlowDecision) => FlowDecision): Flow => (f.decision ? { ...f, decision: change(f.decision) } : f);

// A step at the end, or after the step named.
export function addStep(f: Flow, step: FlowStep, afterId?: string): Flow {
  const at = afterId ? f.steps.findIndex((s) => s.id === afterId) + 1 : f.steps.length;
  const steps = [...f.steps];
  steps.splice(at <= 0 ? steps.length : at, 0, step);
  return { ...f, steps };
}

export function moveStep(f: Flow, stepId: string, by: -1 | 1): Flow {
  const i = f.steps.findIndex((s) => s.id === stepId);
  return { ...f, steps: move(f.steps, i, i + by) };
}

export interface RemovedStep {
  step: FlowStep;
  index: number;
  loopedBack: string[]; // outcomes that went back to it, and now end the flow
}

// Removing a step: an outcome that went back to it ends the flow instead (D-018).
export function removeStep(f: Flow, stepId: string): { flow: Flow; removed: RemovedStep | null } {
  const index = f.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return { flow: f, removed: null };
  const loopedBack = outcomesBackTo(f, stepId).map((o) => o.id);
  const flow = withDecision(
    { ...f, steps: f.steps.filter((s) => s.id !== stepId) },
    (d) => ({ ...d, branches: d.branches.map((o) => (o.loopTo === stepId ? { ...o, loopTo: undefined } : o)) })
  );
  return { flow, removed: { step: f.steps[index], index, loopedBack } };
}

// Undo: the step goes back where it was, and the outcomes that went back to it do again (if they still end the flow).
export function restoreStep(f: Flow, r: RemovedStep): Flow {
  if (f.steps.some((s) => s.id === r.step.id)) return f;
  const steps = [...f.steps];
  steps.splice(Math.min(r.index, steps.length), 0, r.step);
  return withDecision({ ...f, steps }, (d) => ({
    ...d,
    branches: d.branches.map((o) => (r.loopedBack.includes(o.id) && !o.loopTo ? { ...o, loopTo: r.step.id } : o)),
  }));
}

/* Steps and outcomes both have roles: the part is named by its id, and a role by its ref. */

function updatePart(f: Flow, partId: string, change: (p: FlowStep & Partial<FlowBranch>) => FlowStep | FlowBranch): Flow {
  if (f.steps.some((s) => s.id === partId)) return { ...f, steps: f.steps.map((s) => (s.id === partId ? (change(s) as FlowStep) : s)) };
  return withDecision(f, (d) => ({ ...d, branches: d.branches.map((o) => (o.id === partId ? (change(o) as FlowBranch) : o)) }));
}

export const partOf = (f: Flow, partId: string): FlowStep | FlowBranch | undefined => partsOf(f).find((p) => p.id === partId);

// A role's ref: its id, or for a role stored without one, the id it gets when the flow is next saved (withRoleIds), so
// what's typed in it stays with it when that happens.
const pendingId = (partId: string, index: number) => `${partId}-r${index}`;
export const roleRef = (partId: string, role: FlowRole, index: number): string => idOf(role) ?? pendingId(partId, index);

// Where a role is in its part: by ref, or by position (a number, or digits in a key). -1 when it isn't there.
function roleIndex(p: FlowStep | FlowBranch, at: number | string): number {
  if (typeof at === "number" || /^\d+$/.test(at)) {
    const i = Number(at);
    return i < p.roles.length ? i : -1;
  }
  const byId = p.roles.findIndex((r) => idOf(r) === at);
  if (byId >= 0) return byId;
  return p.roles.findIndex((r, i) => !idOf(r) && pendingId(p.id, i) === at);
}

// Every role gets an id, so each device names it the same way even when a colleague adds, moves or removes others. Each
// one stored without an id gets the one its ref already uses.
export function withRoleIds(f: Flow): Flow {
  if (partsOf(f).every((p) => p.roles.every(idOf))) return f;
  const named = (p: FlowStep | FlowBranch) => {
    if (p.roles.every(idOf)) return p;
    const taken = new Set(p.roles.map(idOf).filter(Boolean));
    const roles = p.roles.map((r, i): Role => (idOf(r) ? r : { ...r, id: taken.has(pendingId(p.id, i)) ? newId("role") : pendingId(p.id, i) }));
    return { ...p, roles };
  };
  return withDecision({ ...f, steps: f.steps.map((s) => named(s) as FlowStep) }, (d) => ({ ...d, branches: d.branches.map((o) => named(o) as FlowBranch) }));
}

const withRole = (f: Flow, partId: string, at: number | string, change: (roles: FlowRole[], i: number) => FlowRole[]): Flow =>
  updatePart(f, partId, (p) => {
    const i = roleIndex(p, at);
    return i < 0 ? p : { ...p, roles: change(p.roles, i) };
  });

export const addRole = (f: Flow, partId: string, role: Role = blankRole()): Flow =>
  updatePart(f, partId, (p) => ({ ...p, roles: [...p.roles, role] }));

export const moveRole = (f: Flow, partId: string, at: number | string, by: -1 | 1): Flow => withRole(f, partId, at, (roles, i) => move(roles, i, i + by));

export const removeRole = (f: Flow, partId: string, at: number | string): Flow => withRole(f, partId, at, (roles, i) => roles.filter((_, j) => j !== i));

// Undo: the role goes back where it was, unless it's still there (its removal wasn't saved): the same id, or, for a role
// without one, the same role at that place.
export function restoreRole(f: Flow, partId: string, index: number, role: Role): Flow {
  return updatePart(f, partId, (p) => {
    const id = idOf(role);
    if (id ? p.roles.some((r) => idOf(r) === id) : p.roles[index] && sameContent(plainRole(p.roles[index]), plainRole(role))) return p;
    const roles = [...p.roles];
    roles.splice(Math.min(index, roles.length), 0, role);
    return { ...p, roles };
  });
}

export const setRoleNames = (f: Flow, partId: string, at: number | string, names: string[]): Flow =>
  withRole(f, partId, at, (roles, i) => roles.map((r, j) => (j === i ? { ...r, names } : r)));

// The decision starts with one good and one bad outcome (D-018).
export const addDecision = (f: Flow): Flow =>
  f.decision ? f : { ...f, decision: { label: "", description: "", branches: [blankOutcome("good"), blankOutcome("bad")] } };

export const removeDecision = (f: Flow): Flow => ({ ...f, decision: null });

export const addOutcome = (f: Flow, outcome: FlowBranch): Flow => withDecision(f, (d) => ({ ...d, branches: [...d.branches, outcome] }));

export function removeOutcome(f: Flow, outcomeId: string): { flow: Flow; index: number; outcome: FlowBranch | null } {
  const index = outcomesOf(f).findIndex((o) => o.id === outcomeId);
  if (index < 0) return { flow: f, index, outcome: null };
  return { flow: withDecision(f, (d) => ({ ...d, branches: d.branches.filter((o) => o.id !== outcomeId) })), index, outcome: outcomesOf(f)[index] };
}

export function restoreOutcome(f: Flow, index: number, outcome: FlowBranch): Flow {
  return withDecision(f, (d) => {
    if (d.branches.some((o) => o.id === outcome.id)) return d;
    const branches = [...d.branches];
    branches.splice(Math.min(index, branches.length), 0, outcome);
    return { ...d, branches };
  });
}

export const setTone = (f: Flow, outcomeId: string, tone: FlowBranch["tone"]): Flow => updatePart(f, outcomeId, (o) => ({ ...o, tone }));

// What happens next: back to a step, or the flow ends ("" or a step that isn't there).
export const setLoop = (f: Flow, outcomeId: string, stepId: string): Flow =>
  updatePart(f, outcomeId, (o) => ({ ...o, loopTo: f.steps.some((s) => s.id === stepId) ? stepId : undefined }));

/* ---------- Text, written in place. Each field is named by a key, so what's typed can be kept apart from the data. ---------- */

// "name", "description", "decision.label", "decision.description", "<part id>.title", "<part id>.description",
// "<part id>.role.<role ref>" (a role's label; a number names the role at that place).
export type FlowTextKey = string;

export const roleKey = (partId: string, ref: string | number): FlowTextKey => `${partId}.role.${ref}`;
const ROLE_KEY = /^(.+)\.role\.([^.]+)$/;

// The stored text for a key, or undefined when what it names isn't there any more.
export function textAt(f: Flow, key: FlowTextKey): string | undefined {
  if (key === "name") return f.name;
  if (key === "description") return f.description ?? "";
  if (key === "decision.label") return f.decision ? f.decision.label : undefined;
  if (key === "decision.description") return f.decision ? (f.decision.description ?? "") : undefined;
  const role = key.match(ROLE_KEY);
  if (role) {
    const part = partOf(f, role[1]);
    return part ? part.roles[roleIndex(part, role[2])]?.label : undefined;
  }
  const field = key.match(/^(.+)\.(title|description)$/);
  if (field) {
    const part = partOf(f, field[1]);
    return part ? part[field[2] as "title" | "description"] : undefined;
  }
  return undefined;
}

export function withText(f: Flow, key: FlowTextKey, value: string): Flow {
  if (textAt(f, key) === undefined) return f;
  if (key === "name" || key === "description") return { ...f, [key]: value };
  if (key === "decision.label") return withDecision(f, (d) => ({ ...d, label: value }));
  if (key === "decision.description") return withDecision(f, (d) => ({ ...d, description: value }));
  const role = key.match(ROLE_KEY);
  if (role) return withRole(f, role[1], role[2], (roles, i) => roles.map((r, j) => (j === i ? { ...r, label: value } : r)));
  const [, partId, field] = key.match(/^(.+)\.(title|description)$/)!;
  return updatePart(f, partId, (p) => ({ ...p, [field]: value }));
}

/* ---------- Saving ---------- */

export type FlowContent = Pick<Flow, "name" | "description" | "steps" | "decision">;
const CONTENT_KEYS = ["name", "description", "steps", "decision"] as const;

export const contentOf = (f: Flow): FlowContent => ({ name: f.name, description: f.description ?? "", steps: f.steps, decision: f.decision ?? null });

// Stored values compared as the data would hold them: unset values left out, and fields in any order (the data
// hands them back sorted).
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}
export const sameContent = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

// Only the parts that changed are written.
export function contentPatch(before: Flow, after: Flow): Partial<FlowContent> {
  const a = contentOf(before);
  const b = contentOf(after);
  return Object.fromEntries(CONTENT_KEYS.filter((k) => !sameContent(a[k], b[k])).map((k) => [k, b[k]]));
}

// A change to a flow, written as a function of the flow, so it can be made again on the newest version (a colleague's
// change in between is kept, and Undo or Try again pressed later applies to what's there then).
export type FlowChange = (f: Flow) => Flow;

// A change made to a flow: roles get their ids first, so the change names them as every device does. The patch is what
// to write, and empty when the change changes nothing (the ids alone aren't worth a write).
export function applyChange(f: Flow, change: FlowChange): { flow: Flow; patch: Partial<FlowContent> } {
  const named = withRoleIds(f);
  const flow = change(named);
  return { flow, patch: Object.keys(contentPatch(named, flow)).length ? contentPatch(f, flow) : {} };
}

// Roles compared without their ids, which only name them.
const plainRole = (r: FlowRole): FlowRole => ({ label: r.label, names: r.names });
const plainPart = <P extends FlowStep | FlowBranch>(p: P | undefined): P | undefined => p && { ...p, roles: p.roles.map(plainRole) };

// Two versions with the same content, whatever ids their roles have.
export function sameFlowContent(a: FlowContent, b: FlowContent): boolean {
  const plain = (c: FlowContent) => ({
    ...c,
    steps: c.steps.map((s) => plainPart(s)),
    decision: c.decision ? { ...c.decision, branches: c.decision.branches.map((o) => plainPart(o)) } : null,
  });
  return sameContent(plain(a), plain(b));
}

/* ---------- A colleague's change ---------- */

// The parts of a flow (its heading, the decision, a step or an outcome, by id) whose content differs between two versions.
export function changedParts(before: Flow, after: Flow): string[] {
  const out: string[] = [];
  if (before.name !== after.name || (before.description ?? "") !== (after.description ?? "")) out.push("head");
  const d0 = before.decision;
  const d1 = after.decision;
  if (d1 && (!d0 || d0.label !== d1.label || (d0.description ?? "") !== (d1.description ?? ""))) out.push("decision");
  const old = new Map(partsOf(before).map((p) => [p.id, p]));
  for (const p of partsOf(after)) if (!sameContent(plainPart(old.get(p.id)), plainPart(p))) out.push(p.id);
  return out;
}
