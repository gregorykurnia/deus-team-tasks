import { leaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function POST(request: Request) {
  return leaveRoute(request, async (leave, email) => {
    const input: unknown = await request.json().catch(() => {
      throw new leave.LeaveError(400, "Send a JSON leave request.");
    });
    return { request: await leave.createLeaveRequest(email, input, request.headers.get("idempotency-key")) };
  });
}
