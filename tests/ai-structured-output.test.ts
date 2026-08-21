import { describe, expect, it, vi } from "vitest";
import { aiExplain } from "@/ai/client";
import { AI_TASKS, RESPONSE_SCHEMAS } from "@/ai/types";

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
