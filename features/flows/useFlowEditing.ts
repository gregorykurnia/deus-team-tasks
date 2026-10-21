"use client";

// Editing a flow (guide 5.3, 6.8, D-018): every change saves on its own. Text saves 0.8s after typing stops and at once
// when the field is left; a change to the structure (a step added, moved or removed, a role, the decision, an outcome)
// saves at once.
//
// What's typed is kept here, apart from the data, while its field has focus or the typing isn't saved yet, so a new
// version of the flow arriving never drops keys typed fast (the old screen did, R1). A change is shown at once and the
// next one builds on it, even before the data has caught up. Each change is saved as a function of the flow, made on
// the newest version in the data, so a colleague's change in between is kept.
//
// Flows are read only with no connection: typing kept when the connection goes is held until it's back, then saved.
// A write that's refused or fails says what wasn't saved and keeps what was typed, with Try again; the save line says
// "Not saved" until it's made. The editor's Undo toasts go when it closes; a Try again for typing pressed after that
// still saves, on the newest version, unless newer typing in that field has saved since (then it's taken back).
// A write that fails after a later write already carried newer typing for the same field doesn't bring its older
// words back, so they can never be saved over the newer ones.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { failureMessage } from "@/lib/connection";
import { applyChange, contentOf, replayable, textAt, withText, type FlowChange, type FlowTextKey } from "@/lib/flows";
import { changeFlow } from "@/lib/flowWrites";
import { nextOfferOrder, offerTyping, supersede } from "@/lib/staleOffers";
import type { Flow } from "@/lib/types";
import { useToast } from "@/ui/Toaster";
import { rememberOwnWrite } from "./flowChanges";

export const SAVE_WAIT_MS = 800;
const FAILED = "The flow couldn’t be saved. Check your connection and try again.";

type Toast = ReturnType<typeof useToast>;

// A flow deleted meanwhile is the screen's to explain.
const isGone = (err: unknown) => (err as { code?: string })?.code === "not-found";

// A change from an editor that has closed (an Undo or Try again pressed later), made on the flow as it is in the data.
function saveAway(flowId: string, anyChange: FlowChange, toast: Toast) {
  const change = replayable(anyChange);
  changeFlow(flowId, change).catch((err) => {
    if (isGone(err)) return;
    console.error("The flow couldn't be saved", err);
    toast(failureMessage(err, FAILED), { error: true, keep: true, action: "Try again", onAction: () => saveAway(flowId, change, toast) });
  });
}

// The save line: "Saving…", "Saved", "Not saved" (with Try again), or with no connection "Editing needs a connection",
// or, while typing waits for it, "kept".
export type SaveState = "saving" | "saved" | "failed" | "offline" | "kept";

export interface FlowEditing {
  shown: Flow; // the flow with this device's changes that the data hasn't caught up with yet
  text: (key: FlowTextKey) => string;
  type: (key: FlowTextKey, value: string) => void;
  focus: (key: FlowTextKey) => void;
  blur: (key: FlowTextKey) => void;
  setText: (key: FlowTextKey, value: string) => void; // a pick (a role label from the list): saves at once
  change: (mutate: FlowChange) => void;
  leave: () => void; // leaving editing: what's typed is saved now, or offered with Try again if it can't be
  retry: () => void; // what wasn't saved, again
  state: SaveState;
}

interface Failure {
  after: number; // the writes started before it failed; one started later carries its typing again
  typedOnly: boolean;
  retry: () => void;
}

