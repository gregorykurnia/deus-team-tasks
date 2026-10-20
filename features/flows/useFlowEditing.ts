"use client";

// Editing a flow (guide 5.3, 6.8, D-018): every change saves on its own. Text saves 0.8s after typing stops and at once
// when the field is left; a change to the structure (a step added, moved or removed, a role, the decision, an outcome)
// saves at once.
//
// What's typed is kept here, apart from the data, while its field has focus or the typing isn't saved yet, so a new
// version of the flow arriving never drops keys typed fast (the old screen did, R1). A change is shown at once and the
// next one builds on it, even before the data has caught up. Flows are read only with no connection: a write refused
// then, or one that fails, says what wasn't saved and keeps what was typed, with Try again.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { failureMessage } from "@/lib/connection";
import { contentOf, contentPatch, textAt, withText, type FlowTextKey } from "@/lib/flows";
import { updateFlow } from "@/lib/flowWrites";
import type { Flow } from "@/lib/types";
import { useToast } from "@/ui/Toaster";
import { rememberOwnWrite } from "./flowChanges";

export const SAVE_WAIT_MS = 800;

export interface FlowEditing {
  shown: Flow; // the flow with this device's changes that the data hasn't caught up with yet
  text: (key: FlowTextKey) => string;
  type: (key: FlowTextKey, value: string) => void;
  focus: (key: FlowTextKey) => void;
  blur: (key: FlowTextKey) => void;
  setText: (key: FlowTextKey, value: string) => void; // a pick (a role label from the list): saves at once
  change: (mutate: (f: Flow) => Flow) => void;
  flush: () => void;
  saving: boolean;
}

export function useFlowEditing(flow: Flow): FlowEditing {
  const toast = useToast();
  const flowRef = useRef(flow);
  useLayoutEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  // Written by this device and not yet confirmed: shown, and built on by the next change.
  const [ahead, setAhead] = useState<Flow | null>(null);
  const aheadRef = useRef<Flow | null>(null);
  const writes = useRef(0);
  const [inFlight, setInFlight] = useState(0);

  const [drafts, setDrafts] = useState<Record<FlowTextKey, string>>({});
  const draftsRef = useRef(drafts);
  const dirty = useRef(new Set<FlowTextKey>()); // typed since the last save
  const focused = useRef<FlowTextKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [waiting, setWaiting] = useState(false); // typing not yet handed to the save

  const setDraftsBoth = useCallback((next: Record<FlowTextKey, string>) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const base = () => aheadRef.current ?? flowRef.current;

  // Drafts only matter while a field has focus or unsaved typing; the rest are in what was just written.
  const keepOnlyBusyDrafts = useCallback(() => {
    const keep = Object.fromEntries(Object.entries(draftsRef.current).filter(([k]) => k === focused.current || dirty.current.has(k)));
    if (Object.keys(keep).length !== Object.keys(draftsRef.current).length) setDraftsBoth(keep);
  }, [setDraftsBoth]);

  const flushRef = useRef<() => void>(() => {});
  const changeRef = useRef<(mutate: (f: Flow) => Flow) => void>(() => {});

  const write = useCallback(
    (next: Flow, typed: FlowTextKey[], retry: () => void) => {
      const before = base();
      const patch = contentPatch(before, next);
      if (Object.keys(patch).length === 0) return;
      rememberOwnWrite(next.id, contentOf(next));
      aheadRef.current = next;
      setAhead(next);
      const mine = ++writes.current;
      setInFlight((n) => n + 1);
      updateFlow(next.id, patch)
        .catch((err) => {
          // A flow deleted meanwhile is the screen's to explain.
          if ((err as { code?: string })?.code === "not-found") return;
          console.error("The flow couldn't be saved", err);
          // What was typed comes back into its field, still to be saved.
          if (typed.length) {
            const back = { ...draftsRef.current };
            for (const k of typed) {
              const v = textAt(next, k);
              if (v !== undefined && !(k in back)) back[k] = v;
              if (v !== undefined) dirty.current.add(k);
            }
            setDraftsBoth(back);
          }
          toast(failureMessage(err, "The flow couldn’t be saved. Check your connection and try again."), {
            error: true,
            keep: true,
            action: "Try again",
            onAction: retry,
          });
        })
        .finally(() => {
          setInFlight((n) => n - 1);
          if (writes.current === mine) {
            aheadRef.current = null;
            setAhead(null);
          }
        });
    },
    [toast, setDraftsBoth]
  );

  // Hands every unsaved draft to one write, with a change to the structure if there is one.
  const save = useCallback(
    (mutate?: (f: Flow) => Flow) => {
      clearTimeout(timer.current);
      setWaiting(false);
      const typed = [...dirty.current];
      dirty.current.clear();
      let next = base();
      for (const k of typed) next = withText(next, k, draftsRef.current[k] ?? "");
      if (mutate) next = mutate(next);
      keepOnlyBusyDrafts();
      write(next, typed, mutate ? () => changeRef.current(mutate) : () => flushRef.current());
    },
    [keepOnlyBusyDrafts, write]
  );

  const flush = useCallback(() => {
    if (dirty.current.size) save();
    else {
      clearTimeout(timer.current);
      setWaiting(false);
    }
  }, [save]);
  const change = useCallback((mutate: (f: Flow) => Flow) => save(mutate), [save]);
  useLayoutEffect(() => {
    flushRef.current = flush;
    changeRef.current = change;
  }, [flush, change]);

  // Leaving editing, the page or the app saves what's typed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onUnload = () => flushRef.current();
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onHide);
      flushRef.current();
    };
  }, []);

  // A new version of the flow: drafts for fields that aren't busy go, and so do those whose part is gone.
  useEffect(() => {
    const next = { ...draftsRef.current };
    let dropped = false;
    for (const k of Object.keys(next)) {
      if (textAt(flow, k) === undefined && !(aheadRef.current && textAt(aheadRef.current, k) !== undefined)) {
        delete next[k];
        dirty.current.delete(k);
        dropped = true;
      } else if (k !== focused.current && !dirty.current.has(k)) {
        delete next[k];
        dropped = true;
      }
    }
    if (dropped) setDraftsBoth(next);
  }, [flow, setDraftsBoth]);

  const shown = ahead ?? flow;

  return {
    shown,
    text: (k) => drafts[k] ?? textAt(shown, k) ?? "",
    type(k, v) {
      setDraftsBoth({ ...draftsRef.current, [k]: v });
      dirty.current.add(k);
      setWaiting(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flushRef.current(), SAVE_WAIT_MS);
    },
    focus(k) {
      focused.current = k;
      if (!(k in draftsRef.current)) setDraftsBoth({ ...draftsRef.current, [k]: textAt(base(), k) ?? "" });
    },
    blur(k) {
      if (focused.current === k) focused.current = null;
      flush();
      if (!dirty.current.has(k) && k in draftsRef.current) {
        const next = { ...draftsRef.current };
        delete next[k];
        setDraftsBoth(next);
      }
    },
    setText(k, v) {
      setDraftsBoth({ ...draftsRef.current, [k]: v });
      dirty.current.add(k);
      flush();
    },
    change,
    flush,
    saving: waiting || inFlight > 0,
  };
}
