import "server-only";
import { doc, getDocFromServer } from "firebase/firestore";
import { adminDb } from "./admin";
import { assignmentMessage, assignmentRecipients, assignmentTaskId } from "./assignNotify";
import { clientsDb } from "./firebaseClients";
import { signInEnabled } from "./flags";
import { kindOf } from "./kinds";
import { readPerson, type Person } from "./people.server";
import { sendPushToPerson } from "./push.server";
import type { PipelineEntry } from "./clientTypes";
import type { Task } from "./types";

export async function notifyAssignedTask(taskId: string, senderEmail?: string): Promise<"processed" | "missing" | "failed"> {
  if (!signInEnabled()) return "processed";
  if (!assignmentTaskId(taskId)) throw new Error("Invalid task ID.");
  const claim = await adminDb.runTransaction(async (transaction) => {
    const taskRef = adminDb.collection("tasks").doc(taskId), notice = adminDb.collection("assignNotices").doc(taskId);
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists) return null;
    const task = { ...snapshot.data(), id: taskId } as Task;
    const [record, people] = await Promise.all([
      transaction.get(notice), transaction.get(adminDb.collection("people").where("active", "==", true)),
    ]);
    const recipients = assignmentRecipients(task.responsible, record.data()?.notified,
      people.docs.map(readPerson).filter((person): person is Person => person !== null), senderEmail);
    let message;
    if (recipients.owed.length) {
      const parent = task.parentId !== task.id && assignmentTaskId(task.parentId)
        ? (await transaction.get(adminDb.collection("tasks").doc(task.parentId))).data() : undefined;
      const company = Number.isSafeInteger(task.linkedClientId)
        ? (await getDocFromServer(doc(clientsDb, "pipeline", String(task.linkedClientId)))).data() as PipelineEntry | undefined : undefined;
      message = assignmentMessage(task, parent?.task, kindOf(task, new Map(company ? [[task.linkedClientId!, company]] : [])));
    }
    // Claim before calling a push service: parallel pings/retries can never send the same assignment twice.
    // Failed or ambiguous deliveries are deliberately not retried; the morning summary remains available.
    if (JSON.stringify(record.data()?.notified) !== JSON.stringify(recipients.notified)) {
      transaction.set(notice, { notified: recipients.notified }, { merge: true });
    }
    return { ...recipients, message };
  });
  if (!claim) return "missing";
  if (!claim.message) return "processed";
  const results = await Promise.all(claim.owed.map((person) => sendPushToPerson(person.email, claim.message!)));
  return results.some((devices) => devices.includes("failed")) ? "failed" : "processed";
}
