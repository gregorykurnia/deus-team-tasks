import { describe, expect, it } from "vitest";
import {
  replayable,
  addDecision,
  applyChange,
  addStep,
  blankStep,
  changedParts,
  contentPatch,
  flowEdited,
  flowSummary,
  loopTarget,
  moveRole,
  moveStep,
  newFlowData,
  peopleIn,
  removeOutcome,
  removeRole,
  removeStep,
  restoreOutcome,
  restoreRole,
  restoreStep,
  roleKey,
  roleRef,
  sameContent,
  sameFlowContent,
  searchFlows,
  setLoop,
  sortFlows,
  textAt,
  withRoleIds,
  withText,
  type Role,
} from "@/lib/flows";
import type { Flow } from "@/lib/types";

function flow(id: string, fields: Partial<Flow> = {}): Flow {
  return {
    id,
    name: `Flow ${id}`,
    description: "",
    order: 0,
    steps: [
      { id: "s1", title: "Sign the contract", description: "", roles: [{ label: "Responsible", names: ["Ana"] }] },
      { id: "s2", title: "Set up the accounts", description: "Create logins", roles: [] },
      { id: "s3", title: "Kick-off call", description: "", roles: [{ label: "Consulted", names: ["Budi", "Ana"] }] },
    ],
    decision: {
      label: "Does the client accept?",
      branches: [
        { id: "o1", label: "", tone: "good", title: "Go live", description: "", roles: [{ label: "Informed", names: ["Citra"] }] },
        { id: "o2", label: "", tone: "bad", title: "Fix the setup", description: "", roles: [], loopTo: "s2" },
      ],
    },
    ...fields,
  };
}

describe("the list", () => {
  it("runs A to Z ignoring case, numbers in order, untitled last", () => {
    const names = sortFlows([flow("a", { name: "step 10" }), flow("b", { name: "" }), flow("c", { name: "Step 9" }), flow("d", { name: "alpha" })]).map((f) => f.name);
    expect(names).toEqual(["alpha", "Step 9", "step 10", ""]);
  });

  it("searches names, steps, outcomes, roles and people", () => {
    const flows = [flow("a", { name: "Onboarding" }), flow("b", { name: "Renewal", steps: [], decision: null })];
    expect(searchFlows(flows, "kick-off").map((f) => f.id)).toEqual(["a"]);
    expect(searchFlows(flows, "fix the").map((f) => f.id)).toEqual(["a"]);
    expect(searchFlows(flows, "consulted").map((f) => f.id)).toEqual(["a"]);
    expect(searchFlows(flows, "citra").map((f) => f.id)).toEqual(["a"]);
    expect(searchFlows(flows, "accept").map((f) => f.id)).toEqual(["a"]);
    expect(searchFlows(flows, "RENEW").map((f) => f.id)).toEqual(["b"]);
    expect(searchFlows(flows, "  ")).toHaveLength(2);
  });

  it("doesn't search an outcome's old label, which isn't shown anywhere", () => {
    const f = flow("a");
    const old = { ...f, decision: { ...f.decision!, branches: f.decision!.branches.map((o) => ({ ...o, label: "Hidden words" })) } };
    expect(searchFlows([old], "hidden words")).toEqual([]);
  });

  it("sums a flow up", () => {
    expect(flowSummary(flow("a"))).toBe("3 steps · a decision");
    expect(flowSummary(flow("a", { steps: [], decision: null }))).toBe("No steps yet");
    expect(peopleIn(flow("a")).sort()).toEqual(["Ana", "Budi", "Citra"]);
  });

  it("says when a flow was edited, and nothing when that was never recorded (N1)", () => {
    expect(flowEdited(new Date(2026, 9, 20, 9).getTime(), "2026-10-20")).toBe("Edited today");
    expect(flowEdited(new Date(2026, 9, 17, 9).getTime(), "2026-10-20")).toBe("Edited 3 days ago");
    expect(flowEdited(undefined, "2026-10-20")).toBeNull();
  });
});

describe("a new flow", () => {
  it("has its name and a first step ready, after the others", () => {
    const f = newFlowData("  Renewals ", [{ order: 3 }, { order: 7 }]);
    expect(f).toMatchObject({ name: "Renewals", description: "", order: 8, decision: null });
    expect(f.steps).toHaveLength(1);
    expect(f.steps[0]).toMatchObject({ title: "", roles: [{ label: "Responsible", names: [] }] });
    expect(newFlowData("First", []).order).toBe(0);
  });
});

