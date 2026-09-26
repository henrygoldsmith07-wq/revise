import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Behavioural API tests: invoke the route handlers with mocked edges
// (auth, database, framework response) and assert on actual responses.
// The older source-string guards remain as cheap regression tripwires; these
// tests prove behaviour.
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

type DbRow = { id: string; updated_at: string; user_id?: string; data: unknown };

const db: Record<string, DbRow[]> = { user_settings: [], review_logs: [], attempts: [] };
let authUser: { id: string } | null = null;
let failingTable: string | null = null;

function applyOrders(rows: DbRow[], orders: Array<{ col: string; asc: boolean }>): DbRow[] {
  return [...rows].sort((a, b) => {
    for (const { col, asc } of orders) {
      const av = String((a as unknown as Record<string, unknown>)[col] ?? "");
      const bv = String((b as unknown as Record<string, unknown>)[col] ?? "");
      if (av !== bv) return (av < bv ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  });
}

function makeQuery(table: string) {
  const eqs: Array<[string, unknown]> = [];
  let gt: [string, string] | null = null;
  let gte: [string, string] | null = null;
  let orRaw: string | null = null;
  const orders: Array<{ col: string; asc: boolean }> = [];
  let limit: number | null = null;
  const matchOr = (row: DbRow): boolean => {
    const m = /^updated_at\.gt\.([^,]+),and\(updated_at\.eq\.\1,id\.gt\.(.+)\)$/.exec(orRaw ?? "");
    if (!m) return false;
    const ts = m[1]!;
    const id = m[2]!;
    return row.updated_at > ts || (row.updated_at === ts && row.id > id);
  };
  const filtered = (): DbRow[] => {
    let rows = [...(db[table] ?? [])];
    for (const [col, value] of eqs) {
      rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === value);
    }
    if (gt) rows = rows.filter((r) => r.updated_at > gt![1]);
    if (gte) rows = rows.filter((r) => r.updated_at >= gte![1]);
    if (orRaw) rows = rows.filter(matchOr);
    return applyOrders(rows, orders).slice(0, limit ?? rows.length);
  };
  const builder: Record<string, (...args: never[]) => unknown> = {};
  builder.select = () => builder;
  builder.eq = ((col: string, value: unknown) => {
    eqs.push([col, value]);
    return builder;
  }) as never;
  builder.gt = ((col: string, value: string) => {
    gt = [col, value];
    return builder;
  }) as never;
  builder.gte = ((col: string, value: string) => {
    gte = [col, value];
    return builder;
  }) as never;
  builder.or = ((cond: string) => {
    orRaw = cond;
    return builder;
  }) as never;
  builder.order = ((col: string, opts?: { ascending?: boolean }) => {
    orders.push({ col, asc: opts?.ascending ?? true });
    return builder;
  }) as never;
  builder.limit = ((n: number) => {
    limit = n;
    return builder;
  }) as never;
  builder.maybeSingle = (async () => {
    if (failingTable === table) return { data: null, error: { message: "db down" } };
    const rows = filtered();
    return { data: rows[0] ?? null, error: null };
  }) as never;
  builder.then = ((resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    if (failingTable === table) return Promise.resolve({ data: null, error: { message: "db down" } }).then(resolve, reject);
    return Promise.resolve({ data: filtered(), error: null }).then(resolve, reject);
  }) as never;
  return builder;
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: authUser } }) },
    from: (table: string) => makeQuery(table),
  }),
}));

import { GET as pulseGet } from "@/app/api/pulse/history/route";
import { GET as aiGet, POST as aiPost } from "@/app/api/ai/route";
import { resetRateLimiterForTests } from "@/lib/rate-limit";

const USER = "user-1";
const SAVED_ENV: Record<string, string | undefined> = {};

function saveEnv(...keys: string[]) {
  for (const key of keys) SAVED_ENV[key] = process.env[key];
}
function restoreEnv(...keys: string[]) {
  for (const key of keys) {
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  }
}

