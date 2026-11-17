import { handlePush } from "@/lib/pushRoute";

export const runtime = "nodejs";
export function POST(request: Request) { return handlePush(request, "save"); }
export function DELETE(request: Request) { return handlePush(request, "remove"); }
