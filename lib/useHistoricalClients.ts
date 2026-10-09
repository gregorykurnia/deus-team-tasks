"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { clientsDb } from "./firebaseClients";
import { HistoricalClient } from "./historicalClientTypes";

const COLLECTION = "historicalClients";

export function useHistoricalClients() {
  const [clients, setClients] = useState<HistoricalClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(clientsDb, COLLECTION),
      (snapshot) => {
        setClients(snapshot.docs.map((item) => item.data() as HistoricalClient));
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load historical clients", error);
        setLoading(false);
      }
    );
  }, []);

  async function addClient(input: Omit<HistoricalClient, "id" | "createdAt">) {
    const client: HistoricalClient = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
    await setDoc(doc(clientsDb, COLLECTION, client.id), client);
  }

  async function updateClient(id: string, patch: Partial<Omit<HistoricalClient, "id" | "createdAt">>) {
    await updateDoc(doc(clientsDb, COLLECTION, id), patch);
  }

  async function deleteClient(id: string) {
    await deleteDoc(doc(clientsDb, COLLECTION, id));
  }

  return { clients, loading, addClient, updateClient, deleteClient };
}
