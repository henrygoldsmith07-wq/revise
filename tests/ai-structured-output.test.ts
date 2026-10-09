import { describe, expect, it, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { aiExplain } from "@/ai/client";
import { AI_CONSENT_VERSION, aiConsentSettingsPatch } from "@/domain/ai-consent";
import { defaultSettings } from "@/data/repository";
import { getDb } from "@/data/db";
import { AI_TASKS, RESPONSE_SCHEMAS } from "@/ai/types";

// The transport checks consent before any request, so a test that exercises
// the response path must first record the opt-in the same way Settings does.
beforeEach(async () => {
  const db = await getDb();
  await db.put("settings", {
    ...defaultSettings("local"),
    ...aiConsentSettingsPatch(true),
    aiConsentVersion: AI_CONSENT_VERSION,
  });
});

describe("AI structured output contracts", () => {
  it("registers a response schema for every task", () => {
    for (const task of AI_TASKS) {
      expect(RESPONSE_SCHEMAS[task], task).toBeDefined();
      expect(RESPONSE_SCHEMAS[task].safeParse({}).success, task).toBe(false);
    }
  });

  it("turns a malformed successful HTTP response into an honest fallback", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "ai",
      data: { explanation: 42 },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const result = await aiExplain("missing-topic");
    expect(result.source).toBe("fallback");
    expect(result.note).toContain("structured output contract");
    vi.unstubAllGlobals();
  });
});
