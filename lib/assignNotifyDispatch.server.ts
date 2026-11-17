import "server-only";
import { signInEnabled } from "./flags";

// The connector imports only this gate: flag-off saves never initialize Admin or need production secrets.
export async function notifyAssignments(ids: readonly string[], senderEmail?: string) {
  if (!signInEnabled()) return [];
  const taskIds = [...new Set(ids)];
  const results: { taskId: string; status: "processed" | "missing" | "failed" }[] = [];
  for (let i = 0; i < taskIds.length; i += 10) {
    results.push(...await Promise.all(taskIds.slice(i, i + 10).map(async (taskId) => {
      try {
        const { notifyAssignedTask } = await import("./assignNotify.server");
        return { taskId, status: await notifyAssignedTask(taskId, senderEmail) };
      } catch {
        console.error("Assignment notice could not be processed.");
        return { taskId, status: "failed" as const };
      }
    })));
  }
  return results;
}
