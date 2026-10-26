import type { NextConfig } from "next";

// The standalone Vercel project is served at its domain root. An embedding
// shell can still opt into a path prefix, but it must be explicit so the
// normal production entrypoint never becomes a 404 merely because Vercel set
// its standard `VERCEL=1` environment flag.
const basePath = process.env.APP_BASE_PATH ?? "";
const isDev = process.env.NODE_ENV === "development";

// Pages get a per-request nonce CSP from src/proxy.ts, with no allowance for
// inline scripts. It must not also be set here: browsers enforce every CSP header,
// and a nonce-less one would block Next's own nonced inline scripts. API
// responses are never documents and get the strict policy below.
//
// The proxy skips paths that end in a file extension: public files (the
// diagrams, sw.js, domain-worker.js, the PDF worker) and any page URL whose
// last segment contains a dot, which today is only a 404 such as /x.y (no
// question id in the bank ends in ".ext"). Those responses carry no nonce, so
// they get this static policy instead of none: no inline script at all, so a
// file opened as a document cannot run injected script, and workers keep the
// same-origin, blob: and wasm allowances they had before the nonce proxy. A
// nonce-less page at such a path renders but does not hydrate. The two
// sources are disjoint: a path either ends in an extension or the proxy runs.
const staticFileContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval' blob:" + (isDev ? " 'unsafe-eval'" : ""),
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

// Stamped into the client at build time and passed to the service worker as
// /sw.js?v=<id> (src/components/ServiceWorker.tsx), so each deploy gets its own
// cache name and the worker's activate step deletes the previous build's.
// A commit sha when the host provides one, else the build's start time.
const buildId =
  process.env.REVISE_BUILD_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
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
  // Teachers look for /teacher; class management lives at /classes. A
  // temporary redirect, so the path can become its own page later.
  async redirects() {
    return [{ source: "/teacher", destination: "/classes", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Exactly the paths src/proxy.ts does not match (extension-ending,
        // outside /api and /_next): see staticFileContentSecurityPolicy above.
        source: "/:path((?!api(?:/|$)|_next/).*\\.[a-zA-Z0-9]+)",
        headers: [{ key: "Content-Security-Policy", value: staticFileContentSecurityPolicy }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Every API except the markdown twins, which are public, shared-cacheable
        // text and set their own Cache-Control (src/lib/md/http.ts).
        source: "/api/:path((?!md(?:/|$)).*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" },
        ],
      },
      {
        source: "/api/md/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }],
      },
    ];
  },
};

export default nextConfig;
