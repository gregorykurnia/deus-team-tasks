import { adminLeaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function POST(request: Request) {
  return adminLeaveRoute(request, async (leave, email) => {
    const input: unknown = await request.json().catch(() => null);
    return { adjustment: await leave.adjustLeaveBalance(email, input, request.headers.get("Idempotency-Key")) };
  });
}
