import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import robots from "@/app/robots";
import { isRenderingCrawler } from "@/lib/crawlers";
import { proxy } from "@/proxy";

const HEADLESS = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.0 Safari/537.36";
const REFLECTION = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Reflectionbot/1.0; +https://reflection.ai/bot)";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";

const visit = (userAgent: string) => proxy(new NextRequest("https://team.deushcs.com/plan", { headers: { "user-agent": userAgent } }));

describe("crawlers", () => {
  it("knows the crawlers that ran the app's JavaScript", () => {
    expect(isRenderingCrawler(HEADLESS)).toBe(true);
    expect(isRenderingCrawler(REFLECTION)).toBe(true);
  });

  it("lets people's browsers and the chat connectors through", () => {
    for (const ua of [MAC_CHROME, IPHONE, "openai-mcp/1.0.0", "Claude-User", ""]) expect(isRenderingCrawler(ua)).toBe(false);
    expect(isRenderingCrawler(null)).toBe(false);
  });

  it("turns crawlers away from pages and lets people in", () => {
    expect(visit(HEADLESS).status).toBe(403);
    expect(visit(REFLECTION).status).toBe(403);
    expect(visit(MAC_CHROME).headers.get("x-middleware-next")).toBe("1");
  });

  it("asks every crawler to stay out", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
