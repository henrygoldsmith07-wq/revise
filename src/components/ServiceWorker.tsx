"use client";

import { useEffect } from "react";

/** Registers the PWA worker. Failure is non-fatal: the app just loses its
 *  offline shell, and IndexedDB keeps working regardless. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    // The build id names the worker's cache (public/sw.js), so each deploy
    // installs a fresh worker whose activate step deletes older caches.
    const build = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev");
    const register = () => navigator.serviceWorker.register(`/sw.js?v=${build}`).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
