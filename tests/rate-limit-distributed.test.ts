import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  createSupabaseRateLimiterBackend,
  enforceAiRateLimit,
  rateLimitBackendMode,
  RateLimiterUnavailableError,
  type QuotaRpcCaller,
} from "@/lib/rate-limit-supabase";
import { resetRateLimiterForTests } from "@/lib/rate-limit";

// Fake quota store mirroring the consume_ai_quota SQL contract (token bucket
// with LEAST-capped refill, UTC-day allowance checked first, state persisted
// on every call). Atomicity in production comes from seeding the row and then
// locking it in the same transaction (pinned by the SQL invariant tests
// below); this fake applies each call synchronously for the same reason, so it
// cannot and does not prove database-level concurrency.
function createFakeQuotaDb() {
  const rows = new Map<string, { tokens: number; updatedAt: number; day: string; usedDay: number }>();
  const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);
  const caller: QuotaRpcCaller & { rows: typeof rows; failNext?: string } = {
    rows,
    async rpc(fn, args) {
      if (this.failNext) {
        const message = this.failNext;
        this.failNext = undefined;
        return { data: null, error: { message } };
      }
      if (fn !== "consume_ai_quota") return { data: null, error: { message: "function does not exist" } };
      const now = Date.now();
      const today = dayOf(now);
      const row = rows.get(args.p_key);
      const tokens = row
        ? Math.min(args.p_burst, row.tokens + ((now - row.updatedAt) / 1000) * (args.p_rate_per_min / 60))
        : args.p_burst;
      const usedDay = row && row.day === today ? row.usedDay : 0;
      const persist = () => rows.set(args.p_key, { tokens, updatedAt: now, day: today, usedDay });
      if (usedDay + args.p_cost > args.p_daily_limit) {
        persist();
        return { data: [{ ok: false, remaining: 0, retry_after_seconds: 3600, limited_by: "daily" }], error: null };
      }
      if (tokens < args.p_cost) {
        persist();
        const refillPerSecond = args.p_rate_per_min / 60;
        return {
          data: [{
            ok: false,
            remaining: 0,
            retry_after_seconds: Math.max(1, Math.ceil((args.p_cost - tokens) / refillPerSecond)),
            limited_by: "minute",
          }],
          error: null,
        };
      }
      rows.set(args.p_key, { tokens: tokens - args.p_cost, updatedAt: now, day: today, usedDay: usedDay + args.p_cost });
      return {
        data: [{ ok: true, remaining: Math.floor(tokens - args.p_cost), retry_after_seconds: 0, limited_by: null }],
        error: null,
      };
    },
  };
  return caller;
}

const MINUTE = { ratePerMinute: 60, burst: 5 };

describe("distributed AI rate limiting (shared Supabase backend)", () => {
  beforeEach(() => resetRateLimiterForTests());

  it("shares quota across limiter instances", async () => {
    const db = createFakeQuotaDb();
    const a = createSupabaseRateLimiterBackend(db);
    const b = createSupabaseRateLimiterBackend(db);
    expect(a.name).toBe("distributed");
    for (let i = 0; i < 5; i++) {
      expect((await a.checkAsync!("user:1", 1, MINUTE)).ok).toBe(true);
    }
    // The sixth unit is rejected on the *other* instance: one shared bucket.
    const limited = await b.checkAsync!("user:1", 1, MINUTE);
    expect(limited.ok).toBe(false);
    expect(limited.limitedBy).toBe("minute");
    // A different user is unaffected.
    expect((await b.checkAsync!("user:2", 1, MINUTE)).ok).toBe(true);
  });

  it("accounts weighted task costs and reports retry time", async () => {
    const db = createFakeQuotaDb();
    const backend = createSupabaseRateLimiterBackend(db);
    const first = await backend.checkAsync!("user:1", 3, MINUTE);
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(2);
    const second = await backend.checkAsync!("user:1", 3, MINUTE);
    expect(second.ok).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("exhausts the daily allowance independently of the minute bucket", async () => {
    const db = createFakeQuotaDb();
    const backend = createSupabaseRateLimiterBackend(db);
    const opts = { ratePerMinute: 1000, burst: 1000, dailyLimit: 2 };
    expect((await backend.checkAsync!("user:1", 1, opts)).ok).toBe(true);
    expect((await backend.checkAsync!("user:1", 1, opts)).ok).toBe(true);
    const limited = await backend.checkAsync!("user:1", 1, opts);
    expect(limited.ok).toBe(false);
    expect(limited.limitedBy).toBe("daily");
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the daily allowance at UTC midnight", async () => {
    const db = createFakeQuotaDb();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    db.rows.set("user:1", { tokens: 1000, updatedAt: Date.now(), day: yesterday, usedDay: 500 });
    const backend = createSupabaseRateLimiterBackend(db);
    const res = await backend.checkAsync!("user:1", 1, { ratePerMinute: 1000, burst: 1000, dailyLimit: 500 });
    expect(res.ok).toBe(true);
    expect(db.rows.get("user:1")?.usedDay).toBe(1);
  });

  it("never overspends under concurrent consumption", async () => {
    const db = createFakeQuotaDb();
    const backend = createSupabaseRateLimiterBackend(db);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => backend.checkAsync!("user:1", 1, MINUTE)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok)).toHaveLength(5);
  });

  it("fails closed when the database call fails or misbehaves", async () => {
    const db = createFakeQuotaDb();
    const backend = createSupabaseRateLimiterBackend(db);
    db.failNext = "connection reset";
    await expect(backend.checkAsync!("user:1", 1, MINUTE)).rejects.toBeInstanceOf(RateLimiterUnavailableError);
    const malformed: QuotaRpcCaller = { rpc: async () => ({ data: { nonsense: true }, error: null }) };
    await expect(
      createSupabaseRateLimiterBackend(malformed).checkAsync!("user:1", 1, MINUTE),
    ).rejects.toBeInstanceOf(RateLimiterUnavailableError);
    // The synchronous check cannot serve shared quota: loud, not silent.
    expect(() => backend.check("user:1", 1, MINUTE)).toThrow(RateLimiterUnavailableError);
  });

  it("sends the user-scoped key to the RPC", async () => {
    let seenKey = "";
    const spy: QuotaRpcCaller = {
      rpc: async (_fn, args) => {
        seenKey = args.p_key;
        return { data: [{ ok: true, remaining: 1, retry_after_seconds: 0, limited_by: null }], error: null };
      },
    };
    await createSupabaseRateLimiterBackend(spy).checkAsync!("user:abc-123", 1, MINUTE);
    expect(seenKey).toBe("user:abc-123");
  });
});

