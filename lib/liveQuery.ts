"use client";

// One live subscription for one source (guide 5.8): its rows, and its own
// loading, error and fromCache, so every area loads and fails on its own.
import { onSnapshot, type CollectionReference, type Query, type QueryDocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { forgetSource, reportSnapshot, type Source } from "./connection";

export interface LiveRows<T> {
  rows: T[];
  loading: boolean;
  error: Error | null;
  fromCache: boolean; // the device's copy, not yet (or no longer) confirmed by the server
}

const LOADING: LiveRows<never> = { rows: [], loading: true, error: null, fromCache: true };

// makeQuery and toRows must be stable (module-level), so the subscription opens once.
export function useLiveQuery<T>(
  source: Source,
  makeQuery: () => Query | CollectionReference,
  toRows: (docs: QueryDocumentSnapshot[]) => T[]
): LiveRows<T> {
  const [state, setState] = useState<LiveRows<T>>(LOADING);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      makeQuery(),
      { includeMetadataChanges: true },
      (snap) => {
        reportSnapshot(source, snap.metadata.fromCache);
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
