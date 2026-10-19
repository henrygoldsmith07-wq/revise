/** Fetch a lazily loaded chunk once the page is idle. The service worker only
 *  caches what has been fetched, so a modal split out of the shell must still
 *  be downloaded while online or it would not open offline. */
export function preloadWhenIdle(load: () => Promise<unknown>): () => void {
  const run = () => void load().catch(() => undefined);
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 5_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 2_000);
  return () => window.clearTimeout(id);
}
