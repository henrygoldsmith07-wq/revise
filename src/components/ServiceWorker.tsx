"use client";

import { useEffect } from "react";

/** Registers the PWA worker. Failure is non-fatal: the app just loses its
 *  offline shell, and IndexedDB keeps working regardless. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
