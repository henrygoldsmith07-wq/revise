// Service worker: app-shell precache + stale-while-revalidate for navigations.
//
// Revision *data* lives in IndexedDB and is never cached here — the worker's
// only job is making sure the app itself loads with no network.
//
// Cache versioning: src/components/ServiceWorker.tsx registers this script as
// /sw.js?v=<build id> (NEXT_PUBLIC_BUILD_ID, stamped by next.config.ts at
// build time). A new deploy changes the script URL, so the browser installs
// this worker again, its cache gets a new name, and `activate` deletes every
// older cache — including the hashed /_next chunks earlier builds left behind,
// which used to pile up for ever under one constant name. Bump CACHE_BASE only
// to invalidate shells within one build id (never needed in production).
//
// Each precached shell's /_next/static assets are cached at install too
// (precacheShellAssets), so a route never visited online still runs offline.

const CACHE_BASE = "revise-v8";
const BUILD_ID = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_VERSION = `${CACHE_BASE}-${BUILD_ID}`;
// Precaches every App Router shell so the whole app loads offline.
// Keep this in sync with src/app/**/page.tsx — tests/perf.test.ts walks the
// tree (not just top-level directories) and fails when a route is missing.
const APP_SHELL = [
  "/",
  "/adaptive-session",
  "/lesson",
  "/library",
  "/papers",
  "/practice",
  "/readiness",
  "/readiness/spec",
  "/readiness/trusted-coverage",
  "/diagnostic",
  "/review",
  "/schedule",
  "/settings",
  "/shared",
  "/study",
  "/classes",
  "/technique",
  "/practicals",
  "/twin",
  "/tutor",
  "/welcome",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/fonts/inter-latin-wght-normal.woff2",
  "/fonts/inter-latin-ext-wght-normal.woff2",
  // Authored Label a diagram assets: precache them so the first diagram round
  // is available offline, even before the browser has fetched the image once.
  "/diagrams/animal-cell.svg",
  "/diagrams/alveolus.svg",
  "/diagrams/series-circuit.svg",
  "/diagrams/free-body.svg",
  "/diagrams/probability-venn.svg",
  "/diagrams/energy-profile.svg",
];

// The /_next/static files a cached page needs. A route shell whose scripts were
// never fetched (a route not visited online) opens offline as dead HTML, so
// install caches every asset the precached pages reference, not just the HTML.
const NEXT_ASSET = /\/_next\/static\/[^"'\s)\\]+/g;

async function precacheShellAssets(cache) {
  const assets = new Set();
  for (const url of APP_SHELL) {
    if (/\.[a-z0-9]+$/i.test(url)) continue; // fonts, icons, svg: no page markup
    const page = await cache.match(url);
    if (!page || typeof page.text !== "function") continue;
    const html = await page.clone().text().catch(() => "");
    for (const asset of html.match(NEXT_ASSET) ?? []) assets.add(asset);
  }
  await Promise.allSettled([...assets].map((asset) => cache.add(asset)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individually, so one 404 during a deploy cannot fail the whole install.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))).then(() => precacheShellAssets(cache)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // AI responses are never cached: a stale explanation is worse than none.
  if (url.pathname.startsWith("/api/")) return;
  // The reviewer portal is signed-in, teacher-only and server-rendered: never
  // cache it, so a shared device cannot replay a reviewer's queue offline.
  if (url.pathname === "/reviewer" || url.pathname.startsWith("/reviewer/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined));
          }
          return response;
        })
        // Offline: the exact URL if it was cached, else the precached shell
        // for the same route — deep links such as /practice?guided=1 or
        // /lesson?checkpoint=… carry a query the precache never saw, and
        // the page reads it client-side — and only then the home shell.
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(request, { ignoreSearch: true }))
            .then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
