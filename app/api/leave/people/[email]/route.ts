import { adminLeaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function GET(request: Request, { params }: { params: Promise<{ email: string }> }) {
  return adminLeaveRoute(request, async (leave, email) => leave.readPersonLeave(email, (await params).email));
}
