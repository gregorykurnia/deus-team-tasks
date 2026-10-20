"use client";

// A colleague's change to a flow shows "Changed just now" on the part that changed, for a minute (guide 3, 5.8). What
// this device wrote itself is remembered, so its own changes coming back from the data aren't taken for someone else's.
import { useEffect, useRef, useState } from "react";
import { changedParts, contentOf, sameContent, type FlowContent } from "@/lib/flows";
import type { Flow } from "@/lib/types";

const CHANGED_SHOWS_MS = 60_000;
const REMEMBERED = 30;

const ownWrites = new Map<string, FlowContent[]>();

export function rememberOwnWrite(flowId: string, content: FlowContent) {
  const list = ownWrites.get(flowId) ?? [];
  list.push(content);
  if (list.length > REMEMBERED) list.shift();
  ownWrites.set(flowId, list);
}

const isOwn = (f: Flow) => (ownWrites.get(f.id) ?? []).some((c) => sameContent(c, contentOf(f)));

// The parts ("head", "decision", or a step's or an outcome's id) a colleague changed in the last minute.
export function useChangedParts(flow: Flow): Set<string> {
  const prev = useRef(flow);
  const [changed, setChanged] = useState<Record<string, number>>({});

  useEffect(() => {
    const before = prev.current;
    prev.current = flow;
    if (before === flow || before.id !== flow.id || isOwn(flow)) return;
    const parts = changedParts(before, flow);
    if (!parts.length) return;
    const at = Date.now();
    setChanged((now) => ({ ...now, ...Object.fromEntries(parts.map((p) => [p, at])) }));
  }, [flow]);

  useEffect(() => {
    const times = Object.values(changed);
    if (!times.length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setChanged((c) => Object.fromEntries(Object.entries(c).filter(([, at]) => now - at < CHANGED_SHOWS_MS)));
    }, Math.max(0, Math.min(...times) + CHANGED_SHOWS_MS - Date.now()));
    return () => clearTimeout(t);
  }, [changed]);

  return new Set(Object.keys(changed));
}
