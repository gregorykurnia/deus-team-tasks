import { leaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function GET(request: Request) {
  if (new URL(request.url).searchParams.get("view") === "badge") {
    return leaveRoute(request, (leave, email) => leave.readLeaveBadge(email));
  }
  return leaveRoute(request, (leave, email) => leave.readMyLeave(email));
}
