import "server-only";
import { FirebaseError } from "firebase/app";
import { collection, deleteField, doc, getDocFromServer, getDocsFromServer, runTransaction } from "firebase/firestore";
import type { PipelineEntry } from "./clientTypes";
import { TEAM_PIC } from "./companies";
import { buildCompanyChanges, checkSeenPics, companyPic, type CompanyChangesPreview, type CompanyPicChange } from "./companyChat";
import { companyRef, createCompany } from "./companyCreate";
import { maxCompanyId } from "./companyEdit";
import { readCompanySettings } from "./companySettingsModel";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { isQuotaError, logToolFailure, QUOTA_NOT_SAVED } from "./firestoreQuota";
import { readFollowupData, wibToday } from "./followupServer";
import type { Flow } from "./types";

async function readCompanyChangesContext() {
  const [data, flows, settings] = await Promise.all([
    readFollowupData(),
    getDocsFromServer(collection(db, "flows")),
    getDocFromServer(doc(db, "settings", "companies")),
  ]);
  return {
    ...data,
    flows: flows.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as Flow),
    settings: readCompanySettings(settings.data()),
    today: wibToday(),
  };
}

export async function previewCompanyChanges(input: unknown) {
  return buildCompanyChanges(input, await readCompanyChangesContext());
}

export class CompanyChangesError extends Error {}

type CompanyAdded = { id: number; company: string; group: string };

export interface CompanyChangesSaved {
  added: CompanyAdded[];
  alreadyExists: CompanyChangesPreview["alreadyExists"];
  // Only confirmed saves are in `added`. A failed reply can leave an add unconfirmed.
  notAdded: { company: string; group: string; error: string }[];
  pics:
    | { status: "none" }
    | { status: "saved"; changes: CompanyPicChange[] }
    | { status: "notSaved" | "unconfirmed"; errors: string[] };
}

const UNCONFIRMED_SAVE_CODES = new Set(["cancelled", "data-loss", "deadline-exceeded", "internal", "unavailable", "unknown"]);

async function saveCompanyPics({ setPic, seenPics }: CompanyChangesPreview): Promise<string[]> {
  return runTransaction(clientsDb, async (tx) => {
    const targets = await Promise.all(setPic.map(async (change) => ({ change, snap: await tx.get(companyRef(change.id)) })));
    const errors: string[] = [];
    const currentPics = [];
    for (const { change: { id, company }, snap } of targets) {
      if (!snap.exists()) errors.push(`Company ${id} (${company}) could not be found. Preview again.`);
      else currentPics.push({ id, company, before: companyPic(snap.data() as PipelineEntry) });
    }
    // C1a checked the supplied seenPics against these same values before any adds.
    errors.push(...checkSeenPics(seenPics, currentPics));
    if (errors.length) return errors;

    for (const { change, snap } of targets) {
      if (!change.unchanged) tx.update(snap.ref, { [TEAM_PIC]: change.after ?? deleteField() });
    }
    return [];
  });
}

function writeFailure(error: unknown, operation: string, message: string): string {
  logToolFailure(operation, error);
  return isQuotaError(error) ? QUOTA_NOT_SAVED : message;
}

export async function applyCompanyChanges(input: unknown): Promise<CompanyChangesSaved> {
  const context = await readCompanyChangesContext();
  const { preview, errors } = buildCompanyChanges(input, context, "apply");
  if (!preview) throw new CompanyChangesError(errors.join("\n"));

  const result: CompanyChangesSaved = { added: [], alreadyExists: preview.alreadyExists, notAdded: [], pics: { status: "none" } };
  const knownMaxId = maxCompanyId([...context.companies]);
  for (const { group, data } of preview.add) {
    try {
      const id = await createCompany(data, knownMaxId);
      result.added.push({ id, company: data.company, group });
    } catch (error) {
      const message = writeFailure(error, "Adding a company", "Couldn't confirm that the company was added. Check the company list before retrying.");
      result.notAdded.push({ company: data.company, group, error: message });
    }
  }

  if (preview.setPic.length) {
    try {
      const conflicts = await saveCompanyPics(preview);
      result.pics = conflicts.length ? { status: "notSaved", errors: conflicts } : { status: "saved", changes: preview.setPic };
    } catch (error) {
      const message = writeFailure(error, "Saving company PICs", "Couldn't confirm the PIC changes. Preview again before saving.");
      const status = error instanceof FirebaseError && UNCONFIRMED_SAVE_CODES.has(error.code) ? "unconfirmed" : "notSaved";
      result.pics = { status, errors: [message] };
    }
  }
  return result;
}
