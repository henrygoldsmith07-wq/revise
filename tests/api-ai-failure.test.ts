import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

// A task layer that throws unexpectedly (not a model fallback): the route
// must answer 500 without leaking internals, while every other contract
// (validation, auth) still holds.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      }),
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/ai/tasks", () => ({
  payloadSchemas: { explain: z.object({ topicId: z.string() }) },
  explain: async () => {
    throw new Error("model exploded");
  },
}));

import { POST as aiPost } from "@/app/api/ai/route";
import { resetRateLimiterForTests } from "@/lib/rate-limit";

describe("AI route unexpected task failure", () => {
  beforeEach(() => resetRateLimiterForTests());

  it("answers 500 without leaking the exception", async () => {
    const res = await aiPost(
      new Request("https://x/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "explain", payload: { topicId: "t" } }),
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("The AI service failed unexpectedly.");
    expect(JSON.stringify(body)).not.toContain("model exploded");
  });
});
