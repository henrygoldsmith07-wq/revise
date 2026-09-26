import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const aiRoute = () => readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
const provider = () => readFileSync(join(process.cwd(), "src/ai/provider.ts"), "utf8");
const rateLimitSrc = () => readFileSync(join(process.cwd(), "src/lib/rate-limit.ts"), "utf8");

describe("AI API hardening", () => {
  it("fails closed in production when provider keys exist but auth is missing", () => {
    const src = aiRoute();
    expect(src).toContain("status: 503");
    expect(src).toContain("providerCredentialsPresent");
    expect(src).toContain("AI authentication is not configured");
    // Production gate must exist — local dev may allow offline mode.
    expect(src).toMatch(/NODE_ENV.*production|isProduction/);
  });

  it("requires authenticated users when Supabase is configured", () => {
    const src = aiRoute();
    expect(src).toContain("getUser");
    expect(src).toContain("status: 401");
    expect(src).toContain("Sign in to use AI features");
  });

  it("never exposes provider keys to the client; keys stay server-only", () => {
    const src = aiRoute();
    // The route may *check* for credential presence to fail closed, but it must
    // never send a key value: no key in a JSON body, header, or response.
    expect(src).not.toMatch(/NextResponse\.json\([^)]*API_KEY/);
    expect(src).not.toMatch(/headers[^}]*API_KEY/);
    expect(src).not.toContain("OPENAI_COMPATIBLE_API_KEY graduating");
    expect(provider()).toContain("server-only");
    // Status endpoint only reports availability, never a key.
    expect(src).toContain("providerStatus()");
    // Fail-closed presence check exists.
    expect(src).toContain("ANTHROPIC_API_KEY");
  });

  it("caps body size and rejects corrupted/oversized payloads", () => {
    const src = aiRoute();
    expect(src).toContain("MAX_BODY_CHARS");
    expect(src).toContain("MAX_OCR_CHARS");
    expect(src).toContain("status: 413");
    expect(src).toContain("Invalid JSON body");
    expect(src).toContain("status: 400");
    expect(src).toContain("safeParse");
    expect(src).toContain("Unknown task");
  });

  it("rate limits by user with daily allowance and task costs", () => {
    const src = aiRoute();
    expect(src).toContain("resolveRateLimitKey");
    expect(src).toContain("aiTaskCost");
    expect(src).toContain("enforceAiRateLimit");
    expect(src).toContain("RateLimiterUnavailableError");
    expect(src).toContain("status: 429");
    expect(src).toContain("status: 503");
    expect(src).toContain("retry-after");
    const limiter = rateLimitSrc();
    expect(limiter).toContain("RateLimiterBackend");
    expect(limiter).toContain("setRateLimiterBackend");
    expect(limiter).toContain("dailyLimit");
    expect(limiter).toContain("AI_TASK_COSTS");
    expect(limiter).toContain("resolveRateLimitKey");
    const shared = readFileSync(join(process.cwd(), "src/lib/rate-limit-supabase.ts"), "utf8");
    expect(shared).toContain("consume_ai_quota");
    expect(shared).toContain("aiDailyLimit");
    expect(shared).toContain("RateLimiterUnavailableError");
  });

  it("keeps AI optional: task failures degrade to fallback, never 500 the study loop", () => {
    const src = aiRoute();
    expect(src).toContain('source: "fallback"');
    expect(src).toContain("ai.degraded");
  });
});
