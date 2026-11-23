import { adminLeaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminLeaveRoute(request, async (leave, email) => {
    const input: unknown = await request.json().catch(() => null);
    return { request: await leave.decideLeaveRequest(email, (await params).id, input) };
  });
}
