// Selecting several tasks (guide 4.7, D-008): what's chosen, the head checkbox, and what the bar and the move menu say.
import { describe, expect, it } from "vitest";
import { chosenIds, headState, moveNote, movedMessage, NO_SELECTION, selectAll, selectAllOffer, selectedLine, toggleChosen, toggleHead, viewChanged, type Selection } from "@/lib/taskSelection";

const list = ["a", "b", "c", "d", "e"];
const shown = ["a", "b", "c"];
const pick = (...ids: string[]): Selection => ({ ids: new Set(ids), all: false });

describe("what's chosen", () => {
  it("counts only ticked tasks still in the list, in the list's order", () => {
    expect(chosenIds(pick("c", "gone", "a"), list)).toEqual(["a", "c"]);
  });

  it("is every matching task after Select all", () => {
    expect(chosenIds({ ids: new Set(), all: true }, list)).toEqual(list);
  });

  it("ticks and unticks one task", () => {
    const one = toggleChosen(NO_SELECTION, "b", list);
    expect(chosenIds(one, list)).toEqual(["b"]);
    expect(chosenIds(toggleChosen(one, "b", list), list)).toEqual([]);
  });

  it("Select all never grows to a wider view: only the tasks it took in that are still shown stay chosen", () => {
    const overdue = ["b", "d"];
    const all = selectAll(overdue);
    expect(chosenIds(all, overdue)).toEqual(overdue);
    const widened = viewChanged(all);
    expect(widened.all).toBe(false);
    expect(chosenIds(widened, list)).toEqual(["b", "d"]);
    expect(chosenIds(viewChanged(selectAll(list)), ["d", "a"])).toEqual(["d", "a"]);
    expect(viewChanged(pick("a"))).toEqual(pick("a"));
  });

  it("unticking one after Select all keeps the rest", () => {
    const next = toggleChosen({ ids: new Set(), all: true }, "d", list);
    expect(next.all).toBe(false);
    expect(chosenIds(next, list)).toEqual(["a", "b", "c", "e"]);
  });
});

describe("the head checkbox", () => {
  it("is off with nothing chosen, mixed with some, ticked when every row on screen is", () => {
    expect(headState(NO_SELECTION, shown, list)).toBe(false);
    expect(headState(pick("b"), shown, list)).toBe("mixed");
    expect(headState(pick("e"), shown, list)).toBe("mixed"); // chosen, but further down than the rows shown
    expect(headState(pick("a", "b", "c"), shown, list)).toBe(true);
  });

  it("ticks every row on screen, keeping what was chosen further down, then clears", () => {
    const on = toggleHead(pick("e"), shown, list);
    expect(chosenIds(on, list)).toEqual(["a", "b", "c", "e"]);
    expect(chosenIds(toggleHead(on, shown, list), list)).toEqual([]);
  });

  it("clears after Select all", () => {
    expect(toggleHead({ ids: new Set(), all: true }, shown, list)).toEqual(NO_SELECTION);
  });
});

describe("the selection bar", () => {
  it("says how many are chosen, with thousands separators", () => {
    expect(selectedLine(0, false)).toBe("Choose tasks");
    expect(selectedLine(3, false)).toBe("3 selected");
    expect(selectedLine(1579, true)).toBe("All 1,579 selected");
    expect(selectedLine(1, true)).toBe("1 selected");
  });

  it("offers Select all while some matching tasks aren't chosen", () => {
    expect(selectAllOffer(3, false, 1579)).toBe(1579);
    expect(selectAllOffer(5, false, 5)).toBeNull();
    expect(selectAllOffer(1579, true, 1579)).toBeNull();
  });
});

describe("moving to a group", () => {
  it("says company tasks keep their companies", () => {
    expect(moveNote(0)).toBeNull();
    expect(moveNote(1)).toBe("The company task keeps its company.");
    expect(moveNote(2)).toBe("Company tasks keep their companies.");
  });

  it("confirms where they went", () => {
    expect(movedMessage(3, "Hiring")).toBe("Moved 3 tasks to Hiring.");
    expect(movedMessage(1, null)).toBe("Moved 1 task out of its group.");
    expect(movedMessage(2, null)).toBe("Moved 2 tasks out of their groups.");
  });
});
