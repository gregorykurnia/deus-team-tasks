import { adminLeaveRoute, leaveVersion } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function POST(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return adminLeaveRoute(request, async (leave, email) => {
    const input: unknown = await request.json().catch(() => null);
    return leave.changeLeaveHoliday(email, (await params).date, input, leaveVersion(request, leave));
  });
}

export function DELETE(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return adminLeaveRoute(request, async (leave, email) => leave.changeLeaveHoliday(email, (await params).date, null, leaveVersion(request, leave), true));
}
