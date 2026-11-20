import "server-only";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./admin";
import { isParked } from "./parking";
import { closestNames, hasTaskPerson, personEmail, personName, personNameKey, taskPersonKeys } from "./peopleInput";

export interface Person {
  email: string;
  name: string;
  active: boolean;
}

const people = adminDb.collection("people");

export function readPerson(doc: DocumentSnapshot): Person | null {
  const data = doc.data();
  if (!data || data.email !== doc.id || typeof data.active !== "boolean") return null;
  try {
    if (personEmail(data.email) !== data.email || personName(data.name) !== data.name) return null;
  } catch { return null; }
  return { email: data.email, name: data.name, active: data.active };
}

function checkLink(docs: DocumentSnapshot[], email: string, name: string): Person | null {
  const existing = docs.find((p) => p.id === email);
  const current = existing ? readPerson(existing) : null;
  if (existing && (!current || current.name !== name)) {
    throw new Error("This email is already linked to another name. Renaming a person is outside people:add.");
  }
  if (docs.some((p) => {
    const data = p.data();
    return p.id !== email && data?.active === true && typeof data.name === "string" && personNameKey(data.name) === personNameKey(name);
  })) throw new Error("That name is already linked to another active email.");
  return current;
}

export async function getActivePerson(email: string): Promise<Person | null> {
  const person = readPerson(await people.doc(personEmail(email)).get());
  return person?.active ? person : null;
}

export async function listActivePeople(): Promise<Person[]> {
  const snapshot = await people.where("active", "==", true).get();
  return snapshot.docs.map(readPerson).filter((p): p is Person => p !== null);
}

export async function getPersonByName(name: string): Promise<Person | null> {
  const exact = personName(name);
  return (await listActivePeople()).find((p) => p.name === exact) ?? null;
}

export async function previewPersonAddition(rawEmail: string, rawName: string) {
  const email = personEmail(rawEmail), name = personName(rawName);
  const keys = taskPersonKeys(name, email);
  const [tasks, allPeople] = await Promise.all([
    adminDb.collection("tasks").select("responsible", "completed", "parkedAt", "parkedUntil").get(),
    people.get(),
  ]);
  const existing = checkLink(allPeople.docs, email, name);
  const names = new Set<string>();
  let total = 0, open = 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const doc of tasks.docs) {
    const task = doc.data();
    const responsible = Array.isArray(task.responsible) ? task.responsible.filter((n): n is string => typeof n === "string") : [];
    responsible.forEach((n) => names.add(n));
    if (!hasTaskPerson(responsible, keys)) continue;
    total++;
    if (!task.completed && !isParked(task, today)) open++;
  }
  return { email, name, total, open, closest: closestNames(name, names), existing };
}

export async function addPerson(rawEmail: string, rawName: string): Promise<Person> {
  const email = personEmail(rawEmail), name = personName(rawName);
  const person: Person = { email, name, active: true };
  const keys = taskPersonKeys(name, email);
  const notifiedName = keys.has(personNameKey(name)) ? name : email;
  return adminDb.runTransaction(async (transaction) => {
    // The query also serializes two emails trying to claim the same task name.
    const allPeople = await transaction.get(people);
    const existing = checkLink(allPeople.docs, email, name);
    // A retry must not mark assignments made after the original activation as already told.
    if (existing?.active) return person;
    const tasks = await transaction.get(adminDb.collection("tasks").select("responsible"));
    for (const task of tasks.docs) {
      if (!hasTaskPerson(task.data().responsible, keys)) continue;
      transaction.set(adminDb.collection("assignNotices").doc(task.id), { notified: FieldValue.arrayUnion(notifiedName) }, { merge: true });
    }
    // Backfill and activation commit together, leaving task documents untouched.
    transaction.set(people.doc(email), person, { merge: true });
    return person;
  });
}

export async function previewPersonRemoval(rawEmail: string) {
  const email = personEmail(rawEmail);
  const [person, devices] = await Promise.all([people.doc(email).get(), people.doc(email).collection("devices").get()]);
  return { email, person: readPerson(person), devices: devices.size };
}

export async function deactivatePerson(rawEmail: string): Promise<void> {
  const email = personEmail(rawEmail);
  await adminDb.runTransaction(async (transaction) => {
    const ref = people.doc(email);
    const person = await transaction.get(ref);
    const devices = await transaction.get(ref.collection("devices"));
    if (person.exists) transaction.update(ref, { active: false });
    devices.docs.forEach((device) => transaction.delete(device.ref));
  });
  // Disable access first. A failed Auth request leaves no working access or push devices;
  // retrying removal completes revocation. Never clear devices after a later reactivation.
  try {
    await adminAuth.revokeRefreshTokens(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") {
      throw new Error("Access is disabled and devices removed, but token revocation failed. Retry people:remove to finish.");
    }
  }
}
