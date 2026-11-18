import "server-only";
import { signInEnabled } from "./flags";

// The connector imports only this gate: flag-off saves never initialize Admin or need production secrets.
export async function notifyAssignments(ids: readonly string[], senderEmail?: string) {
  if (!signInEnabled() || !ids.length) return [];
  const taskIds = [...new Set(ids)];
  try {
    const { notifyAssignedTasks } = await import("./assignNotify.server");
    return await notifyAssignedTasks(taskIds, senderEmail);
  } catch {
    console.error("Assignment notice could not be processed.");
    return taskIds.map((taskId) => ({ taskId, status: "failed" as const }));
  }
}
