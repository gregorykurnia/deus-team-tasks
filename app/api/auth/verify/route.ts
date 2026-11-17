import { handleAuthCode } from "@/lib/authCodeRoute";

export const runtime = "nodejs";
export function POST(request: Request) { return handleAuthCode(request, "verify"); }
