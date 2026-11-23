import "server-only";
import { leaveEnabled } from "./flags";

type LeaveAction = (leave: typeof import("./leave.server"), email: string) => Promise<object>;

export async function leaveRoute(request: Request, action: LeaveAction): Promise<Response> {
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

export function adminLeaveRoute(request: Request, action: LeaveAction): Promise<Response> {
  return leaveRoute(request, (leave, email) => {
    if (!leave.isLeaveAdmin(email)) throw new leave.LeaveError(403, "Only a Leave admin can do this.");
    return action(leave, email);
  });
}

export function leaveVersion(request: Request, leave: typeof import("./leave.server")): number {
  const header = request.headers.get("If-Match");
  if (header === null) return 0;
  const match = /^"(0|[1-9]\d{0,15})"$/.exec(header);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version)) throw new leave.LeaveError(400, "Use the version from the last Leave read.");
  return version;
}
