"use client";

// Every change Companies makes (guide 5.3, 5.4): each saves itself and the toast offers Undo; a failure says what wasn't
// saved. The list, the row menu, the record and the dialogs all come through here, so they say the same things.
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCompaniesById, useNotes, useTasks } from "@/desk/DeskData";
import { over } from "@/desk/areas";
import type { PipelineEntry } from "@/lib/clientTypes";
import { changeMessage, isKeptInStep, moveMessage, movesToDealDone, type CompanyPatch, type FieldValue } from "@/lib/companyEdit";
import { followUpTaskFor, type CompanyGroup } from "@/lib/companies";
import type { CompanyField } from "@/lib/companySettings";
import { addTaskKeptInStep, deleteCompany, moveCompany, updateCompany, updateCompanyKeptInStep } from "@/lib/companyWrites";
import { failureMessage } from "@/lib/connection";
import { putBackDone, setTasksDone, type Undo } from "@/lib/taskWrites";
import type { Task } from "@/lib/types";
import { useToast } from "@/ui/Toaster";

export const FOLLOW_UP_FAILED = "Couldn’t create the follow-up task. Check your connection and try again.";

export function useCompanyActions() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const tasks = useTasks();
  const notes = useNotes();
  const byId = useCompaniesById();

  // A toast's Undo or Try again runs later: it reads the data as it is then, not as it was when the toast appeared.
  const latest = useRef({ tasks: tasks.rows, notes: notes.rows, byId });
  useEffect(() => {
    latest.current = { tasks: tasks.rows, notes: notes.rows, byId };
  });

  const undoing = useCallback(
    (undo: Undo) => () => void undo().catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true })),
    [toast]
  );

  const openOver = useCallback(
    (param: string) => router.push(over(pathname, window.location.search, param), { scroll: false }),
    [router, pathname]
  );

  // Moves a company to another group (5.10). Throws when it fails, so the move dialog can say so and keep what was typed.
  const move = useCallback(
    async (c: PipelineEntry, to: CompanyGroup, values: CompanyPatch) => {
      const { undo, tasksSwitchKind } = await moveCompany(c, to, values, latest.current.tasks);
      toast(moveMessage(c.company, to, tasksSwitchKind), { action: "Undo", onAction: undoing(undo) });
    },
    [toast, undoing]
  );

  // One field changed from a quick editor. Deal done as an Active company's status moves it to Deal done. Says whether it
  // was saved, so the editor can stay open with what was typed when it wasn't.
  const setValue = useCallback(
    async (c: PipelineEntry, field: Pick<CompanyField, "key" | "label">, value: FieldValue): Promise<boolean> => {
      try {
        if (movesToDealDone(c, field.key, value)) {
          await move(c, "dealDone", {});
          return true;
        }
        const patch = { [field.key]: value };
        let undo: Undo;
        let tasksChanged = 0;
        if (isKeptInStep(field.key)) ({ undo, tasksChanged } = await updateCompanyKeptInStep(c, patch, latest.current.tasks));
        else undo = await updateCompany(c, patch);
        toast(changeMessage(field.label, value === undefined, tasksChanged), { action: "Undo", onAction: undoing(undo) });
        return true;
      } catch (err) {
        toast(failureMessage(err, `${field.label} couldn't be saved. Check your connection and try again.`), { error: true });
        return false;
      }
    },
    [move, toast, undoing]
  );

  const rename = useCallback(
    async (c: PipelineEntry, name: string): Promise<boolean> => {
      try {
        const undo = await updateCompany(c, { company: name });
        toast("Company renamed", { action: "Undo", onAction: undoing(undo) });
        return true;
      } catch (err) {
        toast(failureMessage(err, "The new name couldn't be saved. Check your connection and try again."), { error: true });
        return false;
      }
    },
    [toast, undoing]
  );

  const logToday = useCallback((c: PipelineEntry, today: string) => setValue(c, { key: "date", label: "Last action" }, today), [setValue]);

  // A follow-up task (B11): Open goes straight to it; a failure offers Try again.
  const followUp = useCallback(
    async function followUp(c: PipelineEntry, today: string): Promise<void> {
      try {
        const { id } = await addTaskKeptInStep(followUpTaskFor(c, today), latest.current.byId, latest.current.tasks);
        toast(`Follow-up task created for ${c.company}`, { action: "Open", onAction: () => openOver(`task=${id}`) });
      } catch (err) {
        console.error("Couldn't create the follow-up task", err);
        toast(FOLLOW_UP_FAILED, { error: true, action: "Try again", onAction: () => void followUp(latest.current.byId.get(c.id) ?? c, today) });
      }
    },
    [toast, openOver]
  );

  // Deletes a company (B14). Throws when it fails, so the confirmation can stay.
  const remove = useCallback(
    async (c: PipelineEntry) => {
      await deleteCompany(c, latest.current.tasks, latest.current.notes);
      toast(`${c.company} deleted`);
    },
    [toast]
  );

  const setTaskDone = useCallback(
    async (task: Task, done: boolean) => {
      try {
        await setTasksDone([task], done);
        toast(done ? "Marked done" : "Moved back to open tasks", {
          action: "Undo",
          onAction: () => void putBackDone([task]).catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true })),
        });
      } catch (err) {
        toast(failureMessage(err, `The task couldn't be marked ${done ? "done" : "not done"}. Check your connection and try again.`), { error: true });
      }
    },
    [toast]
  );

  return useMemo(
    () => ({ setValue, rename, logToday, followUp, move, remove, setTaskDone, openOver }),
    [setValue, rename, logToday, followUp, move, remove, setTaskDone, openOver]
  );
}

export type CompanyActions = ReturnType<typeof useCompanyActions>;

// Where a company's qualification notes are: its notes when it has some, or a start on new ones (3.11 reads ?company=).
export function notesLink(c: PipelineEntry, notes: { id: string; pipelineEntryId?: number }[]): { href: string; label: string } {
  const own = notes.find((n) => n.pipelineEntryId === c.id);
  return own
    ? { href: `/notes/${encodeURIComponent(own.id)}`, label: "Qualification notes" }
    : { href: `/notes?company=${c.id}`, label: "Start qualification notes" };
}
