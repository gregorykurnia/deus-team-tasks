import "server-only";
import { leaveEnabled } from "./flags";

export async function leaveRoute(
  request: Request,
  action: (leave: typeof import("./leave.server"), email: string) => Promise<object>,
): Promise<Response> {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!leaveEnabled()) return reply({ error: "Not found" }, 404);
  const token = /^Bearer ([^\s]{1,8192})$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return reply({ error: "Sign in again." }, 401);

  try {
    const { pushIdentity } = await import("./push.server");
    const identity = await pushIdentity(token);
    if (!identity || identity.revoked) return reply({ error: "Sign in again." }, 401);

    const leave = await import("./leave.server");
    try {
      return reply(await action(leave, identity.email));
    } catch (error) {
      if (!(error instanceof leave.LeaveError)) throw error;
      return reply({ error: error.message, issues: error.issues }, error.status);
    }
  } catch {
    return reply({ error: "Leave needs a connection. Try again." }, 503);
  }
}
