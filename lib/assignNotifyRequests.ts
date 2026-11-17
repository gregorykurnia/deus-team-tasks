import { assignmentTaskId } from "./assignNotify";
import { signInEnabled } from "./flags";

// A notice follows a confirmed save. Neither Auth nor a failed/offline request can fail that save.
export function requestAssignNotify(ids: readonly string[]): void {
  if (!signInEnabled() || !ids.length) return;
  const taskIds = [...new Set(ids.filter(assignmentTaskId))];
  if (!taskIds.length) return;
  void import("./authClient").then(async ({ clientAuth }) => {
    await clientAuth.authStateReady();
    const user = clientAuth.currentUser;
    // Never fall back to anonymous after a signed-in token fails: that could push to the sender.
    const token = user ? await user.getIdToken() : null;
    const headers = { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) };
    for (let i = 0; i < taskIds.length;) {
      const chunk: string[] = [];
      while (i < taskIds.length && chunk.length < 50
        && new TextEncoder().encode(JSON.stringify({ taskIds: [...chunk, taskIds[i]] })).length < 60_000) chunk.push(taskIds[i++]);
      try {
        void fetch("/api/notify/assigned", { method: "POST", headers, body: JSON.stringify({ taskIds: chunk }), keepalive: true }).catch(() => {});
      } catch { /* A synchronous fetch failure must not stop the remaining chunks. */ }
    }
  }).catch(() => {});
}
