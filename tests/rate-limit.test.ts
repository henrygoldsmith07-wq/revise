import { describe, expect, it, beforeEach } from "vitest";
import {
  AI_RATE_LIMIT,
  AI_TASK_COSTS,
  aiDailyLimit,
  aiTaskCost,
  clientKey,
  rateLimit,
  rateLimitWithCost,
  resetRateLimiterForTests,
  resolveRateLimitKey,
  setRateLimiterBackend,
  getRateLimiterBackend,
} from "@/lib/rate-limit";

function req(ip = "1.2.3.4"): Request {
  return new Request("https://revise.local/api/ai", { headers: { "x-forwarded-for": ip } });
}

describe("rate limiting", () => {
  beforeEach(() => resetRateLimiterForTests());

  it("allows burst then rejects with retry-after", () => {
    const opts = { ratePerMinute: 60, burst: 3 };
    expect(rateLimit("k1", opts).ok).toBe(true);
    expect(rateLimit("k1", opts).ok).toBe(true);
    expect(rateLimit("k1", opts).ok).toBe(true);
    const limited = rateLimit("k1", opts);
    expect(limited.ok).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(limited.limitedBy).toBe("minute");
  });

  it("refills over time (per-minute sustained rate)", () => {
    const backend = getRateLimiterBackend();
    const opts = { ratePerMinute: 60, burst: 2 };
    const t0 = Date.now();
    expect(backend.check("refill", 1, opts, t0).ok).toBe(true);
    expect(backend.check("refill", 1, opts, t0).ok).toBe(true);
    expect(backend.check("refill", 1, opts, t0).ok).toBe(false);
    // 60/min = 1/sec: after 1.2s one token refills.
    expect(backend.check("refill", 1, opts, t0 + 1200).ok).toBe(true);
  });

  it("enforces an optional daily allowance", () => {
    const opts = { ratePerMinute: 1000, burst: 1000, dailyLimit: 3 };
    expect(rateLimitWithCost("daily", 1, opts).ok).toBe(true);
    expect(rateLimitWithCost("daily", 1, opts).ok).toBe(true);
    expect(rateLimitWithCost("daily", 1, opts).ok).toBe(true);
    const limited = rateLimitWithCost("daily", 1, opts);
    expect(limited.ok).toBe(false);
    expect(limited.limitedBy).toBe("daily");
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("accounts task-level cost (ocr costs more than explain)", () => {
    expect(aiTaskCost("ocr")).toBeGreaterThan(aiTaskCost("explain"));
    expect(aiTaskCost("extract-questions")).toBeGreaterThan(aiTaskCost("summarise"));
    expect(AI_TASK_COSTS.ocr).toBe(3);
    expect(AI_TASK_COSTS.explain).toBe(1);
    const opts = { ratePerMinute: 1000, burst: 5 };
    // OCR costs 3 of a burst-5 bucket: two calls exhaust it.
    expect(rateLimitWithCost("cost", aiTaskCost("ocr"), opts).ok).toBe(true);
    const second = rateLimitWithCost("cost", aiTaskCost("ocr"), opts);
    expect(second.ok).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("keys by authenticated user when known, else IP", () => {
    expect(resolveRateLimitKey(req("9.9.9.9"), "user-123")).toBe("user:user-123");
    expect(resolveRateLimitKey(req("9.9.9.9"), null)).toBe("ip:9.9.9.9");
    expect(resolveRateLimitKey(req("9.9.9.9"))).toBe("ip:9.9.9.9");
    expect(clientKey(req("5.6.7.8"))).toBe("5.6.7.8");
  });

  it("supports injecting a distributed backend and falling back to memory", () => {
    const calls: string[] = [];
    setRateLimiterBackend({
      name: "distributed",
      check: (key, cost) => {
        calls.push(`${key}:${cost}`);
        return { ok: true, retryAfterSeconds: 0, remaining: 99 };
      },
    });
    expect(getRateLimiterBackend().name).toBe("distributed");
    const res = rateLimitWithCost("any", 2, AI_RATE_LIMIT);
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["any:2"]);
    setRateLimiterBackend(null);
    expect(getRateLimiterBackend().name).toBe("memory");
  });

  it("reads the daily allowance from AI_DAILY_LIMIT with a safe default", () => {
    const prev = process.env.AI_DAILY_LIMIT;
    delete process.env.AI_DAILY_LIMIT;
    expect(aiDailyLimit()).toBe(500);
    process.env.AI_DAILY_LIMIT = "20";
    expect(aiDailyLimit()).toBe(20);
    process.env.AI_DAILY_LIMIT = "bogus";
    expect(aiDailyLimit()).toBe(500);
    if (prev === undefined) delete process.env.AI_DAILY_LIMIT;
    else process.env.AI_DAILY_LIMIT = prev;
  });
});
