import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set by the one-origin shell (apps/ecosystem-shell) to serve this app under
  // a path prefix. Unset means "serve at the root", which is exactly how this
  // app deploys on its own today, so leaving the variable alone changes nothing.
  basePath: process.env.APP_BASE_PATH || "",
  // The service worker and manifest are served straight from /public; no
  // build-time PWA plugin is needed and none is wanted — a hand-written
  // worker is easier to reason about than a generated one.
  // Perf budgets are enforced in tests/perf.test.ts; headers are cache + security hints.
  // Lighthouse/PWA checks: next build must keep .next/static chunks cacheable and /api/* uncached.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
