import { leaveRoute } from "@/lib/leaveRoute.server";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return leaveRoute(request, (leave, email) => leave.readAway(email, searchParams.get("from"), searchParams.get("to")));
}
