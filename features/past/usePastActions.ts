"use client";

// Every change Past clients makes (guide 6.7, 5.3, 5.4, R9). A change made in place saves itself and the toast offers
// Undo; when it fails, an error toast says what wasn't saved, with Try again. Adding, moving and deleting throw instead,
// so their dialog can stay with what was typed. Undo and Try again read the record as it is when they're pressed.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePastClients } from "@/desk/DeskData";
import { failureMessage } from "@/lib/connection";
import { addedMessage, countMessage } from "@/lib/pastEdit";
import { canonicalSector, sectorOf, sectorSpellings, type HistoricalClient } from "@/lib/pastClients";
import { normalizeSectorKey } from "@/lib/historicalClientTypes";
import {
  addPastClient,
  deletePastClient,
  movePastClient,
  renamePastClient,
  setCounted,
  setPastClientSector,
} from "@/lib/pastClientWrites";
import type { Undo } from "@/lib/taskWrites";
import { useToast } from "@/ui/Toaster";

export interface NewPastClient {
  name: string;
  sector: string; // as typed; saved in the spelling already in use
  parentId: string | null;
  counted: boolean;
}

export function usePastActions(glow: (id: string) => void) {
  const toast = useToast();
  const past = usePastClients();
  const latest = useRef(past.rows);
  useEffect(() => {
    latest.current = past.rows;
  });

  const fresh = useCallback((c: HistoricalClient) => latest.current.find((x) => x.id === c.id) ?? c, []);
  const nameOf = useCallback((id: string | null) => latest.current.find((x) => x.id === id)?.name ?? "", []);

  const undoing = useCallback(
    (undo: Undo, id: string) => () =>
      void undo().then(
        () => glow(id),
        (err) => toast(failureMessage(err, "The change couldn’t be undone. Check your connection and try again."), { error: true })
      ),
    [toast, glow]
  );

  // One change in place. `run` reads the record afresh, so Try again works on what's there now.
  const inPlace = useCallback(
    async function inPlace(id: string, failed: string, run: () => Promise<{ undo: Undo; message: string }>): Promise<void> {
      try {
        const { undo, message } = await run();
        glow(id);
        toast(message, { action: "Undo", onAction: undoing(undo, id) });
      } catch (err) {
        toast(failureMessage(err, `Couldn’t save ${failed}. Please try again.`), { error: true, action: "Try again", onAction: () => void inPlace(id, failed, run) });
      }
    },
    [toast, glow, undoing]
  );

  const rename = useCallback(
    (c: HistoricalClient, name: string) =>
      inPlace(c.id, "the new name", async () => ({ undo: await renamePastClient(fresh(c), name), message: "Renamed" })),
    [inPlace, fresh]
  );

  const setSector = useCallback(
    (c: HistoricalClient, typed: string) =>
      inPlace(c.id, "the sector", async () => {
        const spellings = sectorSpellings(latest.current);
        const saved = canonicalSector(typed, spellings);
        return { undo: await setPastClientSector(fresh(c), typed, spellings), message: saved ? `Sector set to ${saved}` : "Sector cleared" };
      }),
    [inPlace, fresh]
  );

  const toggleCount = useCallback(
    (p: HistoricalClient) =>
      inPlace(p.id, "the change", async () => {
        const now = fresh(p);
        const message = countMessage(now, latest.current, !now.countHead);
        return { undo: await setCounted(now, !now.countHead), message };
      }),
    [inPlace, fresh]
  );

  // The sector a new subsidiary takes from its parent, as the record shows it.
  const parentSector = useCallback((parentId: string) => {
    const byId = new Map(latest.current.map((c) => [c.id, c]));
    const parent = byId.get(parentId);
    const sector = parent ? sectorOf(parent, byId) : "";
    return sector ? (sectorSpellings(latest.current).get(normalizeSectorKey(sector)) ?? sector) : "";
  }, []);

  // Adds a past client from the dialog. Throws when it fails, so the dialog keeps what was typed.
  const add = useCallback(
    async (input: NewPastClient): Promise<string> => {
      const sector = canonicalSector(input.sector, sectorSpellings(latest.current));
      const id = await addPastClient({ name: input.name, parentId: input.parentId, sector, countHead: input.parentId ? true : input.counted });
      glow(id);
      const removeIt = async () => {
        const added = latest.current.find((x) => x.id === id);
        if (added) await deletePastClient(added, latest.current);
      };
      toast(addedMessage(input.name.trim(), input.parentId ? nameOf(input.parentId) : undefined), {
        action: "Undo",
        onAction: () => void removeIt().catch((err) => toast(failureMessage(err, "It couldn’t be taken off again. Check your connection and try again."), { error: true })),
      });
      return id;
    },
    [toast, glow, nameOf]
  );

  // "Add a subsidiary" inside an open parent: a name and Enter, with the parent's sector. A failure keeps the name in the
  // line, and Try again adds it; `added` lets the line empty itself once it's in.
  const quickAdd = useCallback(
    async function quickAdd(p: HistoricalClient, name: string, added: (name: string) => void): Promise<boolean> {
      try {
        await add({ name, sector: parentSector(p.id), parentId: p.id, counted: true });
        added(name);
        return true;
      } catch (err) {
        toast(failureMessage(err, `Couldn’t add ${name}. Please try again.`), { error: true, action: "Try again", onAction: () => void quickAdd(fresh(p), name, added) });
        return false;
      }
    },
    [add, parentSector, toast, fresh]
  );

  // Moves a subsidiary to another parent company. Throws when it fails, so the dialog can say so.
  const move = useCallback(
    async (sub: HistoricalClient, parentId: string) => {
      const undo = await movePastClient(fresh(sub), parentId);
      glow(sub.id);
      toast(`${sub.name} moved to ${nameOf(parentId)}`, { action: "Undo", onAction: undoing(undo, sub.id) });
    },
    [toast, glow, undoing, fresh, nameOf]
  );

  // Deletes a past client after the confirmation. Throws when it fails, so the confirmation can say so.
  const remove = useCallback(
    async (c: HistoricalClient) => {
      const undo = await deletePastClient(fresh(c), latest.current);
      toast(`${c.name} deleted`, { action: "Undo", onAction: undoing(undo, c.id) });
    },
    [toast, undoing, fresh]
  );

  return useMemo(
    () => ({ rename, setSector, toggleCount, add, quickAdd, parentSector, move, remove }),
    [rename, setSector, toggleCount, add, quickAdd, parentSector, move, remove]
  );
}

export type PastActions = ReturnType<typeof usePastActions>;
