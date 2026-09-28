import type { NextConfig } from "next";

// The standalone Vercel project is served at its domain root. An embedding
// shell can still opt into a path prefix, but it must be explicit so the
// normal production entrypoint never becomes a 404 merely because Vercel set
// its standard `VERCEL=1` environment flag.
const basePath = process.env.APP_BASE_PATH ?? "";
const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:" + (isDev ? " 'unsafe-eval'" : ""),
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Set by the one-origin shell (apps/ecosystem-shell) to serve this app under
  // a path prefix. Unset means "serve at the root", which is exactly how this
  // app deploys on its own today, so leaving the variable alone changes nothing.
  basePath,
  // The Hoplite preview tunnel serves the dev server from a *.preview.usehoplite.com
  // hostname, which Next 16 otherwise treats as cross-origin and blocks from dev
  // resources (chunks fail to load and the app never hydrates in the preview).
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.preview.usehoplite.com"],
  // The service worker and manifest are served straight from /public; no
  // build-time PWA plugin is needed and none is wanted — a hand-written
  // worker is easier to reason about than a generated one.
  // Perf budgets are enforced in tests/perf.test.ts. Next owns immutable
  // caching for /_next/static; overriding it here causes dev/build warnings and
  // can interfere with framework cache semantics. Only app-owned endpoints get
  // explicit cache policy below.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
