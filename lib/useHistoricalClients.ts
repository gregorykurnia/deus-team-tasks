"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { HistoricalClient } from "./historicalClientTypes";
import { PAST_CLIENTS } from "./pastClientWrites";
import { reportSnapshot } from "./connection";

export function useHistoricalClients() {
  const [clients, setClients] = useState<HistoricalClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(clientsDb, PAST_CLIENTS),
      { includeMetadataChanges: true },
      (snapshot) => {
        reportSnapshot("pastClients", snapshot.metadata.fromCache);
        setClients(snapshot.docs.map((item) => ({ ...(item.data() as HistoricalClient), id: item.id })));
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load historical clients", error);
        setLoading(false);
      }
    );
  }, []);

  return { clients, loading };
}
