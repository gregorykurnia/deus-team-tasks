// Seeds, reads and clears the Firestore emulator through its REST API.
// Shared by the smoke tests (Playwright) and the unit tests (Vitest).
// Requests carry "Bearer owner", so they skip security rules.

export const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const BASE = `http://${EMULATOR_HOST}`;

export const PROJECTS = {
  tasks: "deus-team-tasks",
  clients: "deus-client-tracker",
} as const;

export type ProjectKey = keyof typeof PROJECTS;

const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

function docsPath(project: ProjectKey) {
  return `projects/${PROJECTS[project]}/databases/(default)/documents`;
}

type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

export function encodeValue(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`Can't encode ${typeof value} for Firestore`);
}

function encodeFields(data: Record<string, unknown>): Record<string, FsValue> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, encodeValue(v)])
  );
}

export function decodeValue(value: FsValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  throw new Error(`Can't decode ${JSON.stringify(value)}`);
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

async function check(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  return res;
}

// The client tracker's live rules aren't in this repo. The app writes its
// collections without signing in, so the emulator lets that project read and write.
export async function openClientTrackerRules() {
  const content = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;
  await check(
    await fetch(`${BASE}/emulator/v1/projects/${PROJECTS.clients}:securityRules`, {
      method: "PUT",
      headers: OWNER,
      body: JSON.stringify({ rules: { files: [{ name: "clients.rules", content }] } }),
    }),
    "Setting the client tracker rules"
  );
}

export async function clearProject(project: ProjectKey) {
  await check(
    await fetch(`${BASE}/emulator/v1/${docsPath(project)}`, { method: "DELETE", headers: OWNER }),
    `Clearing ${project}`
  );
}

export async function clearAll() {
  await Promise.all([clearProject("tasks"), clearProject("clients")]);
}

export type SeedDoc = { id: string | number } & Record<string, unknown>;

// The client tracker's collections also keep the id inside the document,
// and the app reads it from there: pass keepIdField for those.
export async function seed(project: ProjectKey, collection: string, docs: SeedDoc[], { keepIdField = false } = {}) {
  if (docs.length === 0) return;
  const writes = docs.map(({ id, ...data }) => ({
    update: {
      name: `${docsPath(project)}/${collection}/${id}`,
      fields: encodeFields(keepIdField ? { id, ...data } : data),
    },
  }));
  await check(
    await fetch(`${BASE}/v1/${docsPath(project)}:commit`, {
      method: "POST",
      headers: OWNER,
      body: JSON.stringify({ writes }),
    }),
    `Seeding ${project}/${collection}`
  );
}

export type StoredDoc = { id: string } & Record<string, unknown>;

export async function readAll(project: ProjectKey, collection: string): Promise<StoredDoc[]> {
  const out: StoredDoc[] = [];
  let pageToken = "";
  do {
    const url = `${BASE}/v1/${docsPath(project)}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await check(await fetch(url, { headers: OWNER }), `Reading ${project}/${collection}`);
    const body = (await res.json()) as {
      documents?: { name: string; fields?: Record<string, FsValue> }[];
      nextPageToken?: string;
    };
    for (const doc of body.documents ?? []) {
      out.push({ id: doc.name.split("/").pop()!, ...decodeFields(doc.fields ?? {}) });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export async function readDoc(project: ProjectKey, path: string): Promise<StoredDoc | null> {
  const res = await fetch(`${BASE}/v1/${docsPath(project)}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  await check(res, `Reading ${project}/${path}`);
  const doc = (await res.json()) as { name: string; fields?: Record<string, FsValue> };
  return { id: doc.name.split("/").pop()!, ...decodeFields(doc.fields ?? {}) };
}

// The stored fields only, without the document id that readDoc adds.
export async function readFields(project: ProjectKey, path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/v1/${docsPath(project)}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  await check(res, `Reading ${project}/${path}`);
  return decodeFields(((await res.json()) as { fields?: Record<string, FsValue> }).fields ?? {});
}
