"use client";

// Live changes (A1, guide 3 and 5.8): what just arrived, by anyone, so a screen can glow it and a colleague's change can
// say "Just changed". A source's snapshots feed this (lib/liveQuery.ts); rows read their own state, so only the row that
// changed draws again. Your own change glows for 1.8s; a colleague's glows and keeps its tag for 30s. When a lot of a
// colleague's changes arrive at once, one toast says so (N2: nobody signs in, so it can't name who).
import { useMemo, useSyncExternalStore } from "react";
import type { Source } from "./connection";

export type Arrival = "none" | "glow" | "changed" | "added"; // glow: yours · changed, added: a colleague's

export const GLOW_MS = 1800; // --dur-arrive
export const TAG_MS = 30_000;
export const MANY_CHANGES = 5; // a colleague's changes inside one burst that make a toast
export const BURST_MS = 400; // changes this close together are one burst
export const TOAST_GAP_MS = 15_000; // the most one toast in this time
export const BULK_LIMIT = 150; // a burst this large (an import, a bulk edit) says so once and marks nothing

interface Entry {
  glow: boolean;
  tag: "changed" | "added" | null;
  glowTimer: ReturnType<typeof setTimeout> | null;
  tagTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const manyListeners = new Set<() => void>();
let burst = 0;
let burstTimer: ReturnType<typeof setTimeout> | null = null;
let lastToast = -Infinity;

const key = (source: Source, id: string) => `${source}:${id}`;
const notify = () => listeners.forEach((l) => l());

function arrivalOf(e: Entry | undefined): Arrival {
  if (!e) return "none";
  if (e.tag) return e.tag;
  return e.glow ? "glow" : "none";
}

function drop(k: string, e: Entry) {
  if (!e.glow && !e.tag) entries.delete(k);
}

function mark(k: string, tag: "changed" | "added" | null) {
  const e = entries.get(k) ?? { glow: false, tag: null, glowTimer: null, tagTimer: null };
  entries.set(k, e);
  e.glow = true;
  if (e.glowTimer) clearTimeout(e.glowTimer);
  e.glowTimer = setTimeout(() => {
    e.glow = false;
    e.glowTimer = null;
    drop(k, e);
    notify();
  }, GLOW_MS);
  if (tag) {
    // A change to something that was added a moment ago is still new.
    e.tag = e.tag === "added" ? "added" : tag;
    if (e.tagTimer) clearTimeout(e.tagTimer);
    e.tagTimer = setTimeout(() => {
      e.tag = null;
      e.tagTimer = null;
      drop(k, e);
      notify();
    }, TAG_MS);
  }
}

// A write made in a transaction has no pending stage on this device: it arrives only with the server's snapshot, looking
// like anyone's. Such a write says so first, so its change counts as this device's for a short while.
const OWN_WINDOW_MS = 15_000;
const expected = new Map<string, number>(); // source:id → until when

export function expectOwnWrite(source: Source, id: string): void {
  const now = Date.now();
  expected.forEach((until, k) => {
    if (until < now) expected.delete(k);
  });
  expected.set(key(source, id), now + OWN_WINDOW_MS);
}

export function isExpectedOwn(source: Source, id: string): boolean {
  const until = expected.get(key(source, id));
  return until !== undefined && until >= Date.now();
}

// The documents of one snapshot that changed. A bulk change marks nothing: a hundred rows lighting up says less than one
// toast.
export function noteChanges(source: Source, changes: { own: string[]; added: string[]; changed: string[] }): void {
  const theirs = changes.added.length + changes.changed.length;
  if (changes.own.length + theirs > BULK_LIMIT) {
    if (theirs > 0) noteBurst(theirs);
    return;
  }
  changes.own.forEach((id) => mark(key(source, id), null));
  changes.added.forEach((id) => mark(key(source, id), "added"));
  changes.changed.forEach((id) => mark(key(source, id), "changed"));
  if (changes.own.length + theirs > 0) notify();
  if (theirs > 0) noteBurst(theirs);
}

function noteBurst(count: number) {
  burst += count;
  if (burstTimer) return;
  burstTimer = setTimeout(() => {
    burstTimer = null;
    const n = burst;
    burst = 0;
    const now = Date.now();
    if (n >= MANY_CHANGES && now - lastToast >= TOAST_GAP_MS) {
      lastToast = now;
      manyListeners.forEach((l) => l());
    }
  }, BURST_MS);
}

// The many-changes toast: called once when a burst of a colleague's changes was large.
export function onManyChanges(listener: () => void): () => void {
  manyListeners.add(listener);
  return () => manyListeners.delete(listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// What this one thing's screen should show. Reads only its own entry, so a row draws again only when it changes.
export function useArrival(source: Source, id: string | null | undefined): Arrival {
  return useSyncExternalStore(
    subscribe,
    () => (id ? arrivalOf(entries.get(key(source, id))) : "none"),
    () => "none"
  );
}

// Several ids at once (a parent and its subsidiaries): the ids that are glowing, as one string so it compares by value.
export function useArrivals(source: Source): ReadonlyMap<string, Arrival> {
  const text = useSyncExternalStore(
    subscribe,
    () => {
      const out: string[] = [];
      entries.forEach((e, k) => {
        if (k.startsWith(`${source}:`)) out.push(`${arrivalOf(e)}${k.slice(source.length + 1)}`);
      });
      return out.sort().join("\n");
    },
    () => ""
  );
  return useMemo(() => parseArrivals(text), [text]);
}

const PREFIXES: [string, Arrival][] = [
  ["changed", "changed"],
  ["added", "added"],
  ["glow", "glow"],
];

function parseArrivals(text: string): ReadonlyMap<string, Arrival> {
  const map = new Map<string, Arrival>();
  if (!text) return map;
  for (const line of text.split("\n")) {
    const hit = PREFIXES.find(([p]) => line.startsWith(p));
    if (hit) map.set(line.slice(hit[0].length), hit[1]);
  }
  return map;
}

export const isTagged = (a: Arrival) => a === "changed" || a === "added";

// For tests: the subscription the hooks use, without React.
export const subscribeLive = subscribe;

// For tests.
export function resetLiveChanges(): void {
  entries.forEach((e) => {
    if (e.glowTimer) clearTimeout(e.glowTimer);
    if (e.tagTimer) clearTimeout(e.tagTimer);
  });
  entries.clear();
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = null;
  burst = 0;
  lastToast = -Infinity;
  manyListeners.clear();
  expected.clear();
  notify();
}
