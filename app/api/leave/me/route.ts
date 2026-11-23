import { leaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function GET(request: Request) {
  return leaveRoute(request, (leave, email) => leave.readMyLeave(email));
}
