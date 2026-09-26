// Shared (distributed) AI rate limiter backed by Supabase Postgres.
//
// Production runs several server instances, so the in-memory bucket in
// ./rate-limit.ts cannot hold a per-user quota. This module consumes quota
// through the atomic `consume_ai_quota` RPC (see supabase/schema.sql): the
// token-bucket refill, the daily allowance and the midnight reset all happen
// inside one locked row update, so concurrent requests cannot overspend.
//
// Deliberately no `server-only` import here so the backend selection and the
// failure mapping stay unit-testable; the only caller is the server AI route,
// and this module never touches provider keys.
//
// Failure behaviour is fail-closed: when shared limiting is requested but the
// database call fails (missing migration, RLS rejection, outage), checkAsync
// throws RateLimiterUnavailableError and the route answers 503 instead of
// silently downgrading to per-instance memory quotas.

import {
  AI_RATE_LIMIT,
  aiDailyLimit,
  rateLimitWithCost,
  type RateLimiterBackend,
  type RateLimitOptions,
  type RateLimitResult,
} from "./rate-limit";

export class RateLimiterUnavailableError extends Error {
  constructor(message = "Shared rate limiting is unavailable.") {
    super(message);
    this.name = "RateLimiterUnavailableError";
  }
}

/** Minimal structural surface of the Supabase client this backend needs. */
export interface QuotaRpcCaller {
  rpc(
    fn: "consume_ai_quota",
    args: {
      p_key: string;
      p_cost: number;
      p_rate_per_min: number;
      p_burst: number;
      p_daily_limit: number;
    },
  ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
}

interface QuotaRow {
  ok: boolean;
  remaining: number;
  retry_after_seconds: number;
  limited_by: "minute" | "daily" | null;
}

function parseQuotaRow(data: unknown): QuotaRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.ok !== "boolean") return null;
  return {
    ok: record.ok,
    remaining: typeof record.remaining === "number" ? record.remaining : 0,
    retry_after_seconds: typeof record.retry_after_seconds === "number" ? record.retry_after_seconds : 0,
    limited_by: record.limited_by === "minute" || record.limited_by === "daily" ? record.limited_by : null,
  };
}

/** A distributed backend over one RPC caller (one Supabase project). */
export function createSupabaseRateLimiterBackend(caller: QuotaRpcCaller): RateLimiterBackend {
  return {
    name: "distributed",
    check(): RateLimitResult {
      // The shared check is async (network round trip); callers must use
      // checkAsync. Throwing here instead of falling back keeps a
      // misconfiguration loud rather than silently per-instance.
      throw new RateLimiterUnavailableError("Use checkAsync for the shared rate limiter.");
    },
    async checkAsync(key: string, cost: number, options: RateLimitOptions): Promise<RateLimitResult> {
      const units = Math.max(1, Math.floor(cost));
      let result: { data: unknown; error: { message: string; code?: string } | null };
      try {
        result = await caller.rpc("consume_ai_quota", {
          p_key: key,
          p_cost: units,
          p_rate_per_min: options.ratePerMinute,
          p_burst: options.burst,
          p_daily_limit: options.dailyLimit ?? aiDailyLimit() ?? 0,
        });
      } catch (error) {
        throw new RateLimiterUnavailableError(error instanceof Error ? error.message : "Quota RPC threw.");
      }
      if (result.error) {
        throw new RateLimiterUnavailableError(result.error.message);
      }
      const row = parseQuotaRow(result.data);
      if (!row) {
        throw new RateLimiterUnavailableError("Quota RPC returned an unexpected shape.");
      }
      return {
        ok: row.ok,
        retryAfterSeconds: row.retry_after_seconds,
        remaining: row.remaining,
        ...(row.limited_by ? { limitedBy: row.limited_by } : {}),
      };
    },
  };
}

export type RateLimitBackendMode = "memory" | "supabase";

export function rateLimitBackendMode(): RateLimitBackendMode {
  const raw = (process.env.RATE_LIMIT_BACKEND ?? "").trim().toLowerCase();
  // "distributed" is kept as an alias: it always meant "shared, not memory".
  if (raw === "supabase" || raw === "distributed") return "supabase";
  return "memory";
}

let warnedMemoryInProd = false;

/**
 * Enforce one AI call's quota. Authenticated users go through the shared
 * backend when configured; anonymous local use and unconfigured deployments
 * keep the in-memory bucket. Throws RateLimiterUnavailableError when shared
 * limiting was requested but cannot be provided — the route turns that into
 * a controlled 503 rather than pretending enforcement exists.
 */
export async function enforceAiRateLimit(input: {
  key: string;
  cost: number;
  userId: string | null;
  rpc: QuotaRpcCaller | null;
}): Promise<RateLimitResult> {
  const options: RateLimitOptions = { ...AI_RATE_LIMIT, dailyLimit: aiDailyLimit() };
  if (input.userId && rateLimitBackendMode() === "supabase") {
    if (!input.rpc) {
      throw new RateLimiterUnavailableError("RATE_LIMIT_BACKEND=supabase but no database client is available.");
    }
    return createSupabaseRateLimiterBackend(input.rpc).checkAsync!(input.key, input.cost, options);
  }
  if (rateLimitBackendMode() === "supabase" && process.env.NODE_ENV === "production") {
    // Shared limiting requested but this call cannot be scoped to a user
    // (anonymous). Fail closed in production rather than enforce per-IP
    // memory quotas that differ on every instance.
    throw new RateLimiterUnavailableError("Shared rate limiting requires an authenticated user.");
  }
  if (process.env.NODE_ENV === "production" && !warnedMemoryInProd) {
    warnedMemoryInProd = true;
    console.warn("[rate-limit] using in-memory AI quotas; set RATE_LIMIT_BACKEND=supabase for shared enforcement.");
  }
  return rateLimitWithCost(input.key, input.cost, options);
}
