// Whether the app is connected, and when its data was last loaded (A3, guide 5.8).
//
// Online means the browser says so, and the data sources haven't fallen back
// to the device's copy after reaching the server. Writes are refused while
// offline with an OfflineError, except qualification notes, which Firestore
// keeps on the device and saves once the connection is back (D-014).
import { useSyncExternalStore } from "react";

export type Source = "tasks" | "taskGroups" | "flows" | "companies" | "notes" | "pastClients" | "settings";

interface SourceState {
  fromCache: boolean;
  reachedServer: boolean;
}

export interface ConnectionState {
  online: boolean;
  loadedAt: number | null; // when data last came from the server, kept between visits
}

const LOADED_AT_KEY = "deus.connection.loadedAt";

const sources = new Map<Source, SourceState>();
const listeners = new Set<() => void>();
let loadedAt: number | null = readLoadedAt();
let snapshot: ConnectionState = compute();

function readLoadedAt(): number | null {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(LOADED_AT_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function browserOnline(): boolean {
  return typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine;
}

function compute(): ConnectionState {
  const reached = [...sources.values()].filter((s) => s.reachedServer);
  const fellBack = reached.length > 0 && reached.every((s) => s.fromCache);
  return { online: browserOnline() && !fellBack, loadedAt };
}

function update() {
  const next = compute();
  if (next.online === snapshot.online && next.loadedAt === snapshot.loadedAt) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

// Every live subscription calls this with its snapshot's metadata. Subscribe
// with includeMetadataChanges, so going offline and back shows up.
export function reportSnapshot(source: Source, fromCache: boolean, now = Date.now()) {
  const prev = sources.get(source);
  sources.set(source, { fromCache, reachedServer: (prev?.reachedServer ?? false) || !fromCache });
  if (!fromCache) {
    loadedAt = now;
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(LOADED_AT_KEY, String(now));
    } catch {
      // Storage unavailable: the time is kept for this visit only.
    }
  }
  update();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
}

export function getConnection(): ConnectionState {
  return snapshot;
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: ConnectionState = { online: true, loadedAt: null };

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribeConnection, getConnection, () => SERVER_STATE);
}

// A write refused because there's no connection. The message says what
// wasn't saved ("No connection. The task wasn't added.").
export class OfflineError extends Error {
  constructor(message = "No connection. The change wasn't saved.") {
    super(message);
    this.name = "OfflineError";
  }
}

export function assertOnline(message?: string): void {
  update(); // the browser's own flag may have changed without an event yet
  if (!snapshot.online) throw new OfflineError(message);
}

// For tests: forget what the sources reported.
export function resetConnection() {
  sources.clear();
  loadedAt = readLoadedAt();
  snapshot = compute();
}
