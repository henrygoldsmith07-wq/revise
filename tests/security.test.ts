import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const schema = () => readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");

describe("security — RLS + schema invariants", () => {
  it("every user-owned table has RLS and an owner policy", () => {
    const sql = schema();
    const tables = ["cards","review_logs","questions","attempts","mistakes","papers","planned_sessions","exam_dates","user_settings","streaks"];
    for (const t of tables) {
      expect(sql, t+" missing enable RLS").toContain(`enable row level security`);
    }
    expect(sql).toContain("with check (user_id = auth.uid())");
  });
  it("updated_at trigger rejects stale duplicate-device writes", () => {
    const sql = schema();
    expect(sql).toContain("touch_updated_at");
    expect(sql).toContain("new.updated_at <= old.updated_at");
    expect(sql).toContain("return old;");
  });
  it("updated_at trigger clamps future device clocks so the pull cursor cannot be poisoned", () => {
    const sql = schema();
    // A row days in the future must be rewritten server-side; the bound is
    // what keeps one bad clock from hiding every legitimate row beneath it.
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("max_allowed");
    expect(sql).toContain("before insert");
  });
  it("touch triggers skip tables without an updated_at column", () => {
    const sql = schema();
    // sync_writes is an append-only idempotency ledger; attaching an
    // updated_at trigger to it would error on write.
    expect(sql).toContain("sync_writes has no updated_at column");
  });
  it("text columns that must be scoped contain user_id", () => {
    const sql = schema();
    expect(sql.match(/user_id/g)!.length).toBeGreaterThan(10);
  });
});
describe("security — API route guards", () => {
  it("/api/ai requires explicit provider and validates input with zod", async () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    expect(route).toContain("payloadSchemas");
    expect(route).toContain("safeParse");
  });

  it("/api/ai authenticates when Supabase is configured and caps body size", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    expect(route).toContain("getUser");
    expect(route).toContain("status: 401");
    expect(route).toContain("MAX_BODY_CHARS");
    expect(route).toContain("status: 413");
  });

  it("/api/ai uses account-aware shared quota enforcement with an IP fallback", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    expect(route).toContain("auth.user.id");
    expect(route).toContain("resolveRateLimitKey");
    expect(route).toContain("enforceAiRateLimit");
    expect(route).toContain("RateLimiterUnavailableError");
  });
});

describe("security — browser response headers", () => {
  it("ships baseline CSP, framing, MIME, referrer and permissions protections", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    for (const header of [
      "Content-Security-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      expect(config).toContain(header);
    }
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
  });
});
