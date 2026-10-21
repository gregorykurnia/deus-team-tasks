// The launch data step (task 4.8), Firestore part: backup, import, restore and the emulator copy. Uses the app's own
// Firestore handles, so NEXT_PUBLIC_USE_EMULATOR=1 (set by data.ts for --emulator) points every read and write at the
// local emulator exactly as the tests do.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collection, deleteDoc, deleteField, doc, getDocFromServer, getDocsFromServer, setDoc, type FieldValue, type Firestore } from "firebase/firestore";
import { commitEach } from "../../lib/batches";
import { readCompanySettings, type CompanySettings } from "../../lib/companySettings";
import { PIPELINE } from "../../lib/companyWrites";
import { db } from "../../lib/firebase";
import { clientsDb } from "../../lib/firebaseClients";
import { PAST_CLIENTS } from "../../lib/pastClientWrites";
import { sectorBackfill, type PastClientDoc } from "./launchData";

// A document as saved in a backup: its id, and its fields as stored (the companies keep a number id inside too).
export type StoredDoc = { id: string; data: Record<string, unknown> };

// Both collections the step changes, plus the companies (read only) for the report and the emulator copy.
export interface Backup {
  settings: StoredDoc[]; // the whole settings collection (companies, companyIds)
  historicalClients: StoredDoc[];
  pipeline: StoredDoc[];
}

const FILES: Record<keyof Backup, string> = {
  settings: "settings.json",
  historicalClients: "historicalClients.json",
  pipeline: "pipeline.json",
};

const SETTINGS_DOC = () => doc(db, "settings", "companies");

// From the server only: a read served from the local cache could be empty or old, and a backup of that would restore
// the wrong data. With no connection this throws, and the step stops before writing anything.
async function readCollection(store: Firestore, name: string): Promise<StoredDoc[]> {
  const snap = await getDocsFromServer(collection(store, name));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

export async function readBackup(): Promise<Backup> {
  const [settings, historicalClients, pipeline] = await Promise.all([
    readCollection(db, "settings"),
    readCollection(clientsDb, PAST_CLIENTS),
    readCollection(clientsDb, PIPELINE),
  ]);
  return { settings, historicalClients, pipeline };
}

export async function saveBackup(dir: string, backup: Backup, meta: Record<string, unknown>) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  for (const key of Object.keys(FILES) as (keyof Backup)[]) {
    await writeFile(path.join(dir, FILES[key]), JSON.stringify(backup[key], null, 2));
  }
}

// What an import wrote, saved beside the backup it took first, so its restore puts back only what the import changed.
export interface ImportRecord {
  settings: Record<string, unknown>;
  sectors: { id: string; sector: string }[];
}
const IMPORT_FILE = "import.json";

export async function saveImportRecord(dir: string, record: ImportRecord) {
  await writeFile(path.join(dir, IMPORT_FILE), JSON.stringify(record, null, 2));
}

