// Selecting several tasks (guide 4.7, D-008). What's chosen is the ids ticked that are still in the list, or every task
// matching the view once "Select all" is used, so a filter change never acts on tasks that can't be seen.
import { plural } from "./dates";

export interface Selection {
  ids: ReadonlySet<string>;
  all: boolean; // every task matching the view, not only the ones on screen
}

export const NO_SELECTION: Selection = { ids: new Set(), all: false };

// "Select all" remembers the tasks it took in, so a change of view can let go of the rest (viewChanged).
export const selectAll = (listIds: string[]): Selection => ({ ids: new Set(listIds), all: true });

// Another filter, kind or search never widens "Select all" to tasks it didn't take in: what stays chosen is the tasks
// selected then that the new view still shows.
export const viewChanged = (selection: Selection): Selection => (selection.all ? { ids: selection.ids, all: false } : selection);

// In the list's order.
export function chosenIds(selection: Selection, listIds: string[]): string[] {
  return selection.all ? listIds : listIds.filter((id) => selection.ids.has(id));
}

export function toggleChosen(selection: Selection, id: string, listIds: string[]): Selection {
  const ids = new Set(selection.all ? listIds : selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, all: false };
}

// The head checkbox speaks for the rows on screen: ticked when each of them is, mixed when some are.
export function headState(selection: Selection, shownIds: string[], listIds: string[]): boolean | "mixed" {
  const chosen = new Set(chosenIds(selection, listIds));
  const picked = shownIds.filter((id) => chosen.has(id)).length;
  if (picked > 0 && picked === shownIds.length) return true;
  return chosen.size > 0 ? "mixed" : false;
}

// Ticking the head adds every row on screen; when they're all ticked already, it clears the selection.
export function toggleHead(selection: Selection, shownIds: string[], listIds: string[]): Selection {
  if (headState(selection, shownIds, listIds) === true) return NO_SELECTION;
  return { ids: new Set([...chosenIds(selection, listIds), ...shownIds]), all: false };
}

const num = (n: number) => n.toLocaleString("en-GB");

// "Choose tasks", "3 selected", "All 1,579 selected".
export function selectedLine(chosen: number, all: boolean): string {
  if (chosen === 0) return "Choose tasks";
  return all && chosen > 1 ? `All ${num(chosen)} selected` : `${num(chosen)} selected`;
}

// "Select all 1,579" is offered while some matching tasks aren't chosen.
export function selectAllOffer(chosen: number, all: boolean, total: number): number | null {
  return !all && total > chosen ? total : null;
}

// Only internal work goes in task groups: the move menu says what happens to company tasks in the selection.
export function moveNote(companyTasks: number, total: number): string | null {
  if (companyTasks === 0) return null;
  if (companyTasks === total)
    return total === 1 ? "Only internal work goes in task groups. This task belongs to a company." : "Only internal work goes in task groups. These tasks belong to companies.";
  return `${plural(companyTasks, "company task")} will stay with ${companyTasks === 1 ? "its company" : "their companies"}.`;
}

// The confirmation after a move: "Moved 3 tasks to Hiring. 1 company task stayed put."
export function movedMessage(moved: number, group: string | null, companyTasks: number): string {
  const where = group ? `to ${group}` : moved === 1 ? "out of its group" : "out of their groups";
  return `Moved ${plural(moved, "task")} ${where}${companyTasks ? `. ${plural(companyTasks, "company task")} stayed put.` : "."}`;
}
