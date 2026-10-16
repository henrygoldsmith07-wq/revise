import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { defaultSettings } from "@/data/repository";
import { sync } from "@/data/sync";
import * as storage from "@/data/storage-namespace";
import { aiConsentSettingsPatch } from "@/domain/ai-consent";
import { localAiConsentGranted } from "@/ai/consent-client";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const at = "2026-09-02T00:00:00.000Z";

beforeEach(async () => { await clearAll(); });
afterEach(() => { vi.restoreAllMocks(); });

async function optedInSettings(userId = USER): Promise<void> {
  await (await getDb()).put("settings", {
    ...defaultSettings(userId), ...aiConsentSettingsPatch(true, new Date(at)), updatedAt: at,
  });
}

function settingsClient(): SupabaseClient {
  const remote = { ...defaultSettings(USER), ...aiConsentSettingsPatch(true, new Date(at)), updatedAt: at };
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => {
      const builder: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "eq", "or", "order", "gt"]) builder[method] = () => builder;
      builder.range = async () => ({ data: table === "user_settings" ? [{ user_id: USER, updated_at: at, data: remote }] : [], error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("local AI consent egress gate", () => {
  it("withholds until settings hold an explicit current opt-in", async () => {
    expect(await localAiConsentGranted()).toBe(false);
    await (await getDb()).put("settings", defaultSettings(USER));
    expect(await localAiConsentGranted()).toBe(false);
    await optedInSettings();
    expect(await localAiConsentGranted()).toBe(true);
  });

  it("a pending opt-out vetoes a current opt-in imported by ordinary settings sync", async () => {
    const db = await getDb();
    await db.put("settings", { ...defaultSettings(USER), updatedAt: "2026-09-01T00:00:00.000Z" });
    // Device clock is slow; the explicit OFF is not settled by this generic pull.
    await storage.writeReviseUserMeta("aiConsentPending", USER, { enabled: false, at: "2000-01-01T00:00:00.000Z" });
    const result = await sync(USER, { client: settingsClient(), online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(1);
    expect((await db.get("settings", USER))?.aiEnabled).toBe(true);
    expect(await localAiConsentGranted()).toBe(false);
  });

  it("does not borrow another account's pending choice", async () => {
    await optedInSettings();
    await storage.writeReviseUserMeta("aiConsentPending", OTHER, { enabled: false, at });
    expect(await localAiConsentGranted()).toBe(true);
    await storage.writeReviseUserMeta("aiConsentPending", USER, { enabled: false, at });
    expect(await localAiConsentGranted()).toBe(false);
  });

  it("pending ON does not bypass absent settings opt-in and does not block a legitimate opt-in", async () => {
    await storage.writeReviseUserMeta("aiConsentPending", USER, { enabled: true, at });
    await (await getDb()).put("settings", defaultSettings(USER));
    expect(await localAiConsentGranted()).toBe(false);
    await optedInSettings();
    expect(await localAiConsentGranted()).toBe(true);
  });

  it("fails closed when pending metadata cannot be read", async () => {
    await optedInSettings();
    vi.spyOn(storage, "readReviseUserMeta").mockRejectedValue(new Error("storage unavailable"));
    expect(await localAiConsentGranted()).toBe(false);
  });
});