export async function loadImportRecord(dir: string): Promise<ImportRecord | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, IMPORT_FILE), "utf8")) as ImportRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function loadMeta(dir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function loadBackup(dir: string): Promise<Backup> {
  const read = async (key: keyof Backup) => {
    try {
      return JSON.parse(await readFile(path.join(dir, FILES[key]), "utf8")) as StoredDoc[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" && key === "pipeline") return [];
      throw err;
    }
  };
  return { settings: await read("settings"), historicalClients: await read("historicalClients"), pipeline: await read("pipeline") };
}

// The stored company settings in a backup, or null when there was no record (the defaults applied).
export function storedSettingsIn(backup: Backup): CompanySettings | null {
  const d = backup.settings.find((x) => x.id === "companies");
  if (!d) return null;
  return readCompanySettings(d.data);
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export async function writeSettings(settings: CompanySettings) {
  await setDoc(SETTINGS_DOC(), plain(settings));
}

export async function writeSectors(list: { id: string; sector: string | null | FieldValue }[]): Promise<number> {
  const done = await commitEach(clientsDb, list, (batch, { id, sector }) => batch.update(doc(clientsDb, PAST_CLIENTS, id), { sector }));
  return done.length;
}

// What a backup's restore would change now. With the import's record (an import's backup), only what that import
// changed and nobody changed since: the settings record while it still holds what the import wrote, and the sectors
// the import filled that still hold the parent's sector it gave them. With no record (a plain backup), the settings
// record and every past client's sector that differs from the backup. Only the sector is put back, so anything else
// changed since stays.
export async function restorePlan(backup: Backup, record: ImportRecord | null = null) {
  const now = await readBackup();
  const before = backup.settings.find((x) => x.id === "companies") ?? null;
  const current = now.settings.find((x) => x.id === "companies") ?? null;
  const differs = stable(before?.data ?? null) !== stable(current?.data ?? null);
  const changedSince = !!record && differs && stable(current?.data ?? null) !== stable(record.settings);
  const settingsChanged = differs && !changedSince;
  const nowById = new Map(now.historicalClients.map((c) => [c.id, c.data]));
  const backupById = new Map(backup.historicalClients.map((c) => [c.id, c.data]));
  const sectorOf = (data: Record<string, unknown> | undefined) => (data?.sector as string | null | undefined) ?? null;
  const candidates = record
    ? record.sectors.filter((s) => nowById.has(s.id) && backupById.has(s.id) && sectorOf(nowById.get(s.id)) === s.sector).map((s) => s.id)
    : backup.historicalClients.filter((c) => nowById.has(c.id) && sectorOf(nowById.get(c.id)) !== sectorOf(c.data)).map((c) => c.id);
  const hasSector = (data: Record<string, unknown> | undefined) => !!data && "sector" in data;
  const sectors = candidates
    .filter((id) => sectorOf(nowById.get(id)) !== sectorOf(backupById.get(id)) || hasSector(nowById.get(id)) !== hasSector(backupById.get(id)))
    .map((id) => ({ id, sector: sectorOf(backupById.get(id)), missing: !hasSector(backupById.get(id)) }));
  const sectorsChangedSince = record ? record.sectors.length - candidates.length : 0;
  return { before, settingsChanged, settingsChangedSince: changedSince, sectors, sectorsChangedSince };
}

// JSON with every object's keys in order, so a record read back from Firestore compares equal to its backup.
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x
  );
}

export async function restore(backup: Backup, record: ImportRecord | null = null) {
  const plan = await restorePlan(backup, record);
  if (plan.settingsChanged) {
    if (plan.before) await setDoc(SETTINGS_DOC(), plan.before.data);
    else await deleteDoc(SETTINGS_DOC());
  }
  // A sector the backup didn't have at all is removed again, so the record is exactly as it was.
  const sectors = await writeSectors(plan.sectors.map(({ id, sector, missing }) => ({ id, sector: missing ? deleteField() : sector })));
  return { settings: plan.settingsChanged, sectors };
}

export async function storedSettingsNow(): Promise<Record<string, unknown> | null> {
  const snap = await getDocFromServer(SETTINGS_DOC());
  return snap.exists() ? snap.data() : null;
}

export function backfillFor(backup: Backup) {
  return sectorBackfill(backup.historicalClients.map((c) => ({ ...(c.data as Omit<PastClientDoc, "id">), id: c.id })));
}

// Emulator only: replaces the emulator's data with a backup, so a dry run works on a copy.
export async function seedCopy(backup: Backup) {
  const write = (store: Firestore, name: string, docs: StoredDoc[]) =>
    commitEach(store, docs, (batch, { id, data }) => batch.set(doc(store, name, id), data));
  await write(db, "settings", backup.settings);
  await write(clientsDb, PAST_CLIENTS, backup.historicalClients);
  await write(clientsDb, PIPELINE, backup.pipeline);
}
