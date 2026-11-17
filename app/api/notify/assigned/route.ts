import { assignmentTaskId } from "@/lib/assignNotify";
import { notifyAssignments } from "@/lib/assignNotifyDispatch.server";
import { signInEnabled } from "@/lib/flags";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!signInEnabled()) return reply({ error: "Not found" }, 404);
  let ids: string[];
  try {
    const text = await request.text();
    if (text.length > 100_000) throw new Error();
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1
      || !Array.isArray(body.taskIds) || !body.taskIds.length || body.taskIds.length > 50 || !body.taskIds.every(assignmentTaskId)) throw new Error();
    ids = [...new Set<string>(body.taskIds)];
  } catch { return reply({ error: "Send a JSON object with 1–50 task IDs only." }, 400); }
  try {
    let senderEmail: string | undefined;
    const authorization = request.headers.get("authorization");
    if (authorization !== null) {
      const token = /^Bearer ([^\s]{1,8192})$/i.exec(authorization)?.[1];
      if (!token) return reply({ error: "Sign in again." }, 401);
      const { pushIdentity, activePushPerson } = await import("@/lib/push.server");
      const identity = await pushIdentity(token);
      if (!identity || identity.revoked) return reply({ error: "Sign in again." }, 401);
      if (!await activePushPerson(identity.email)) return reply({ error: "Access has been removed." }, 403);
      senderEmail = identity.email;
    }
    const results = await notifyAssignments(ids, senderEmail);
    return reply({ results }, results.some((result) => result.status === "failed") ? 503 : 200);
  } catch { return reply({ error: "Assignment notices could not be processed." }, 503); }
}
