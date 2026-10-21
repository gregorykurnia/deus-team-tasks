"use client";

// One live subscription for one source (guide 5.8): its rows, and its own
// loading, error and fromCache, so every area loads and fails on its own.
import { onSnapshot, type CollectionReference, type Query, type QueryDocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { forgetSource, reportSnapshot, watchSource, type Source } from "./connection";
import { isExpectedOwn, noteChanges } from "./liveChanges";

export interface LiveRows<T> {
  rows: T[];
  loading: boolean;
  error: Error | null;
  fromCache: boolean; // the device's copy, not yet (or no longer) confirmed by the server
}

const AUTOSAVED = new Set<Source>(["notes", "flows"]);
const LOADING: LiveRows<never> = { rows: [], loading: true, error: null, fromCache: true };

// makeQuery and toRows must be stable (module-level), so the subscription opens once.
export function useLiveQuery<T>(
  source: Source,
  makeQuery: () => Query | CollectionReference,
  toRows: (docs: QueryDocumentSnapshot[]) => T[]
): LiveRows<T> {
  const [state, setState] = useState<LiveRows<T>>(LOADING);

  useEffect(() => {
    watchSource(source);
    // The first snapshot is what's already there. A colleague's changes count only once a server snapshot has been
    // seen, so what the device's copy was missing when it opened isn't announced as new. The same goes after a spell on
    // the device's copy (no connection): what came in meanwhile arrives at once, and "Back online" says it.
    let seenFirst = false;
    let seenServer = false;
    const unsubscribe = onSnapshot(
      makeQuery(),
      { includeMetadataChanges: true },
      (snap) => {
        reportSnapshot(source, snap.metadata.fromCache);
        if (seenFirst) {
          // Metadata-only changes aren't in docChanges(), so our own write being confirmed isn't a change.
          const live = { own: [] as string[], added: [] as string[], changed: [] as string[] };
          for (const c of snap.docChanges()) {
            if (c.type === "removed") continue;
            // Notes and flows save as you type, with a save line of their own: editing one isn't lit up each time.
            if (c.doc.metadata.hasPendingWrites || isExpectedOwn(source, c.doc.id)) {
              if (c.type === "added" || !AUTOSAVED.has(source)) live.own.push(c.doc.id);
            } else if (seenServer && !snap.metadata.fromCache) (c.type === "added" ? live.added : live.changed).push(c.doc.id);
          }
          noteChanges(source, live);
        }
        seenFirst = true;
        seenServer = !snap.metadata.fromCache;
        setState({ rows: toRows(snap.docs), loading: false, error: null, fromCache: snap.metadata.fromCache });
      },
      (error) => {
        console.error(`Unable to load ${source}`, error);
        forgetSource(source); // Firestore closes a listener that reports an error
        setState((s) => ({ ...s, loading: false, error }));
      }
    );
    return () => {
      unsubscribe();
      forgetSource(source);
    };
  }, [source, makeQuery, toRows]);

  return state;
}
