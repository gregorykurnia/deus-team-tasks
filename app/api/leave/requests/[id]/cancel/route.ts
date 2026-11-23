import { leaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return leaveRoute(request, async (leave, email) => ({ request: await leave.cancelLeaveRequest(email, (await params).id) }));
}
