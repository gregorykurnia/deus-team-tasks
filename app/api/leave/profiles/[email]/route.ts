import { adminLeaveRoute, leaveVersion } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function PUT(request: Request, { params }: { params: Promise<{ email: string }> }) {
  return adminLeaveRoute(request, async (leave, email) => {
    const input: unknown = await request.json().catch(() => null);
    return { profile: await leave.saveLeaveProfile(email, (await params).email, input, leaveVersion(request, leave)) };
  });
}
