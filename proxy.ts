import { NextResponse, type NextRequest } from "next/server";
import { isRenderingCrawler } from "@/lib/crawlers";

// Pages only: the chat connector (/api) and static files are never turned away.
export function proxy(request: NextRequest) {
  if (isRenderingCrawler(request.headers.get("user-agent"))) {
    return new NextResponse("Not available to crawlers.", { status: 403, headers: { "X-Robots-Tag": "noindex" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|robots\\.txt|.*\\.[a-z0-9]+$).*)"],
};
