// Whether the app is connected, and when its data was last loaded (A3, guide 5.8).
//
// Live means the browser says it's online, a data source has reached the
// server, and the sources that did haven't fallen back to the device's copy.
// Until a source reaches the server the app is connecting; if none does within
// CONNECT_GRACE_MS (a cold start with the server unreachable, where nothing can
// "fall back"), it's offline. Writes are refused unless live, with an
// OfflineError, except qualification notes, which Firestore keeps on the
// device and saves once the connection is back (D-014).
import { useSyncExternalStore } from "react";

export type Source = "tasks" | "taskGroups" | "flows" | "companies" | "notes" | "pastClients" | "settings";

interface SourceState {
  fromCache: boolean;
  reachedServer: boolean;
}

export type ConnectionStatus = "connecting" | "live" | "offline";

export interface ConnectionState {
  status: ConnectionStatus;
  online: boolean; // live: writes can be saved
  loadedAt: number | null; // when data last came from the server, kept between visits
}

const LOADED_AT_KEY = "deus.connection.loadedAt";
export const CONNECT_GRACE_MS = 8000;

const sources = new Map<Source, SourceState>();
const listeners = new Set<() => void>();
let loadedAt: number | null = readLoadedAt();
let connectingSince: number | null = null; // when sources started waiting for the server, none having reached it
let graceTimer: ReturnType<typeof setTimeout> | null = null;
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

function computeStatus(now: number): ConnectionStatus {
  if (!browserOnline()) return "offline";
  if (sources.size === 0) return "live"; // nothing to judge by: the browser's flag alone
  const reached = [...sources.values()].filter((s) => s.reachedServer);
  if (reached.length === 0) return connectingSince !== null && now - connectingSince >= CONNECT_GRACE_MS ? "offline" : "connecting";
  return reached.every((s) => s.fromCache) ? "offline" : "live";
}

function compute(now = Date.now()): ConnectionState {
  const status = computeStatus(now);
  return { status, online: status === "live", loadedAt };
}

// Starts or stops the wait for a first server snapshot, so the app turns
// offline on its own once the wait is over.
function trackGrace(now: number) {
  const waiting = sources.size > 0 && ![...sources.values()].some((s) => s.reachedServer);
  if (waiting && connectingSince === null) {
    connectingSince = now;
    if (typeof setTimeout !== "undefined") graceTimer = setTimeout(() => update(), CONNECT_GRACE_MS);
  } else if (!waiting && connectingSince !== null) {
    connectingSince = null;
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = null;
  }
}

function update(now = Date.now()) {
  const next = compute(now);
  if (next.status === snapshot.status && next.loadedAt === snapshot.loadedAt) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

// A live subscription calls this as it opens, before any snapshot, so the
// app counts as connecting until the server answers.
export function watchSource(source: Source, now = Date.now()) {
  if (sources.has(source)) return;
  sources.set(source, { fromCache: true, reachedServer: false });
  trackGrace(now);
  update(now);
}

// Every live subscription calls this with its snapshot's metadata. Subscribe
// with includeMetadataChanges, so going offline and back shows up.
export function reportSnapshot(source: Source, fromCache: boolean, now = Date.now()) {
  const prev = sources.get(source);
  sources.set(source, { fromCache, reachedServer: (prev?.reachedServer ?? false) || !fromCache });
  trackGrace(now);
  if (!fromCache) {
    loadedAt = now;
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(LOADED_AT_KEY, String(now));
    } catch {
      // Storage unavailable: the time is kept for this visit only.
    }
  }
  update(now);
}

// A subscription that closed stops counting, so its last state can't keep the
// app counted as online after the sources still open fall back to the device.
export function forgetSource(source: Source) {
  if (!sources.delete(source)) return;
  trackGrace(Date.now());
  update();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => update());
  window.addEventListener("offline", () => update());
}

export function getConnection(): ConnectionState {
  return snapshot;
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The first paint doesn't claim Live before any data has arrived.
const SERVER_STATE: ConnectionState = { status: "connecting", online: false, loadedAt: null };

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

// What an error toast says for a failed write: the refusal's own words when there is no connection, else `otherwise`.
export function failureMessage(err: unknown, otherwise: string): string {
  return err instanceof OfflineError ? err.message : otherwise;
}

export function assertOnline(message?: string): void {
  update(); // the browser's own flag or the wait for the server may have changed without an event yet
  if (!snapshot.online) throw new OfflineError(message);
}

// For tests: forget what the sources reported.
export function resetConnection() {
  sources.clear();
  trackGrace(Date.now());
  loadedAt = readLoadedAt();
  snapshot = compute();
}
