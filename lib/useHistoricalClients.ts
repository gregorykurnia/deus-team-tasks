"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, type QueryDocumentSnapshot } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { HistoricalClient } from "./historicalClientTypes";
import { PAST_CLIENTS } from "./pastClientWrites";
import { reportSnapshot } from "./connection";

export const pastClientsQuery = () => collection(clientsDb, PAST_CLIENTS);
export const toPastClient = (item: QueryDocumentSnapshot): HistoricalClient => ({ ...(item.data() as HistoricalClient), id: item.id });

export function useHistoricalClients() {
  const [clients, setClients] = useState<HistoricalClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      pastClientsQuery(),
      { includeMetadataChanges: true },
      (snapshot) => {
        reportSnapshot("pastClients", snapshot.metadata.fromCache);
        setClients(snapshot.docs.map(toPastClient));
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
