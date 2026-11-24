import type { MetadataRoute } from "next";

// A private team app: no crawler should load it (each visit reads every task; lib/crawlers.ts).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
