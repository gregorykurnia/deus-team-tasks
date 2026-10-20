import type { NextConfig } from "next";

// One id per build: it names the service worker's cache, so a new deployment never reads an old one's files.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? `local-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  generateBuildId: async () => buildId,
  async headers() {
    return [
      // The worker itself is never kept by the browser's cache, so an update is noticed at once.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
