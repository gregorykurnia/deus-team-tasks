// Past clients writes. Changes made in place return Undo (guide 5.4).
import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { assertOnline } from "./connection";
import { clientsDb } from "./firebaseClients";
import { canonicalSector, type HistoricalClient } from "./historicalClientTypes";
import type { Undo } from "./taskWrites";

export const PAST_CLIENTS = "historicalClients";

function ref(id: string) {
  return doc(clientsDb, PAST_CLIENTS, id);
}

type Editable = Partial<Omit<HistoricalClient, "id" | "createdAt">>;

async function change(c: HistoricalClient, patch: Editable): Promise<Undo> {
  assertOnline("No connection. The change wasn't saved.");
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, c[k as keyof HistoricalClient]])) as Editable;
  await updateDoc(ref(c.id), patch);
  return async () => {
    assertOnline("No connection. The change wasn't undone.");
    await updateDoc(ref(c.id), before);
  };
}

export async function addPastClient(input: Omit<HistoricalClient, "id" | "createdAt">): Promise<string> {
  assertOnline("No connection. The client wasn't added.");
  const client: HistoricalClient = { ...input, name: input.name.trim(), id: crypto.randomUUID(), createdAt: Date.now() };
  await setDoc(ref(client.id), client);
  return client.id;
}

export function renamePastClient(c: HistoricalClient, name: string): Promise<Undo> {
  return change(c, { name: name.trim() });
}

// Saves the sector in the spelling already in use when one matches (R6).
export function setPastClientSector(c: HistoricalClient, input: string, spellings: Map<string, string>): Promise<Undo> {
  return change(c, { sector: canonicalSector(input, spellings) });
}

export function setCounted(c: HistoricalClient, counted: boolean): Promise<Undo> {
  return change(c, { countHead: counted });
}

export function movePastClient(sub: HistoricalClient, parentId: string): Promise<Undo> {
  return change(sub, { parentId });
}

export class HasSubsidiariesError extends Error {
  constructor(public subsidiaries: number) {
    super(`It has ${subsidiaries} subsidiaries. Move or delete them first.`);
  }
}

// A parent company with subsidiaries can't be deleted (R8).
export async function deletePastClient(c: HistoricalClient, clients: HistoricalClient[]): Promise<void> {
  const subs = clients.filter((x) => x.parentId === c.id).length;
  if (subs > 0) throw new HasSubsidiariesError(subs);
  assertOnline("No connection. It wasn't deleted.");
  await deleteDoc(ref(c.id));
}