export function useFlowEditing(flow: Flow, online: boolean): FlowEditing {
  const toast = useToast();
  const flowRef = useRef(flow);
  const onlineRef = useRef(online);
  useLayoutEffect(() => {
    flowRef.current = flow;
    onlineRef.current = online;
  }, [flow, online]);
  const mounted = useRef(false);

  // Written by this device and not yet confirmed: shown, and built on by the next change.
  const [ahead, setAhead] = useState<Flow | null>(null);
  const aheadRef = useRef<Flow | null>(null);
  const writes = useRef(0);
  const lastCarried = useRef(new Map<FlowTextKey, number>()); // the newest write that carried each field's typing
  const caughtUp = useRef<{ write: number; at: number } | null>(null); // saved, shown until the data has it
  const [inFlight, setInFlight] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);

  const [drafts, setDrafts] = useState<Record<FlowTextKey, string>>({});
  const draftsRef = useRef(drafts);
  const dirty = useRef(new Set<FlowTextKey>()); // typed since the last save
  const focused = useRef<FlowTextKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [waiting, setWaiting] = useState(false); // typing not yet handed to a save (with no connection, until it's back)

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

  const flushRef = useRef<(leaving?: boolean) => void>(() => {});
  const changeRef = useRef<(mutate: FlowChange, replaces?: Failure) => void>(() => {});

  const write = useCallback(
    (anyChange: FlowChange, typed: FlowTextKey[], mutate: FlowChange | undefined, replaces?: Failure) => {
      const flowId = flowRef.current.id;
      const startedAt = nextOfferOrder(); // offers made before this write started are older than its typing
      const change = replayable(anyChange);
      const { flow: next, patch } = applyChange(base(), change);
      if (Object.keys(patch).length === 0) {
        if (replaces) setFailures((list) => list.filter((f) => f !== replaces));
        return;
      }
      rememberOwnWrite(flowId, contentOf(next));
      aheadRef.current = next;
      setAhead(next);
      const mine = ++writes.current;
      for (const k of typed) lastCarried.current.set(k, mine);
      setInFlight((n) => n + 1);
      const latest = () => writes.current === mine;
      const drop = () => {
        caughtUp.current = null;
        aheadRef.current = null;
        setAhead(null);
      };
      changeFlow(flowId, change)
        .then((at) => {
          supersede(flowId, typed, startedAt);
          setFailures((list) => list.filter((f) => f !== replaces && !(f.typedOnly && f.after < mine)));
          // The data has this write once a version at least as new arrives (it may have already).
          if (!latest()) return;
          if (at === null || (flowRef.current.updatedAt ?? 0) >= at) drop();
          else caughtUp.current = { write: mine, at };
        })
        .catch((err) => {
          if (latest()) drop();
          if (isGone(err)) return;
          console.error("The flow couldn't be saved", err);
          // Fields a later write carried hold newer typing: that write saves it, or fails with its own Try again.
          const own = typed.filter((k) => (lastCarried.current.get(k) ?? 0) <= mine);
          if (!mutate && !own.length) return;
          // What was typed comes back into its field, still to be saved.
          if (own.length) {
            const back = { ...draftsRef.current };
            for (const k of own) {
              const v = textAt(next, k);
              if (v !== undefined && !(k in back)) back[k] = v;
              if (v !== undefined) dirty.current.add(k);
            }
            setDraftsBoth(back);
          }
          // Pressed while editing, Try again saves what's typed now; once the editor has closed, this change, with only
          // the typing no later write carried.
          const ownValues = own.flatMap((k) => {
            const v = textAt(next, k);
            return v === undefined ? [] : [[k, v] as const];
          });
          const retryChange: FlowChange = (f) => {
            let out = f;
            for (const [k, v] of ownValues) out = withText(out, k, v);
            return mutate ? mutate(out) : out;
          };
          const failure: Failure = {
            after: writes.current,
            typedOnly: !mutate,
            retry: () => {
              if (!mounted.current) saveAway(flowId, retryChange, toast);
              else if (mutate) changeRef.current(mutate, failure);
              else flushRef.current();
            },
          };
          setFailures((list) => [...list, failure]);
          const id = toast(failureMessage(err, FAILED), { error: true, keep: true, action: "Try again", onAction: failure.retry });
          if (own.length) offerTyping(flowId, own, () => toast.dismiss(id));
        })
        .finally(() => setInFlight((n) => n - 1));
    },
    [toast, setDraftsBoth]
  );

  // Hands every unsaved draft to one write, with a change to the structure if there is one.
  const save = useCallback(
    (mutate?: FlowChange, replaces?: Failure) => {
      clearTimeout(timer.current);
      setWaiting(false);
      const typed = [...dirty.current];
      dirty.current.clear();
      const values = typed.map((k) => [k, draftsRef.current[k] ?? ""] as const);
      const change: FlowChange = (f) => {
        let next = f;
        for (const [k, v] of values) next = withText(next, k, v);
        return mutate ? mutate(next) : next;
      };
      keepOnlyBusyDrafts();
      write(change, typed, mutate, replaces);
    },
    [keepOnlyBusyDrafts, write]
  );

  // Typing saves now, or with no connection waits for it, unless editing is being left (then a refused save offers Try
  // again, with what was typed).
  const flush = useCallback(
    (leaving = false) => {
      if (!dirty.current.size) {
        clearTimeout(timer.current);
        setWaiting(false);
        setFailures((list) => (list.some((f) => f.typedOnly) ? list.filter((f) => !f.typedOnly) : list));
      } else if (leaving || onlineRef.current) save();
      else clearTimeout(timer.current);
    },
    [save]
  );
  const change = useCallback(
    (mutate: FlowChange, replaces?: Failure) => {
      if (mounted.current) save(mutate, replaces);
      else saveAway(flowRef.current.id, mutate, toast); // an Undo from an editor that has closed
    },
    [save, toast]
  );
  useLayoutEffect(() => {
    flushRef.current = flush;
    changeRef.current = change;
  }, [flush, change]);

  // Leaving editing, the page or the app saves what's typed.
  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onUnload = () => flushRef.current();
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onHide);
      flushRef.current(true);
      mounted.current = false;
    };
  }, []);

  // Back online: typing kept meanwhile is saved.
  useEffect(() => {
    if (online && dirty.current.size) flushRef.current();
  }, [online]);

  // A new version of the flow: once it has what this device saved, it's shown instead. Drafts for fields that aren't busy
  // go, and so do those whose part is gone.
  useEffect(() => {
    const saved = caughtUp.current;
    if (saved && saved.write === writes.current && (flow.updatedAt ?? 0) >= saved.at) {
      caughtUp.current = null;
      aheadRef.current = null;
      setAhead(null);
    }
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
  const state: SaveState = !online
    ? waiting || failures.some((f) => f.typedOnly)
      ? "kept"
      : "offline"
    : waiting || inFlight > 0
      ? "saving"
      : failures.length
        ? "failed"
        : "saved";

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
      setWaiting(true);
      flush();
    },
    change,
    leave: () => flush(true),
    retry: () => failures.forEach((f) => f.retry()),
    state,
  };
}