function reviewRow(id: string, updatedAt: string): DbRow {
  return {
    id,
    updated_at: updatedAt,
    user_id: USER,
    data: { reviewedAt: updatedAt, cardId: `card-${id}`, topicId: "t1", subjectId: "s1", grade: "good" },
  };
}

function attemptRow(id: string, updatedAt: string): DbRow {
  return {
    id,
    updated_at: updatedAt,
    user_id: USER,
    data: {
      createdAt: updatedAt,
      questionId: `q-${id}`,
      subjectId: "s1",
      topicIds: ["t1"],
      awarded: 2,
      max: 3,
      mode: "practice",
      markedBy: "rubric",
    },
  };
}

describe("Pulse history route behaviour", () => {
  const SUPABASE_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of SUPABASE_KEYS) saved[key] = process.env[key];
    // The Supabase client is mocked; the route only needs the env present.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    db.user_settings = [];
    db.review_logs = [];
    db.attempts = [];
    authUser = null;
    failingTable = null;
    resetRateLimiterForTests();
  });
  afterEach(() => {
    for (const key of SUPABASE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("returns 401 when unauthenticated", async () => {
    authUser = null;
    const res = await pulseGet(new Request("https://x/api/pulse/history?limit=10"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when consent is disabled or absent", async () => {
    authUser = { id: USER };
    db.user_settings = [{ id: "s", updated_at: "2026-01-01T00:00:00.000Z", user_id: USER, data: { pulseEnabled: false } }];
    expect((await pulseGet(new Request("https://x/api/pulse/history"))).status).toBe(403);
    db.user_settings = [];
    expect((await pulseGet(new Request("https://x/api/pulse/history"))).status).toBe(403);
  });

  it("returns an empty page with hasMore false when consented but no rows", async () => {
    authUser = { id: USER };
    db.user_settings = [{ id: "s", updated_at: "2026-01-01T00:00:00.000Z", user_id: USER, data: { pulseEnabled: true } }];
    const res = await pulseGet(new Request("https://x/api/pulse/history?limit=10"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { records: unknown[]; cursor: null; hasMore: boolean };
    expect(body.records).toEqual([]);
    expect(body.cursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  it("returns 400 for an invalid cursor", async () => {
    authUser = { id: USER };
    db.user_settings = [{ id: "s", updated_at: "2026-01-01T00:00:00.000Z", user_id: USER, data: { pulseEnabled: true } }];
    const res = await pulseGet(new Request("https://x/api/pulse/history?cursor=garbage"));
    expect(res.status).toBe(400);
  });

  it("returns 502 when the database fails", async () => {
    authUser = { id: USER };
    db.user_settings = [{ id: "s", updated_at: "2026-01-01T00:00:00.000Z", user_id: USER, data: { pulseEnabled: true } }];
    failingTable = "review_logs";
    const res = await pulseGet(new Request("https://x/api/pulse/history?limit=10"));
    expect(res.status).toBe(502);
  });

  it("walks mixed history across pages with no duplicates or gaps", async () => {
    authUser = { id: USER };
    db.user_settings = [{ id: "s", updated_at: "2026-01-01T00:00:00.000Z", user_id: USER, data: { pulseEnabled: true } }];
    // Interleaved reviews/attempts, including an exact-timestamp tie.
    const stamps = ["2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z"];
    for (let i = 0; i < 30; i++) {
      const ts = stamps[i % stamps.length]!;
      db.review_logs.push(reviewRow(`r-${String(i).padStart(3, "0")}`, ts));
      db.attempts.push(attemptRow(`a-${String(i).padStart(3, "0")}`, ts));
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const url = `https://x/api/pulse/history?limit=5${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await pulseGet(new Request(url));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { records: Array<{ kind: string; id: string }>; cursor: string | null; hasMore: boolean };
      expect(body.records.length).toBeLessThanOrEqual(5);
      for (const record of body.records) seen.push(`${record.kind}:${record.id}`);
      if (!body.hasMore) {
        expect(body.cursor).toBeNull();
        break;
      }
      expect(body.cursor).not.toBeNull();
      cursor = body.cursor;
    }
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
  });

  it("withholds history when consent is revoked between pages", async () => {
    authUser = { id: USER };
    const settings: DbRow = { id: "s", updated_at: "2026-01-01T00:00:00.000Z", user_id: USER, data: { pulseEnabled: true } };
    db.user_settings = [settings];
    for (let i = 0; i < 8; i++) db.review_logs.push(reviewRow(`r-${i}`, "2026-01-01T00:00:00.000Z"));
    const first = (await (await pulseGet(new Request("https://x/api/pulse/history?limit=3"))).json()) as {
      cursor: string;
      hasMore: boolean;
    };
    expect(first.hasMore).toBe(true);
    settings.data = { pulseEnabled: false };
    const second = await pulseGet(new Request(`https://x/api/pulse/history?limit=3&cursor=${first.cursor}`));
    expect(second.status).toBe(403);
  });
});

describe("AI route behaviour", () => {
  const SUPABASE_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const PROVIDER_KEYS = ["ANTHROPIC_API_KEY", "AI_PROVIDER", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_MODEL", "OPENAI_COMPATIBLE_API_KEY"];
  const ALL_KEYS = [...SUPABASE_KEYS, ...PROVIDER_KEYS, "NODE_ENV", "RATE_LIMIT_BACKEND", "AI_DAILY_LIMIT"];

  beforeEach(() => {
    saveEnv(...ALL_KEYS);
    for (const key of [...SUPABASE_KEYS, ...PROVIDER_KEYS]) delete process.env[key];
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.AI_DAILY_LIMIT;
    authUser = null;
    resetRateLimiterForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    restoreEnv(...ALL_KEYS);
  });

  const aiRequest = (body: unknown) =>
    new Request("https://x/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("reports provider status without leaking keys", async () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test-secret";
    const res = await aiGet();
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain("sk-test-secret");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await aiPost(aiRequest("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await aiPost(aiRequest({ task: "explain", payload: { topicId: "x".repeat(1_600_000) } }));
    expect(res.status).toBe(413);
  });

  it("rejects unknown tasks with 400", async () => {
    const res = await aiPost(aiRequest({ task: "teleport", payload: {} }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid task payloads with 400", async () => {
    const res = await aiPost(aiRequest({ task: "explain", payload: {} }));
    expect(res.status).toBe(400);
  });

  it("requires sign-in when Supabase auth is configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    authUser = null;
    const res = await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }));
    expect(res.status).toBe(401);
  });

  it("fails closed in production with provider keys but no auth config", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://example.invalid/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "test-model";
    const res = await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }));
    expect(res.status).toBe(503);
  });

  it("serves an offline fallback to authenticated users without calling a model", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test-secret-DO-NOT-LEAK";
    authUser = { id: USER };
    const res = await aiPost(aiRequest({ task: "explain", payload: { topicId: "unknown-topic" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe("fallback");
    expect(JSON.stringify(body)).not.toContain("sk-test-secret-DO-NOT-LEAK");
  });

  it("rate-limits burst traffic with 429 and keeps a daily allowance", async () => {
    process.env.AI_DAILY_LIMIT = "1000";
    for (let i = 0; i < 10; i++) {
      const res = await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }));
      expect(res.status).toBe(200);
    }
    const limited = await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });

  it("returns 429 when the daily allowance is exhausted", async () => {
    process.env.AI_DAILY_LIMIT = "2";
    expect((await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }))).status).toBe(200);
    expect((await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }))).status).toBe(200);
    const res = await aiPost(aiRequest({ task: "explain", payload: { topicId: "t" } }));
    expect(res.status).toBe(429);
  });
});
