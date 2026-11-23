import "server-only";
import { doc, getDocFromServer } from "firebase/firestore";
import { adminDb } from "./admin";
import { isIsoDay, isWeekend } from "./dates";
import { clientsDb } from "./firebaseClients";
import { leaveEnabled, signInEnabled } from "./flags";
import { countWaitingLeaveRequests, leaveAdmins } from "./leave.server";
import { buildMorningSummary, dueTodayMessage } from "./morningSummary";
import { getActivePerson, listActivePeople, readPerson, type Person } from "./people.server";
import { sendPushToPerson } from "./push.server";
import type { Task } from "./types";

export interface MorningSummaryResult { email: string; count: number; status: "sent" | "skipped" | "failed" }

function companyNamesForRun() {
  const names = new Map<number, Promise<string | undefined>>();
  return async (id: Task["linkedClientId"]): Promise<string | undefined> => {
    if (id === undefined || !Number.isSafeInteger(id)) return undefined;
    let pending = names.get(id);
    if (!pending) {
      pending = getDocFromServer(doc(clientsDb, "pipeline", String(id))).then((record) => {
        const name: unknown = record.get("company");
        return typeof name === "string" ? name : undefined;
      }).catch(() => {
        console.warn("Could not load the company name for a due-today notification.");
        return undefined;
      });
      names.set(id, pending);
    }
    return pending;
  };
}

async function notifyPerson(
  person: Person, tasks: readonly Task[], today: string, companyName: ReturnType<typeof companyNamesForRun>,
  { waitingLeave = 0, dueTodayOnly = false }: { waitingLeave?: number; dueTodayOnly?: boolean } = {},
): Promise<MorningSummaryResult> {
  let count = 0;
  try {
    const summary = buildMorningSummary(tasks, person.name, today, person.email, waitingLeave);
    if (!summary) return { email: person.email, count, status: "skipped" };
    count = dueTodayOnly ? summary.groups.today.length : summary.count;
    if (!count) return { email: person.email, count, status: "skipped" };
    const claimField = dueTodayOnly ? "dueTodayResendClaimDate" : "summaryClaimDate";
    const ref = adminDb.collection("people").doc(person.email);
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const record = await transaction.get(ref), current = readPerson(record);
      if (!current?.active || current.name !== person.name) return false;
      const data = record.data()!;
      const lastSummary = data.lastSummaryDate;
      if (dueTodayOnly ? lastSummary !== today : isIsoDay(lastSummary) && lastSummary >= today) return false;
      const claimDate = data[claimField];
      if (isIsoDay(claimDate) && claimDate >= today) return false;
      if ((await transaction.get(ref.collection("devices").limit(1))).empty) return false;
      // Reserve the morning's batch before sending. Retrying an ambiguous reply
      // would repeat notifications already accepted by the provider.
      transaction.update(ref, { [claimField]: today });
      return true;
    });
    if (!claimed) return { email: person.email, count: 0, status: "skipped" };
    const messages = await Promise.all(summary.groups.today.map(async (task) =>
      dueTodayMessage(task, await companyName(task.linkedClientId))));
    if (summary.roundup && !dueTodayOnly) messages.push(summary.roundup);
    const results = await sendPushToPerson(person.email, messages);
    const accepted = results.filter((result) => result === "sent").length;
    const status = results.includes("failed") ? "failed" : accepted ? "sent" : "skipped";
    if (dueTodayOnly || accepted) {
      await adminDb.runTransaction(async (transaction) => {
        const record = await transaction.get(ref);
        // An older send cannot overwrite a later claim or recreate a deleted account.
        if (!record.exists || record.get(claimField) !== today) return;
        if (dueTodayOnly) {
          transaction.update(ref, { dueTodayResendResult: { date: today, count, accepted, status } });
        } else {
          const lastDate: unknown = record.get("lastSummaryDate");
          if (!(isIsoDay(lastDate) && lastDate > today)) transaction.update(ref, { lastSummaryDate: today });
        }
      });
    }
    return { email: person.email, count, status };
  } catch {
    console.error("Morning summary could not be processed.");
    return { email: person.email, count, status: "failed" };
  }
}

async function readMorningTasks(): Promise<Task[]> {
  const snapshot = await adminDb.collection("tasks").get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Task);
}

export async function sendDueTodayResend(email: string, today: string): Promise<MorningSummaryResult> {
  const person = await getActivePerson(email);
  if (!person) return { email, count: 0, status: "skipped" };
  return notifyPerson(person, await readMorningTasks(), today, companyNamesForRun(), { dueTodayOnly: true });
}

export async function sendMorningSummaries(today: string): Promise<MorningSummaryResult[]> {
  if (!signInEnabled() || !isIsoDay(today) || isWeekend(today)) return [];
  const people = await listActivePeople();
  if (!people.length) return [];
  const admins = new Set(leaveEnabled() ? leaveAdmins() : []);
  const [tasks, waitingLeave] = await Promise.all([
    readMorningTasks(),
    people.some((person) => admins.has(person.email)) ? countWaitingLeaveRequests().catch(() => {
      console.error("Waiting leave could not be counted for the morning summary.");
      return 0;
    }) : 0,
  ]);
  const companyName = companyNamesForRun();
  const results: MorningSummaryResult[] = [];
  for (let i = 0; i < people.length; i += 10) {
    results.push(...await Promise.all(people.slice(i, i + 10).map((person) =>
      notifyPerson(person, tasks, today, companyName, { waitingLeave: admins.has(person.email) ? waitingLeave : 0 }))));
  }
  return results;
}
