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
// silently downgrading to per-instance memory quotas. A production deployment
// with an AI provider, billing, the classifier or Supabase configured must set
// RATE_LIMIT_BACKEND=supabase: enforceAiRateLimit refuses to use in-memory
// buckets there, because a per-isolate bucket multiplies the paid daily/burst
// cap by the number of serverless instances. Local development and tests keep
// the in-memory path.

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
 * Whether this deployment has something that can spend money or hold a shared
 * quota. Mirrors `providerCredentialsPresent()` in the AI route plus the
 * Supabase env markers, without importing provider keys or server-only code:
 * any of them means a real deployment, where a per-isolate memory bucket is
 * not an acceptable quota gate. A live Supabase RPC reaching this function is
 * itself proof that auth is configured.
 */
function sharedQuotaRequiredInProduction(input: { rpc: QuotaRpcCaller | null }): boolean {
  if (input.rpc) return true;
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return true;
  }
  // Provider credentials, billing and the third-party classifier — the same
  // signals the route uses to refuse local mode in production.
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY) return true;
  if (process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_MODEL) return true;
  const provider = (process.env.AI_PROVIDER ?? "").trim();
  if (provider && provider !== "none") return true;
  if (process.env.CLASSIFIER_ENABLED === "1" && process.env.CLASSIFIER_DISABLED !== "1") return true;
  if (process.env.STRIPE_SECRET_KEY) return true;
  return false;
}

/**
 * Enforce one AI call's quota. Authenticated users go through the shared
 * backend when configured; anonymous local use and deployments with no AI or
 * Supabase configuration keep the in-memory bucket. Throws
 * RateLimiterUnavailableError when shared limiting was requested but cannot be
 * provided, and in production whenever a configured deployment has not opted
 * into the shared backend — the route turns that into a controlled 503 rather
 * than pretending per-instance enforcement exists.
 */
export async function enforceAiRateLimit(input: {
  key: string;
  cost: number;
  userId: string | null;
  rpc: QuotaRpcCaller | null;
}): Promise<RateLimitResult> {
  const options: RateLimitOptions = { ...AI_RATE_LIMIT, dailyLimit: aiDailyLimit() };
  const mode = rateLimitBackendMode();
  const isProduction = process.env.NODE_ENV === "production";

  if (input.userId && mode === "supabase") {
    if (!input.rpc) {
      throw new RateLimiterUnavailableError("RATE_LIMIT_BACKEND=supabase but no database client is available.");
    }
    return createSupabaseRateLimiterBackend(input.rpc).checkAsync!(input.key, input.cost, options);
  }
  if (mode === "supabase" && isProduction) {
    // Shared limiting requested but this call cannot be scoped to a user
    // (anonymous). Fail closed in production rather than enforce per-IP
    // memory quotas that differ on every instance.
    throw new RateLimiterUnavailableError("Shared rate limiting requires an authenticated user.");
  }
  if (isProduction && sharedQuotaRequiredInProduction(input)) {
    // The dangerous default: RATE_LIMIT_BACKEND unset means "memory", and an
    // in-memory bucket lets every serverless isolate spend its own daily and
    // burst allowance against a paid provider. Never downgrade silently in a
    // configured production deployment — fail closed until the shared backend
    // is configured and usable. Non-production (local dev, tests) and a
    // production deployment with no AI/Supabase config still use memory.
    throw new RateLimiterUnavailableError(
      "Shared rate limiting is required in production. Set RATE_LIMIT_BACKEND=supabase with Supabase configured.",
    );
  }
  if (isProduction && !warnedMemoryInProd) {
    warnedMemoryInProd = true;
    console.warn(
      "[rate-limit] using in-memory AI quotas in production with no provider or Supabase config; set RATE_LIMIT_BACKEND=supabase before enabling AI.",
    );
  }
  return rateLimitWithCost(input.key, input.cost, options);
}