describe("steps", () => {
  it("are added at the end or after a step, and move up and down", () => {
    const s = blankStep();
    expect(addStep(flow("a"), s).steps.map((x) => x.id)).toEqual(["s1", "s2", "s3", s.id]);
    expect(addStep(flow("a"), s, "s1").steps.map((x) => x.id)).toEqual(["s1", s.id, "s2", "s3"]);
    expect(moveStep(flow("a"), "s2", -1).steps.map((x) => x.id)).toEqual(["s2", "s1", "s3"]);
    expect(moveStep(flow("a"), "s3", 1).steps.map((x) => x.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("removed: an outcome that went back to it ends the flow, and Undo restores both (D-018)", () => {
    const before = flow("a");
    const { flow: after, removed } = removeStep(before, "s2");
    expect(after.steps.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(after.decision!.branches[1].loopTo).toBeUndefined();
    expect(loopTarget(after, after.decision!.branches[1])).toBeNull();
    expect(removed).toMatchObject({ index: 1, loopedBack: ["o2"] });
    expect(before.steps).toHaveLength(3); // left alone

    const undone = restoreStep(after, removed!);
    expect(undone.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(undone.decision!.branches[1].loopTo).toBe("s2");
    expect(loopTarget(undone, undone.decision!.branches[1])).toMatchObject({ number: 2 });
  });

  it("Undo after other changes puts the step back where it fits", () => {
    const { flow: after, removed } = removeStep(flow("a"), "s3");
    const shorter = removeStep(after, "s1").flow;
    expect(restoreStep(shorter, removed!).steps.map((s) => s.id)).toEqual(["s2", "s3"]);
  });
});

describe("roles", () => {
  it("move, are removed and come back", () => {
    const f = flow("a", { steps: [{ id: "s1", title: "", description: "", roles: [{ label: "A", names: [] }, { label: "B", names: [] }] }] });
    expect(moveRole(f, "s1", 0, 1).steps[0].roles.map((r) => r.label)).toEqual(["B", "A"]);
    const removed = removeRole(f, "s1", 0);
    expect(removed.steps[0].roles.map((r) => r.label)).toEqual(["B"]);
    expect(restoreRole(removed, "s1", 0, { label: "A", names: [] }).steps[0].roles.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("Undo after a removal that wasn't saved leaves the role alone, instead of adding it twice", () => {
    const f = flow("a", { steps: [{ id: "s1", title: "", description: "", roles: [{ label: "A", names: ["Ana"] }, { label: "B", names: [] }] }] });
    expect(restoreRole(f, "s1", 0, { label: "A", names: ["Ana"] }).steps[0].roles.map((r) => r.label)).toEqual(["A", "B"]);
    const named = withRoleIds(f);
    const a = named.steps[0].roles[0] as Role;
    expect(restoreRole(named, "s1", 0, a).steps[0].roles).toHaveLength(2);
    expect(restoreRole(removeRole(named, "s1", a.id!), "s1", 0, a).steps[0].roles.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("are named by ref, so typing stays with its role when a colleague removes an earlier one", () => {
    const f = flow("a", { steps: [{ id: "s1", title: "", description: "", roles: [{ label: "A", names: [] }, { label: "B", names: [] }, { label: "C", names: [] }] }] });
    // Stored without ids: each ref is the id the role gets when the flow is next saved.
    const ref = roleRef("s1", f.steps[0].roles[1], 1);
    const named = withRoleIds(f);
    expect(roleRef("s1", named.steps[0].roles[1], 1)).toBe(ref);
    expect(withRoleIds(named)).toBe(named);
    // A colleague removes A: the key still names B.
    const theirs = removeRole(named, "s1", roleRef("s1", named.steps[0].roles[0], 0));
    expect(textAt(theirs, roleKey("s1", ref))).toBe("B");
    expect(withText(theirs, roleKey("s1", ref), "Approves").steps[0].roles.map((r) => r.label)).toEqual(["Approves", "C"]);
    expect(textAt(theirs, roleKey("s1", "gone"))).toBeUndefined();
  });
});

describe("the decision", () => {
  it("starts with one good and one bad outcome", () => {
    const d = addDecision(flow("a", { decision: null })).decision!;
    expect(d.branches.map((o) => o.tone)).toEqual(["good", "bad"]);
  });

  it("outcomes are removed and come back, and loop only to steps that exist", () => {
    const { flow: f, index, outcome } = removeOutcome(flow("a"), "o1");
    expect(f.decision!.branches.map((o) => o.id)).toEqual(["o2"]);
    expect(restoreOutcome(f, index, outcome!).decision!.branches.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(setLoop(flow("a"), "o1", "s1").decision!.branches[0].loopTo).toBe("s1");
    expect(setLoop(flow("a"), "o2", "").decision!.branches[1].loopTo).toBeUndefined();
    expect(setLoop(flow("a"), "o2", "gone").decision!.branches[1].loopTo).toBeUndefined();
  });
});

describe("text written in place", () => {
  it("is read and written by key", () => {
    const f = flow("a");
    expect(textAt(f, "s2.description")).toBe("Create logins");
    expect(textAt(f, "o1.role.0")).toBe("Informed");
    expect(textAt(f, "decision.label")).toBe("Does the client accept?");
    expect(textAt(f, "decision.description")).toBe("");
    expect(textAt(f, "gone.title")).toBeUndefined();
    expect(textAt(flow("a", { decision: null }), "decision.label")).toBeUndefined();

    expect(withText(f, "s1.title", "Sign it").steps[0].title).toBe("Sign it");
    expect(withText(f, "o2.title", "Fix it").decision!.branches[1].title).toBe("Fix it");
    expect(withText(f, "s3.role.0", "Asked").steps[2].roles[0].label).toBe("Asked");
    expect(withText(f, "decision.description", "Ask the sponsor").decision!.description).toBe("Ask the sponsor");
    expect(withText(f, "name", "Onboarding").name).toBe("Onboarding");
    expect(withText(f, "gone.title", "x")).toBe(f);
  });
});

describe("saving", () => {
  it("writes only the parts that changed, comparing fields in any order", () => {
    const f = flow("a");
    expect(contentPatch(f, withText(f, "name", "New name"))).toEqual({ name: "New name" });
    expect(Object.keys(contentPatch(f, withText(f, "s1.title", "x")))).toEqual(["steps"]);
    expect(contentPatch(f, f)).toEqual({});
    expect(sameContent({ a: 1, b: { c: 2, d: undefined } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });

  it("makes each change on the newest version, so two people editing different steps both keep their edit", () => {
    const base = flow("a");
    const mine = (f: Flow) => withText(f, "s1.title", "Mine");
    const theirs = (f: Flow) => withText(f, "s2.title", "Theirs");
    const stored = applyChange(applyChange(base, theirs).flow, mine).flow;
    expect(stored.steps.map((s) => s.title)).toEqual(["Mine", "Theirs", "Kick-off call"]);
  });

  it("doesn't write when the change changes nothing, even if roles still need their ids", () => {
    const f = flow("a");
    expect(applyChange(f, (x) => x).patch).toEqual({});
    expect(applyChange(f, (x) => withText(x, "name", f.name)).patch).toEqual({});
    const { patch } = applyChange(f, (x) => withText(x, "s1.title", "Sign it"));
    expect((patch.steps![0].roles[0] as Role).id).toBe("s1-r0");
  });

  it("finds what a colleague changed, ids aside", () => {
    const f = flow("a");
    expect(changedParts(f, withRoleIds(f))).toEqual([]);
    expect(sameFlowContent(withRoleIds(f), { ...f, decision: f.decision ?? null })).toBe(true);
    expect(changedParts(f, withText(f, "s2.title", "Accounts"))).toEqual(["s2"]);
    expect(changedParts(f, withText(f, "name", "Renamed"))).toEqual(["head"]);
    expect(changedParts(f, withText(f, "decision.label", "Ready?"))).toEqual(["decision"]);
    expect(changedParts(f, f)).toEqual([]);
  });
});

describe("a change run again", () => {
  it("names the parts it adds the same way each time, so typing into them finds them in the stored flow (R3)", () => {
    const flow = { id: "f", name: "F", description: "", order: 1, steps: [blankStep()], decision: null };
    const change = replayable(addDecision);
    const here = change(flow);
    const stored = change(structuredClone(flow));
    expect(stored.decision?.branches.map((b) => b.id)).toEqual(here.decision?.branches.map((b) => b.id));
    const other = addDecision(flow);
    expect(other.decision?.branches[0].id).not.toBe(here.decision?.branches[0].id);
  });
});
