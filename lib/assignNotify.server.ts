import "server-only";
import { doc, getDocFromServer } from "firebase/firestore";
import { adminDb } from "./admin";
import { assignmentMessage, assignmentRecipients, assignmentTaskId, noticeName } from "./assignNotify";
import { clientsDb } from "./firebaseClients";
import { kindOf } from "./kinds";
import { readPerson, type Person } from "./people.server";
import { sendPushToPerson } from "./push.server";
import type { PipelineEntry } from "./clientTypes";
import type { PushMessage } from "./pushTransport.server";
import type { Task } from "./types";

type AssignmentResult = { taskId: string; status: "processed" | "missing" | "failed" };
type ClaimedNotice = {
  taskName: string;
  company?: { id: number; name: string };
  single: PushMessage;
};
type AssignmentDelivery = { notice: ClaimedNotice; result: AssignmentResult };

async function claimAssignment(taskId: string, senderEmail?: string) {
  if (!assignmentTaskId(taskId)) throw new Error("Invalid task ID.");
  return adminDb.runTransaction(async (transaction) => {
    const taskRef = adminDb.collection("tasks").doc(taskId), notice = adminDb.collection("assignNotices").doc(taskId);
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists) return null;
    const task = { ...snapshot.data(), id: taskId } as Task;
    const [record, people] = await Promise.all([
      transaction.get(notice), transaction.get(adminDb.collection("people").where("active", "==", true)),
    ]);
    const recipients = assignmentRecipients(task.responsible, record.data()?.notified,
      people.docs.map(readPerson).filter((person): person is Person => person !== null), senderEmail);
    let claimed: ClaimedNotice | undefined;
    if (recipients.owed.length) {
      const parent = task.parentId !== task.id && assignmentTaskId(task.parentId)
        ? (await transaction.get(adminDb.collection("tasks").doc(task.parentId))).data() : undefined;
      const companyId = task.linkedClientId;
      const company = Number.isSafeInteger(companyId)
        ? (await getDocFromServer(doc(clientsDb, "pipeline", String(companyId)))).data() as PipelineEntry | undefined : undefined;
      const name = company?.company;
      claimed = {
        taskName: task.task,
        company: companyId !== undefined && typeof name === "string" && name.trim()
          ? { id: companyId, name } : undefined,
        single: assignmentMessage(task, parent?.task, kindOf(task, new Map(company ? [[companyId!, company]] : []))),
      };
    }
    // Claim before calling a push service: parallel pings/retries can never send the same assignment twice.
    // Failed or ambiguous deliveries are deliberately not retried; the morning summary remains available.
    if (JSON.stringify(record.data()?.notified) !== JSON.stringify(recipients.notified)) {
      transaction.set(notice, { notified: recipients.notified }, { merge: true });
    }
    return { owed: recipients.owed, notice: claimed };
  });
}

function deliveryMessage(assignments: readonly AssignmentDelivery[]): PushMessage {
  const { notice } = assignments[0];
  const count = assignments.length;
  if (count === 1) return notice.single;
  const { company } = notice;
  return {
    title: `${count} new tasks for you`,
    body: company && assignments.every((assignment) => assignment.notice.company?.id === company.id)
      ? noticeName(company.name) : `${noticeName(notice.taskName)} and ${count - 1} more`,
    url: "/",
  };
}

export async function notifyAssignedTasks(taskIds: readonly string[], senderEmail?: string): Promise<AssignmentResult[]> {
  const results: AssignmentResult[] = [];
  const deliveries = new Map<string, AssignmentDelivery[]>();
  for (let i = 0; i < taskIds.length; i += 10) {
    const batch = taskIds.slice(i, i + 10);
    const claims = await Promise.allSettled(batch.map((taskId) => claimAssignment(taskId, senderEmail)));
    for (const [index, claim] of claims.entries()) {
      const taskId = batch[index];
      if (claim.status === "rejected") {
        console.error("Assignment notice could not be processed.");
        results.push({ taskId, status: "failed" });
        continue;
      }
      const result: AssignmentResult = { taskId, status: claim.value ? "processed" : "missing" };
      results.push(result);
      if (!claim.value?.notice) continue;
      const { notice, owed } = claim.value;
      for (const { email } of owed) {
        const assignments = deliveries.get(email) ?? [];
        assignments.push({ notice, result });
        deliveries.set(email, assignments);
      }
    }
  }

  await Promise.all([...deliveries].map(async ([email, assignments]) => {
    try {
      const devices = await sendPushToPerson(email, deliveryMessage(assignments));
      if (!devices.includes("failed")) return;
    } catch {
      console.error("Assignment notice could not be processed.");
    }
    for (const { result } of assignments) result.status = "failed";
  }));
  return results;
}
