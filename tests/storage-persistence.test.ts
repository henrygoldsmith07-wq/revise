import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll } from "@/data/db";
import { readReviseMeta } from "@/data/storage-namespace";
import { readStoragePersistence, requestPersistentStorage } from "@/data/storage-persistence";
import { readFileSync } from "node:fs";

// No code asked the browser to keep IndexedDB, so a local-only learner's only
// copy was best-effort storage (Safari's seven-day rule, Chrome eviction).

beforeEach(async () => {
  await clearAll();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistent storage", () => {
  it("requests persistence, stores the outcome and reports it", async () => {
    let granted = false;
    const persist = vi.fn(async () => { granted = true; return true; });
    vi.stubGlobal("navigator", { storage: { persist, persisted: async () => granted } });
    expect(await requestPersistentStorage()).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await readReviseMeta<{ state: string }>("storagePersistence")).toMatchObject({ state: "persisted" });
    expect(await readStoragePersistence()).toBe("persisted");
  });

  it("does not ask again when the browser already persists, and records a refusal honestly", async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persist, persisted: async () => true } });
    expect(await requestPersistentStorage()).toBe("persisted");
    expect(persist).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", { storage: { persist: async () => false, persisted: async () => false } });
    expect(await requestPersistentStorage()).toBe("best-effort");
  });

  it("degrades to unsupported without the Storage API", async () => {
    vi.stubGlobal("navigator", {});
    expect(await requestPersistentStorage()).toBe("unsupported");
    expect(await readStoragePersistence()).toBe("unsupported");
  });

  it("is requested when onboarding completes and shown in Settings", () => {
    const store = readFileSync("src/state/store.tsx", "utf8");
    const onboarding = store.slice(store.indexOf("const completeOnboarding"), store.indexOf("const patch = useCallback"));
    expect(onboarding).toContain("requestPersistentStorage()");
    expect(readFileSync("src/app/settings/page.tsx", "utf8")).toContain("STORAGE_PERSISTENCE_COPY");
  });
});
