import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Runs public/sw.js against a minimal fake service-worker global.

interface FakeResponse { url: string; ok: boolean; clone(): FakeResponse; text(): Promise<string> }

// A route shell's HTML names its own chunk, the way Next's server output does.
function response(url: string): FakeResponse {
  const path = new URL(url, "https://revise.test").pathname;
  const html = path.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(path)
    ? ""
    : `<script src="/_next/static/chunks/app${path === "/" ? "/index" : path}-abc123.js" async></script><link rel="stylesheet" href="/_next/static/css/app-1.css">`;
  return { url, ok: true, clone() { return response(url); }, text: async () => html };
}

function loadWorker(scriptUrl: string, cachedKeys: string[] = []) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, FakeResponse>>();
  for (const key of cachedKeys) stores.set(key, new Map());
  const keyOf = (request: string | { url: string }, ignoreSearch = false) => {
    const url = new URL(typeof request === "string" ? request : request.url, "https://revise.test");
    return ignoreSearch ? url.pathname : url.pathname + url.search;
  };
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, FakeResponse>();
    stores.set(name, store);
    return {
      add: async (url: string) => { store.set(keyOf(url), response(url)); },
      match: async (request: string | { url: string }) => store.get(keyOf(request)),
      put: async (request: { url: string }, value: FakeResponse) => { store.set(keyOf(request), value); },
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (request: string | { url: string }, options?: { ignoreSearch?: boolean }) => {
      for (const store of stores.values()) {
        if (options?.ignoreSearch) {
          for (const [key, value] of store) if (key.split("?")[0] === keyOf(request, true)) return value;
        } else {
          const hit = store.get(keyOf(request));
          if (hit) return hit;
        }
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(scriptUrl, "https://revise.test"),
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  let online = true;
  const fetch = async (request: { url: string }) => {
    if (!online) throw new TypeError("Failed to fetch");
    return response(request.url);
  };
  runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), { self, caches, fetch, URL, Promise });
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<unknown> | undefined;
    handlers.get(type)!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<unknown>) => { responded = p; } });
    await Promise.all(waits);
    return responded;
  };
  return { stores, dispatch, setOnline: (value: boolean) => { online = value; } };
}

describe("service worker", () => {
  it("serves the precached route shell for an offline deep link with a query string", async () => {
    const worker = loadWorker("/sw.js?v=build-1");
    await worker.dispatch("install");
    worker.setOnline(false);
    for (const path of ["/practice?guided=1", "/lesson?checkpoint=wjec-alevel-physics.capacitance.sp-01"]) {
      const request = { url: `https://revise.test${path}`, method: "GET", mode: "navigate" };
      const served = (await (await worker.dispatch("fetch", { request }))) as FakeResponse;
      expect(new URL(served.url, "https://revise.test").pathname).toBe(path.split("?")[0]);
    }
  });

  it("caches every script and stylesheet the precached shells reference, so an unvisited route still runs offline", async () => {
    const worker = loadWorker("/sw.js?v=build-3");
    await worker.dispatch("install");
    const keys = [...worker.stores.get("revise-v8-build-3")!.keys()];
    expect(keys).toContain("/_next/static/chunks/app/diagnostic-abc123.js");
    expect(keys).toContain("/_next/static/chunks/app/index-abc123.js");
    expect(keys).toContain("/_next/static/css/app-1.css");
  });

  it("names its cache after the build it was registered for, so activating a new build deletes old caches", async () => {
    const worker = loadWorker("/sw.js?v=build-2", ["revise-v8", "revise-v8-build-1"]);
    await worker.dispatch("install");
    await worker.dispatch("activate");
    expect([...worker.stores.keys()]).toEqual(["revise-v8-build-2"]);
  });

  it("is registered with the build id", () => {
    const registration = readFileSync(join(process.cwd(), "src/components/ServiceWorker.tsx"), "utf8");
    expect(registration).toContain("/sw.js?v=");
    expect(registration).toContain("NEXT_PUBLIC_BUILD_ID");
    expect(readFileSync(join(process.cwd(), "next.config.ts"), "utf8")).toContain("NEXT_PUBLIC_BUILD_ID");
  });
});
