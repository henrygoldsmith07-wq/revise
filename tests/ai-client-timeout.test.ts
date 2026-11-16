import { describe, expect, it, vi } from "vitest";

// A provider that accepts headers then stalls must not leave the runner
// waiting forever. The client aborts its own request and uses the same offline
// fallback it uses for any other AI failure.

vi.mock("@/ai/transport", () => ({
  AI_OFF_NOTE: "AI features are off.",
  sendAiTask: vi.fn(async (_task: unknown, _payload: unknown, _fetchFn: unknown, signal?: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  ),
}));

import { aiExplain } from "@/ai/client";

const AI_TIMEOUT_MS = 30_000;

describe("AI client timeout", () => {
  it("falls back when the request never settles instead of hanging", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.useFakeTimers();
    try {
      const pending = aiExplain("wjec-alevel-physics.electric-circuits");
      await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
      const result = await pending;
      expect(result.source).toBe("fallback");
      expect(result.note).toBe("timeout");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
