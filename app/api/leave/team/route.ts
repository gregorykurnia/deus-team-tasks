import { adminLeaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function GET(request: Request) {
  return adminLeaveRoute(request, (leave, email) => leave.readTeamLeave(email));
}
