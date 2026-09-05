// Service worker: app-shell precache + stale-while-revalidate for navigations.
//
// Revision *data* lives in IndexedDB and is never cached here — the worker's
// only job is making sure the app itself loads with no network. Bump
// CACHE_VERSION to invalidate previously cached shells.

const CACHE_VERSION = "revise-v4";
// Precaches every App Router shell so the whole app loads offline.
// Keep this in sync with src/app/*/page.tsx — tests/perf.test.ts fails when a
// route is missing, and scripts/validate-curriculum.mjs also reports drift.
const APP_SHELL = [
  "/",
  "/benchmarks",
  "/answer-corpus",
  "/adaptive-session",
  "/cards",
  "/case-study",
  "/generate",
  "/lesson",
  "/library",
  "/papers",
  "/planner",
  "/practice",
  "/progress",
  "/question-evidence",
  "/readiness",
  "/response-time",
  "/review",
  "/schedule",
  "/settings",
  "/shared",
  "/study",
  "/tutor",
  "/twin",
  "/teacher",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  // Authored Label a diagram assets: precache them so the first diagram round
  // is available offline, even before the browser has fetched the image once.
  "/diagrams/animal-cell.svg",
  "/diagrams/alveolus.svg",
  "/diagrams/series-circuit.svg",
  "/diagrams/free-body.svg",
  "/diagrams/probability-venn.svg",
  "/diagrams/energy-profile.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individually, so one 404 during a deploy cannot fail the whole install.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
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

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
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