describe("shared limiter wiring and misconfiguration", () => {
  const env: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of ["RATE_LIMIT_BACKEND", "NODE_ENV"] as const) env[key] = process.env[key];
    resetRateLimiterForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses memory by default (local development)", async () => {
    delete process.env.RATE_LIMIT_BACKEND;
    expect(rateLimitBackendMode()).toBe("memory");
    const res = await enforceAiRateLimit({ key: "user:1", cost: 1, userId: "1", rpc: null });
    expect(res.ok).toBe(true);
  });

  it("fails closed when shared limiting is requested but no client exists", async () => {
    process.env.RATE_LIMIT_BACKEND = "supabase";
    expect(rateLimitBackendMode()).toBe("supabase");
    await expect(enforceAiRateLimit({ key: "user:1", cost: 1, userId: "1", rpc: null })).rejects.toBeInstanceOf(
      RateLimiterUnavailableError,
    );
  });

  it("fails closed for anonymous production calls under shared mode", async () => {
    process.env.RATE_LIMIT_BACKEND = "supabase";
    vi.stubEnv("NODE_ENV", "production");
    await expect(enforceAiRateLimit({ key: "ip:1.2.3.4", cost: 1, userId: null, rpc: null })).rejects.toBeInstanceOf(
      RateLimiterUnavailableError,
    );
  });

  it("serves shared quota to authenticated users when configured", async () => {
    process.env.RATE_LIMIT_BACKEND = "supabase";
    const db = createFakeQuotaDb();
    const res = await enforceAiRateLimit({ key: "user:1", cost: 2, userId: "1", rpc: db });
    expect(res.ok).toBe(true);
    expect(res.remaining).toBe(8);
  });
});

describe("quota SQL invariants", () => {
  const quotaFunction = () => {
    const sql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");
    const start = sql.indexOf("create or replace function public.consume_ai_quota");
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf("$$;", start);
    return sql.slice(start, end);
  };

  it("implements atomic per-user consumption in the migration", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");
    expect(sql).toContain("create table if not exists public.ai_rate_quota");
    expect(sql).toContain("alter table public.ai_rate_quota enable row level security");
    expect(sql).toContain("consume_ai_quota");
    expect(sql).toContain("for update");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("security definer");
    // Token-bucket refill capped at burst, plus the UTC-day reset.
    expect(sql).toContain("least(");
    expect(sql).toContain("v_row.day < v_today");
  });

  it("seeds the quota row before locking it, so simultaneous first calls cannot overspend", () => {
    const fn = quotaFunction();
    const seed = fn.indexOf("on conflict (key) do nothing");
    const lock = fn.indexOf("for update");
    expect(seed).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(-1);
    // Order is the whole fix: the seeding insert must serialise on the primary
    // key *before* the row is locked and read.
    expect(seed).toBeLessThan(lock);
    // Reading before the seed exists lets two transactions both see "not
    // found" and then clobber each other; the upsert overwrite is that vector,
    // so it must not appear inside the function.
    expect(fn).not.toContain("on conflict (key) do update");
    // The opening burst is granted by the seed itself, and every later
    // decision persists through a plain update of the locked row.
    expect(fn).toMatch(/values \(p_key, p_burst::double precision, v_now, v_today, 0\)/);
    expect(fn).toContain("update public.ai_rate_quota");
    expect(fn).not.toContain("if not found then");
  });

  it("guards the parameters the arithmetic divides by", () => {
    const fn = quotaFunction();
    expect(fn).toContain("if p_cost is null or p_cost < 1 then");
    expect(fn).toContain("if p_burst is null or p_burst < 1 then");
    expect(fn).toContain("if p_rate_per_min is null or p_rate_per_min <= 0 then");
  });

  it("is executable only by signed-in users", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");
    expect(sql).toContain(
      "revoke all on function public.consume_ai_quota(text, integer, double precision, integer, integer) from public, anon",
    );
    expect(sql).toContain(
      "grant execute on function public.consume_ai_quota(text, integer, double precision, integer, integer) to authenticated",
    );
  });
});
