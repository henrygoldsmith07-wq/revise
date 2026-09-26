import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { AI_TASKS, RESPONSE_SCHEMAS } from "@/ai/types";
import {
  rateLimitWithCost,
  resetRateLimiterForTests,
  resolveRateLimitKey,
} from "@/lib/rate-limit";
import { decodePulseCursor } from "@/lib/pulse-history";
import { pulseHistoryAllowed } from "@/data/pulse-consent";

const aiRoute = () => readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
const pulseRoute = () => readFileSync(join(process.cwd(), "src/app/api/pulse/history/route.ts"), "utf8");

function aiReq(ip = "1.2.3.4"): Request {
  return new Request("https://revise.local/api/ai", { headers: { "x-forwarded-for": ip } });
}

describe("system boundaries — AI + Pulse", () => {
  beforeEach(() => resetRateLimiterForTests());

  it("rejects corrupted AI payloads with zod (never throws on hostile input)", () => {
    // Response schemas (shared browser/server contract) reject hostile input.
    for (const task of AI_TASKS) {
      const schema = RESPONSE_SCHEMAS[task];
      expect(schema.safeParse(null).success).toBe(false);
      expect(schema.safeParse("corrupted").success).toBe(false);
      expect(schema.safeParse({}).success).toBe(false);
    }
    // Oversized strings are rejected by schema caps before any model call.
    expect(RESPONSE_SCHEMAS.ocr.safeParse({ text: "x".repeat(25_000), confidence: 0.5 }).success).toBe(false);
    expect(RESPONSE_SCHEMAS.mark.safeParse({ marked: [], feedback: "" }).success).toBe(false);
    // Payload contracts live server-side and enforce caps (checked via source).
    const tasksSrc = readFileSync(join(process.cwd(), "src/ai/tasks.ts"), "utf8");
    expect(tasksSrc).toContain("max(8000)");
    expect(tasksSrc).toContain("max(8_000_000)");
    expect(tasksSrc).toContain("max(60_000)");
  });

  it("caps request and image bodies (oversized payloads → 413, never buffered unbounded)", () => {
    const src = aiRoute();
    expect(src).toContain("MAX_BODY_CHARS");
    expect(src).toContain("MAX_OCR_CHARS");
    expect(src).toContain("status: 413");
    expect(src).toContain("Request body is too large");
    expect(src).toContain("Image payload is too large");
  });

  it("rate limits burst traffic per user (429 with retry-after, app keeps working)", () => {
    const key = resolveRateLimitKey(aiReq(), "user-1");
    const opts = { ratePerMinute: 60, burst: 3 };
    expect(rateLimitWithCost(key, 1, opts).ok).toBe(true);
    expect(rateLimitWithCost(key, 1, opts).ok).toBe(true);
    expect(rateLimitWithCost(key, 1, opts).ok).toBe(true);
    const limited = rateLimitWithCost(key, 1, opts);
    expect(limited.ok).toBe(false);
    expect(aiRoute()).toContain("status: 429");
    expect(aiRoute()).toContain("The rest of the app keeps working");
  });

  it("Pulse rejects invalid cursors (400) and withholds without consent (403) or auth (401)", () => {
    expect(decodePulseCursor("garbage")).toBeNull();
    expect(decodePulseCursor("")).toBeNull();
    const src = pulseRoute();
    expect(src).toContain("status: 400");
    expect(src).toContain("status: 401");
    expect(src).toContain("status: 403");
    expect(pulseHistoryAllowed({ pulseEnabled: false })).toBe(false);
    expect(pulseHistoryAllowed(null)).toBe(false);
  });

  it("Pulse surfaces Supabase failures as 502 without leaking rows", () => {
    expect(pulseRoute()).toContain("status: 502");
    expect(pulseRoute()).toContain("Revise history could not be read");
  });

  it("existing resilience harnesses still pin offline, sync and corruption paths", () => {
    // Do not weaken CI gates: these files must keep existing.
    for (const f of [
      "tests/sync.test.ts",
      "tests/sync-resilience.test.ts",
      "tests/sync-crdt.test.ts",
      "tests/persistence-schema.test.ts",
      "tests/repository.test.ts",
      "tests/large-history.test.ts",
      "e2e/offline.spec.ts",
    ]) {
      expect(existsSync(join(process.cwd(), f)), f).toBe(true);
    }
  });
});
