import "server-only";
import { adminDb } from "./admin";
import { isIsoDay, isWeekend } from "./dates";
import { signInEnabled } from "./flags";
import { buildMorningSummary } from "./morningSummary";
import { listActivePeople, readPerson, type Person } from "./people.server";
import { sendPushToPerson } from "./push.server";
import type { Task } from "./types";

export interface MorningSummaryResult { email: string; count: number; status: "sent" | "skipped" | "failed" }

async function notifyPerson(person: Person, tasks: readonly Task[], today: string): Promise<MorningSummaryResult> {
  let count = 0;
  try {
    const summary = buildMorningSummary(tasks, person.name, today, person.email);
    if (!summary) return { email: person.email, count, status: "skipped" };
    count = summary.count;
    const ref = adminDb.collection("people").doc(person.email);
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const record = await transaction.get(ref), current = readPerson(record);
      if (!current?.active || current.name !== person.name) return false;
      const data = record.data()!;
      if (isIsoDay(data.lastSummaryDate) && data.lastSummaryDate >= today
        || isIsoDay(data.summaryClaimDate) && data.summaryClaimDate >= today) return false;
      if ((await transaction.get(ref.collection("devices").limit(1))).empty) return false;
      // Reserve before calling out. An ambiguous provider reply or a stopped process
      // must never cause a second notification on the same day. A new day is independent.
      transaction.update(ref, { summaryClaimDate: today });
      return true;
    });
    if (!claimed) return { email: person.email, count: 0, status: "skipped" };
    const { title, body, url } = summary;
    const results = await sendPushToPerson(person.email, { title, body, url });
    if (results.includes("sent")) {
      await adminDb.runTransaction(async (transaction) => {
        const record = await transaction.get(ref);
        const lastDate: unknown = record.get("lastSummaryDate");
        // A previous day's slow reply cannot overwrite today's newer claim/result,
        // or recreate an account that has since been removed.
        if (record.exists && record.get("summaryClaimDate") === today
          && !(isIsoDay(lastDate) && lastDate > today)) {
          transaction.update(ref, { lastSummaryDate: today });
        }
      });
    }
    return { email: person.email, count, status: results.includes("failed") ? "failed" : results.includes("sent") ? "sent" : "skipped" };
  } catch {
    console.error("Morning summary could not be processed.");
    return { email: person.email, count, status: "failed" };
  }
}

export async function sendMorningSummaries(today: string): Promise<MorningSummaryResult[]> {
  if (!signInEnabled() || !isIsoDay(today) || isWeekend(today)) return [];
  const people = await listActivePeople();
  if (!people.length) return [];
  const snapshot = await adminDb.collection("tasks").get();
  const tasks = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Task);
  const results: MorningSummaryResult[] = [];
  for (let i = 0; i < people.length; i += 10) {
    results.push(...await Promise.all(people.slice(i, i + 10).map((person) => notifyPerson(person, tasks, today))));
  }
  return results;
}
