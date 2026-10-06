import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_QUOTA_RETENTION_DAYS, RETENTION_POLICY } from "@/domain/retention-policy";
import * as portability from "@/domain/portability";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }),
  },
}));
const rpcCalls: string[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      return { data: [{ scope: "ai_rate_quota", removed: 4 }], error: null };
    },
  }),
}));

import { GET as retention } from "@/app/api/maintenance/retention/route";

describe("retention policy matches the implementation", () => {
  it("names only enforcing code that exists", () => {
    for (const rule of RETENTION_POLICY) {
      expect(rule.enforcedBy.length, rule.data).toBeGreaterThan(0);
      for (const path of rule.enforcedBy) expect(existsSync(join(process.cwd(), path)), `${rule.data}: ${path}`).toBe(true);
    }
  });

  it("the quota retention window in the policy is the one the SQL purge uses", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261007000100_privacy_ai_trust.sql"), "utf8");
    expect(sql).toContain(`delete from public.ai_rate_quota where updated_at < now() - interval '${AI_QUOTA_RETENTION_DAYS} days';`);
    expect(readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8")).toContain(sql.trim().slice(-200));
  });

  it("the semantic-cache TTL in the policy is enforced on read as well as write", () => {
    const cache = readFileSync(join(process.cwd(), "src/ai/semantic-cache.ts"), "utf8");
    expect(cache).toContain("30 * 24 * 60 * 60 * 1000");
    expect(cache).toMatch(/lookupCachedMark[\s\S]*Date\.now\(\) - CACHE_TTL_MS/);
  });

  it("the unused, unenforced retention abstraction is gone", () => {
    expect("shouldRetain" in portability).toBe(false);
    expect("defaultRetention" in portability).toBe(false);
  });

  it("a daily cron runs the purge", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons?: { path: string }[] };
    expect(vercel.crons?.some((cron) => cron.path === "/api/maintenance/retention")).toBe(true);
  });
});

describe("retention purge route", () => {
  const KEYS = ["CRON_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    rpcCalls.length = 0;
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  const call = (auth?: string) =>
    retention(new Request("https://revise.example/api/maintenance/retention", { headers: auth ? { authorization: auth } : {} }));

  it("never runs without a configured secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(503);
    expect(rpcCalls).toEqual([]);
  });

  it("rejects a wrong or missing bearer token", async () => {
    process.env.CRON_SECRET = "a-long-enough-cron-secret";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-of-some-length")).status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it("runs the service-role purge and returns counts only", async () => {
    process.env.CRON_SECRET = "a-long-enough-cron-secret";
    const res = await call("Bearer a-long-enough-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: [{ scope: "ai_rate_quota", removed: 4 }] });
    expect(rpcCalls).toEqual(["purge_expired_server_data"]);
  });
});
