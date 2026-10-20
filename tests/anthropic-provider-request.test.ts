import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getProvider } from "../src/ai/provider";

// Current Claude models answer a sampling parameter (temperature, top_p,
// top_k) with a 400. The provider used to send temperature on every call, so
// every Anthropic task failed over to the offline fallback without a trace.

describe("Anthropic provider request", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function sentBody(): Promise<Record<string, unknown>> {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] }), { status: 200 }),
    );
    await getProvider()!.complete({ system: "s", messages: [{ role: "user", content: "q" }], temperature: 0.9 });
    return JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as Record<string, unknown>;
  }

  it("sends no sampling parameters, even when a caller asks for a temperature", async () => {
    const body = await sentBody();
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
  });

  it("defaults to the current Sonnet at low effort", async () => {
    const body = await sentBody();
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.output_config).toEqual({ effort: "low" });
  });
});
