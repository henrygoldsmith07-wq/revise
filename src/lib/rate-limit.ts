// Rate limiting with a pluggable backend.
//
// Production needs a shared limiter (multiple server instances must see the
// same quota); local development needs zero infrastructure. This module keeps
// a lightweight in-memory token bucket as the default and exposes a backend
// interface so production can inject a distributed store (Redis/Upstash)
// without touching callers.
//
// Enforces, per key:
//   - per-minute sustained rate + burst (token bucket)
//   - optional daily allowance (separate bucket, resets at UTC midnight)
//   - task-level cost accounting (expensive tasks consume more tokens)
//
// Keys are `user:<id>` when an authenticated user id is known, else `ip:<ip>`.

import type { AiTask } from "@/ai/types";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const minuteBuckets = new Map<string, Bucket>();
const dailyBuckets = new Map<string, { tokens: number; day: string }>();

export interface RateLimitOptions {
  /** Sustained requests per minute. */
  ratePerMinute: number;
  /** Maximum burst above the sustained rate. */
  burst: number;
  /** Optional max cost-units per UTC day. Undefined = no daily cap. */
  dailyLimit?: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
  /** Present when the daily allowance (not the per-minute bucket) rejected. */
  limitedBy?: "minute" | "daily";
}

export interface RateLimiterBackend {
  name: "memory" | "distributed";
  check(key: string, cost: number, options: RateLimitOptions, now?: number): RateLimitResult;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function currentMinuteBucket(key: string, options: RateLimitOptions, now: number): Bucket {
  const refillPerMs = options.ratePerMinute / 60_000;
  const bucket = minuteBuckets.get(key) ?? { tokens: options.burst, updatedAt: now };
  bucket.tokens = Math.min(options.burst, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
  bucket.updatedAt = now;
  return bucket;
}

function checkDailyBucket(key: string, cost: number, dailyLimit: number, now: number): RateLimitResult | null {
  const day = utcDay(now);
  const mapKey = `${key}:${day}`;
  const bucket = dailyBuckets.get(mapKey) ?? { tokens: dailyLimit, day };
  // Stale entry from a previous day (clock moved) — reset.
  const tokens = bucket.day === day ? bucket.tokens : dailyLimit;
  if (tokens < cost) {
    dailyBuckets.set(mapKey, { tokens, day });
    const secondsToMidnight = Math.max(
      1,
      Math.ceil((Date.parse(`${day}T23:59:59.999Z`) - now) / 1000),
    );
    return { ok: false, retryAfterSeconds: secondsToMidnight, remaining: 0, limitedBy: "daily" };
  }
  return null;
}

function memoryCheck(key: string, cost: number, options: RateLimitOptions, now = Date.now()): RateLimitResult {
  const minuteBucket = currentMinuteBucket(key, options, now);
  const refillPerMs = options.ratePerMinute / 60_000;
  if (minuteBucket.tokens < cost) {
    minuteBuckets.set(key, minuteBucket);
    const deficit = cost - minuteBucket.tokens;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / refillPerMs / 1000)),
      remaining: 0,
      limitedBy: "minute",
    };
  }
  if (options.dailyLimit != null) {
    const daily = checkDailyBucket(key, cost, options.dailyLimit, now);
    if (daily) {
      // Persist the refilled minute bucket so the rejection does not discard refill.
      minuteBuckets.set(key, minuteBucket);
      return daily;
    }
  }
  // Commit consumption.
  minuteBucket.tokens -= cost;
  minuteBuckets.set(key, minuteBucket);
  if (options.dailyLimit != null) {
    const day = utcDay(now);
    const mapKey = `${key}:${day}`;
    const daily = dailyBuckets.get(mapKey) ?? { tokens: options.dailyLimit, day };
    const tokens = daily.day === day ? daily.tokens : options.dailyLimit;
    dailyBuckets.set(mapKey, { tokens: tokens - cost, day });
  }
  if (minuteBuckets.size > 5000) {
    for (const [k, b] of minuteBuckets) {
      if (now - b.updatedAt > 600_000) minuteBuckets.delete(k);
    }
  }
  if (dailyBuckets.size > 5000) {
    for (const [k, b] of dailyBuckets) {
      if (b.day !== utcDay(now)) dailyBuckets.delete(k);
    }
  }
  const remaining = Math.max(0, Math.floor(minuteBucket.tokens));
  return { ok: true, retryAfterSeconds: 0, remaining };
}

const memoryBackend: RateLimiterBackend = {
  name: "memory",
  check: (key, cost, options, now) => memoryCheck(key, cost, options, now ?? Date.now()),
};

let activeBackend: RateLimiterBackend = memoryBackend;

/** Inject a shared (distributed) backend in production; tests use this too. */
export function setRateLimiterBackend(backend: RateLimiterBackend | null): void {
  activeBackend = backend ?? memoryBackend;
}

export function getRateLimiterBackend(): RateLimiterBackend {
  // Explicit env switch documents the production wiring without adding an
  // infrastructure dependency: when RATE_LIMIT_BACKEND=distributed but no
  // backend was injected, stay on memory and warn once so the deployment is
  // visibly degraded rather than silently unlimited.
  if (process.env.RATE_LIMIT_BACKEND === "distributed" && activeBackend.name !== "distributed") {
    if (process.env.NODE_ENV !== "test" && !(getRateLimiterBackend as { warned?: boolean }).warned) {
      (getRateLimiterBackend as { warned?: boolean }).warned = true;
      console.warn("[rate-limit] RATE_LIMIT_BACKEND=distributed but no shared backend injected — using in-memory fallback.");
    }
  }
  return activeBackend;
}

/** Backwards-compatible single-token check (cost 1, no daily cap). */
export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  return getRateLimiterBackend().check(key, 1, options);
}

/** Cost-aware check used by the AI route. */
export function rateLimitWithCost(key: string, cost: number, options: RateLimitOptions): RateLimitResult {
  return getRateLimiterBackend().check(key, Math.max(1, Math.floor(cost)), options);
}

/** Test-only: reset in-memory buckets. */
export function resetRateLimiterForTests(): void {
  minuteBuckets.clear();
  dailyBuckets.clear();
  activeBackend = memoryBackend;
}

// --- keying ---------------------------------------------------------------

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}

/**
 * Prefer the authenticated user id so one IP cannot share (or evade) quota
 * across accounts; fall back to IP for unauthenticated local/offline use.
 */
export function resolveRateLimitKey(request: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  return `ip:${clientKey(request)}`;
}

// --- AI cost accounting ----------------------------------------------------

/** Token cost per AI task. Heavy vision/extraction tasks cost more. */
export const AI_TASK_COSTS: Record<AiTask, number> = {
  explain: 1,
  socratic: 1,
  summarise: 1,
  diagnose: 1,
  mark: 2,
  "generate-cards": 2,
  "generate-questions": 2,
  "cards-from-notes": 2,
  ocr: 3,
  "extract-questions": 3,
  "diagnose-error": 1,
  "route-spec": 1,
};

export function aiTaskCost(task: AiTask): number {
  return AI_TASK_COSTS[task] ?? 1;
}

export const AI_RATE_LIMIT = { ratePerMinute: 20, burst: 10 } as const;

/** Default daily AI allowance (cost units). Override with AI_DAILY_LIMIT. */
export function aiDailyLimit(): number | undefined {
  const raw = process.env.AI_DAILY_LIMIT;
  if (raw == null || raw === "") return 500;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 500;
  return Math.floor(parsed);
}
