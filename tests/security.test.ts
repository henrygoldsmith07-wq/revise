import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";
import { REVIEW_AUDIT_EVENT_COLUMNS } from "@/lib/reviewer/runtime-ledger";

const schema = () => readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8").replace(/\r\n/g, "\n");

describe("security — RLS + schema invariants", () => {
  // Per-table RLS coverage. The previous version of this test asserted only
  // that the *file* contained "enable row level security" inside a loop over
  // ten names, so dropping RLS from any single table could not fail it. This
  // version derives RLS and policies per table from the SQL itself and
  // requires an explicit decision for every table the schema creates.
  type RlsExpectation =
    | { kind: "owner"; policy: string }
    | { kind: "tombstones" }
    | { kind: "definer-only" }
    // Granted by the service role only; the holder may read their own row.
    | { kind: "self-read"; policy: string }
    // Collaboration data is read-only under scoped class predicates; RPCs write.
    | { kind: "class-read"; policy: string; predicate: string }
    // Append-only audit history: reviewer insert + read, no update/delete.
    | { kind: "append-only"; insert: string; read: string }
    // Write-only: the learner may insert their own rows and read nothing back
    // (opt-in telemetry, shared disputes). Aggregation is service-role only.
    | { kind: "insert-only"; policy: string };

  const EXPECTED: Record<string, RlsExpectation> = {
    cards: { kind: "owner", policy: "cards_owner" },
    review_logs: { kind: "owner", policy: "review_logs_owner" },
    questions: { kind: "owner", policy: "questions_owner" },
    attempts: { kind: "owner", policy: "attempts_owner" },
    mistakes: { kind: "owner", policy: "mistakes_owner" },
    papers: { kind: "owner", policy: "papers_owner" },
    planned_sessions: { kind: "owner", policy: "planned_sessions_owner" },
    exam_dates: { kind: "owner", policy: "exam_dates_owner" },
    user_settings: { kind: "owner", policy: "user_settings_owner" },
    streaks: { kind: "owner", policy: "streaks_owner" },
    lesson_progress: { kind: "owner", policy: "lesson_progress_owner" },
    sync_writes: { kind: "owner", policy: "sync_writes_owner" },
    // Continuity / learner-record tables.
    learner_records: { kind: "owner", policy: "learner_records_owner" },
    sync_tombstones: { kind: "tombstones" },
    // Quota and consent structures.
    ai_rate_quota: { kind: "definer-only" },
    ai_consent: { kind: "owner", policy: "ai_consent_owner" },
    // Reviewer portal.
    reviewer_roles: { kind: "self-read", policy: "reviewer_roles_self_read" },
    review_audit_events: { kind: "append-only", insert: "review_audit_events_reviewer_insert", read: "review_audit_events_reviewer_read" },
    // The committed log's tail the first runtime event must continue; service role only.
    review_audit_anchor: { kind: "definer-only" },
    // Opt-in pilot telemetry and shared disputes: write-only for the learner.
    product_events: { kind: "insert-only", policy: "product_events_insert" },
    marking_disputes: { kind: "insert-only", policy: "marking_disputes_insert" },
    // Live classes: no direct client writes, peer roster or public join-code access.
    teacher_classes: { kind: "class-read", policy: "class_owner_read", predicate: "public.is_class_teacher(id)" },
    class_memberships: { kind: "class-read", policy: "class_members_read", predicate: "user_id = auth.uid() or public.is_class_teacher(class_id)" },
    class_assignments: { kind: "class-read", policy: "class_assignments_read", predicate: "public.is_class_teacher(class_id) or public.is_active_class_member(class_id)" },
    class_evidence: { kind: "class-read", policy: "class_evidence_read", predicate: "exists (select 1 from public.class_memberships m where m.class_id = class_evidence.class_id and m.user_id = class_evidence.user_id and m.status = 'active') and (public.is_class_teacher(class_id) or (user_id = auth.uid() and public.is_active_class_member(class_id)))" },
    class_join_limits: { kind: "definer-only" },
    // Revise Plus: the learner reads their own row; only the Stripe webhook's
    // service-role function writes.
    subscriptions: { kind: "self-read", policy: "subscriptions_select_own" },
  };

  const OWNER_CLAUSE = "using (user_id = auth.uid()) with check (user_id = auth.uid())";

  function loopTables(sql: string): string[] {
    const match = /foreach target in array array\[([\s\S]*?)\]\s*loop\s*execute format\('alter table public\.%I enable row level security'/.exec(sql);
    expect(match, "the owner-policy loop must exist").not.toBeNull();
    const loop = sql.slice(match!.index, sql.indexOf("end loop;", match!.index));
    expect(loop).toContain(`'create policy %I on public.%I for all to authenticated ${OWNER_CLAUSE}'`);
    expect(loop).toContain("target || '_owner'");
    return [...match![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  }

  function explicitPolicies(sql: string, table: string): { name: string; text: string }[] {
    const re = new RegExp(`create policy ([a-z_]+) on public\\.${table}\\b([\\s\\S]*?);`, "g");
    return [...sql.matchAll(re)].map((m) => ({ name: m[1]!, text: m[2]!.replace(/\s+/g, " ").trim() }));
  }

  it("every table the schema creates has an explicit RLS decision", () => {
    const sql = schema();
    const created = [...new Set([...sql.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]!))];
    expect(created.length).toBeGreaterThanOrEqual(16);
    const undecided = created.filter((table) => !(table in EXPECTED));
    expect(undecided, "new tables need an entry in EXPECTED (and RLS)").toEqual([]);
    for (const table of Object.keys(EXPECTED)) expect(created, `${table} missing from schema`).toContain(table);
  });

  it.each(Object.entries(EXPECTED))("%s has RLS enabled and only the expected policies", (table, expectation) => {
    const sql = schema();
    const looped = loopTables(sql);
    const rls = looped.includes(table) || sql.includes(`alter table public.${table} enable row level security`);
    expect(rls, `${table}: RLS not enabled`).toBe(true);
    const explicit = explicitPolicies(sql, table);
    if (expectation.kind === "owner") {
      const viaLoop = looped.includes(table);
      const viaExplicit = explicit.find((p) => p.name === expectation.policy);
      expect(viaLoop || Boolean(viaExplicit), `${table}: owner policy missing`).toBe(true);
      if (viaExplicit) {
        expect(viaExplicit.text).toContain("for all to authenticated");
        expect(viaExplicit.text).toContain("using (user_id = auth.uid())");
        expect(viaExplicit.text).toContain("with check (user_id = auth.uid())");
      }
      expect(explicit.filter((p) => p.name !== expectation.policy), `${table}: unexpected extra policy`).toEqual([]);
    } else if (expectation.kind === "tombstones") {
      expect(explicit.map((p) => p.name).sort()).toEqual(["sync_tombstones_insert", "sync_tombstones_read"]);
      expect(explicit.find((p) => p.name === "sync_tombstones_read")!.text).toContain("for select to authenticated using (user_id = auth.uid())");
      expect(explicit.find((p) => p.name === "sync_tombstones_insert")!.text).toContain("for insert to authenticated with check (user_id = auth.uid())");
      expect(sql).toContain("revoke update, delete on public.sync_tombstones from authenticated");
    } else if (expectation.kind === "self-read") {
      expect(looped).not.toContain(table);
      expect(explicit.map((p) => p.name)).toEqual([expectation.policy]);
      expect(explicit[0]!.text).toContain("for select to authenticated using (user_id = auth.uid())");
      expect(sql).toContain(`revoke insert, update, delete, truncate on public.${table} from anon, authenticated`);
    } else if (expectation.kind === "class-read") {
      expect(looped).not.toContain(table);
      expect(explicit.map((p) => p.name)).toEqual([expectation.policy]);
      expect(explicit[0]!.text.replace(/\( /g, "(").replace(/ \)/g, ")")).toBe(`for select to authenticated using (${expectation.predicate})`);
      const revoke = /revoke all on ([^;]+) from public, anon, authenticated;/.exec(sql.slice(sql.indexOf("alter table public.teacher_classes enable")));
      expect(revoke?.[1]?.split(", ")).toContain(`public.${table}`);
    } else if (expectation.kind === "append-only") {
      expect(looped).not.toContain(table);
      expect(explicit.map((p) => p.name).sort()).toEqual([expectation.insert, expectation.read].sort());
      expect(explicit.find((p) => p.name === expectation.read)!.text).toContain("for select to authenticated using (public.is_active_reviewer())");
      expect(explicit.find((p) => p.name === expectation.insert)!.text).toContain("for insert to authenticated with check (reviewer_user_id = auth.uid() and public.is_active_reviewer())");
      expect(sql).toContain(`revoke update, delete, truncate on public.${table} from anon, authenticated`);
      expect(sql).toContain(`create trigger ${table}_immutable before update or delete on public.${table}`);
    } else if (expectation.kind === "insert-only") {
      expect(looped).not.toContain(table);
      expect(explicit.map((p) => p.name)).toEqual([expectation.policy]);
      expect(explicit[0]!.text).toContain("for insert to authenticated");
      expect(explicit[0]!.text).toContain("with check (user_id = auth.uid())");
      // Write-only: no client read, update or delete on a learner's own rows.
      expect(sql).toContain(`revoke select, update, delete, truncate on public.${table} from anon, authenticated`);
    } else {
      // No policy at all: only SECURITY DEFINER functions may touch it.
      expect(looped).not.toContain(table);
      expect(explicit, `${table} must have no client policies`).toEqual([]);
    }
  });

  it("user-owned tables cascade from auth.users so account deletion leaves no orphans", () => {
    const sql = schema();
    for (const table of Object.keys(EXPECTED)) {
      if (table === "ai_rate_quota") continue;
      // Attestations are audit history and deliberately outlive the reviewer's
      // account (reviewer_user_id, no foreign key; never exposed publicly).
      if (table === "review_audit_events") continue;
      // One row holding the committed log's tail; no user data.
      if (table === "review_audit_anchor") continue;
      const start = sql.indexOf(`create table if not exists public.${table} (`);
      const block = sql.slice(start, sql.indexOf(");", start));
      expect(block, `${table}: user_id must reference auth.users with cascade`).toMatch(/user_id uuid[^,]*references auth\.users ?\(id\) on delete cascade/);
    }
    // The quota table predates the cascade and gains it additively.
    expect(sql).toContain("alter table public.ai_rate_quota\n  add column if not exists user_id uuid references auth.users (id) on delete cascade;");
    expect(sql).toContain("alter table public.ai_rate_quota alter column user_id set not null;");
  });

  it("privileged account and retention functions are callable by the service role only", () => {
    const sql = schema();
    for (const fn of [
      "purge_account_server_data(uuid)", "account_residual_rows(uuid)", "purge_expired_server_data()",
      "grant_reviewer_role(uuid, text, text, text, text)", "revoke_reviewer_role(uuid)",
      "set_review_audit_anchor(integer, text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role`);
      expect(sql).not.toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it("review audit events stay append-only and reviewer status is checked by a definer function", () => {
    const sql = schema();
    expect(sql).toContain("raise exception 'review_audit_events is append-only'");
    expect(sql).toMatch(/create or replace function public\.is_active_reviewer\(\)[\s\S]*?security definer[\s\S]*?where user_id = auth\.uid\(\) and revoked_at is null/);
    expect(sql).not.toContain("grant execute on function public.grant_reviewer_role(uuid, text, text, text, text) to authenticated");
  });

  it("the review audit guard verifies the domain hash, the anchor and repeat approvals", () => {
    const sql = schema();
    // The LAST definition of each function is the one a fresh schema.sql leaves installed.
    const last = (name: string) => {
      const start = sql.lastIndexOf(`create or replace function public.${name}(`);
      expect(start, `${name} missing`).toBeGreaterThanOrEqual(0);
      return sql.slice(start, sql.indexOf("\n$$;", start));
    };
    const guard = last("review_audit_events_guard");
    expect(guard).toContain("if public.review_audit_event_hash(new.event) is distinct from new.hash then");
    expect(guard).toContain("select tail_seq, tail_hash into anchor from public.review_audit_anchor where id;");
    expect(guard).toContain("and (a.reviewer_id = new.reviewer_id or a.reviewer_user_id = new.reviewer_user_id)");
    expect(guard).toContain("perform pg_advisory_xact_lock(hashtext('public.review_audit_events'));");
    expect(last("review_audit_event_hash")).toContain("encode(sha256(convert_to(public.review_audit_canonical_json(p_event - 'hash'), 'UTF8')), 'hex')");
    // Re-granting never relabels: independence is counted by pseudonym.
    const grant = last("grant_reviewer_role");
    expect(grant).toContain("raise exception 'reviewer pseudonym cannot change");
    expect(grant.slice(grant.indexOf("on conflict (user_id) do update"))).not.toContain("reviewer_label =");
    expect(last("set_review_audit_anchor")).toContain("its anchor can no longer move");
    expect(sql).toContain("revoke all on public.review_audit_anchor from public, anon, authenticated;");
  });

  it("reviewers can read every review_audit_events column except reviewer_user_id", () => {
    const sql = schema();
    const start = sql.lastIndexOf("revoke select on public.review_audit_events from authenticated;");
    expect(start).toBeGreaterThanOrEqual(0);
    const grant = /grant select \(([^)]*)\)\s+on public\.review_audit_events to authenticated;/.exec(sql.slice(start));
    const columns = grant?.[1]?.split(",").map((c) => c.trim()) ?? [];
    expect(columns).not.toContain("reviewer_user_id");
    // Everything the portal reads (src/lib/reviewer/runtime-ledger.ts) stays readable.
    for (const column of REVIEW_AUDIT_EVENT_COLUMNS) expect(columns).toContain(column);
  });

  it("batched sync RPC runs as the caller so table RLS still applies", () => {
    const sql = schema();
    const start = sql.indexOf("create or replace function public.sync_push_batch");
    const end = sql.indexOf("\n$$;", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const fn = sql.slice(start, end + 4);
    expect(fn).toContain("security invoker");
    expect(fn).not.toMatch(/^\s*security definer/m);
    expect(fn).toContain("is distinct from uid::text");
    expect(sql).toContain("revoke all on function public.sync_push_batch(jsonb, uuid[]) from public, anon;");
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

  it("/api/ai checks AI consent before payload handling, quota or any provider call", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    const post = route.slice(route.indexOf("export async function POST"));
    const consent = post.indexOf("auth.consent.allowed");
    expect(consent).toBeGreaterThan(-1);
    expect(consent).toBeLessThan(post.indexOf("readBoundedText(request"));
    expect(consent).toBeLessThan(post.indexOf("enforceAiRateLimit"));
    expect(consent).toBeLessThan(post.indexOf("dispatch("));
    expect(route).toContain('.from("ai_consent")');
    // The egress policy is re-applied server-side and dispatch only sees its output.
    expect(post).toContain("prepareAiEgress(task, parsed.data)");
    expect(post).toContain("dispatch(task, egress.payload)");
  });

  it("/api/ai never logs a request body, payload or raw error", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    const logs = [...route.matchAll(/console\.(?:log|info|warn|error|debug)\(([^;]*)\);/g)].map((m) => m[1]!);
    expect(logs.length).toBeGreaterThan(0);
    for (const args of logs) {
      expect(args).not.toMatch(/\b(raw|body|payload|parsed|egress|request)\b/);
      expect(args).not.toMatch(/,\s*error\s*\)?$/);
    }
  });

  it("/api/account/delete verifies the session before using the service role and never takes a user id from the body", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/account/delete/route.ts"), "utf8");
    const getUser = route.indexOf("supabase.auth.getUser()");
    const admin = route.indexOf("getSupabaseAdmin()");
    expect(getUser).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(getUser);
    expect(route).toContain("const userId = auth.user.id;");
    expect(route).not.toMatch(/body\??\.(userId|user_id|id)\b/);
    const lib = readFileSync(join(process.cwd(), "src/lib/supabase-admin.ts"), "utf8");
    expect(lib).toContain('import "server-only";');
    expect(lib).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(lib).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("every API route reads its body through readBoundedText, never an unbounded request.text()/json()", () => {
    const dir = join(process.cwd(), "src/app/api");
    const routes = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/\b(?:request|req)\.(?:text|json|arrayBuffer|formData|blob)\(\)/);
      if (/export async function (?:POST|PUT|PATCH)\b/.test(source)) {
        expect(source, file).toContain("readBoundedText(request");
      }
    }
  });

  it("/api/ai uses account-aware shared quota enforcement with an IP fallback", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    expect(route).toContain("auth.user.id");
    expect(route).toContain("resolveRateLimitKey");
    expect(route).toContain("enforceAiRateLimit");
    expect(route).toContain("RateLimiterUnavailableError");
  });
});

describe("security — reviewer portal routes", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("/api/reviewer/decisions checks origin, size, zod, session, grant and rate limit before any write", () => {
    const route = read("src/app/api/reviewer/decisions/route.ts");
    const post = route.slice(route.indexOf("export async function POST"));
    const order = ["sameOriginRequest(", "MAX_BODY_CHARS", "reviewDecisionRequestSchema.safeParse", "getReviewerContext()", "rateLimit(", "prepareDecision(", "appendRuntimeEvent("];
    const positions = order.map((needle) => post.indexOf(needle));
    expect(positions.every((p) => p > -1), JSON.stringify(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(route).toContain("status: 401");
    expect(route).toContain("status: 403");
    expect(route).toContain("status: 429");
    // Identity is never taken from the request; the service role is never used.
    expect(route).not.toMatch(/body\??\.(reviewerId|reviewerRole|reviewerQualification|reviewedAt|userId)/);
    expect(route).not.toContain("getSupabaseAdmin");
    const schema = read("src/lib/reviewer/runtime-ledger.ts");
    expect(schema).toContain(".strict()");
  });

  it("reviewer server helpers authenticate with getUser and read the grant under RLS", () => {
    const lib = read("src/lib/reviewer/server.ts");
    expect(lib).toContain('import "server-only";');
    expect(lib).toContain("supabase.auth.getUser()");
    expect(lib).toContain('.from("reviewer_roles")');
    expect(lib).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    for (const page of ["src/app/(reviewer)/reviewer/page.tsx", "src/app/(reviewer)/reviewer/review/[questionId]/page.tsx"]) {
      const source = read(page);
      expect(source).toContain("getReviewerContext()");
      expect(source).toContain('context.status !== "ok"');
      expect(source).not.toContain('"use client"');
    }
  });

  it("export is reviewer-only and the public ledger uses the service role read-only", () => {
    const exp = read("src/app/api/reviewer/export/route.ts");
    expect(exp).toContain("getReviewerContext()");
    expect(exp).not.toContain("getSupabaseAdmin");
    const pub = read("src/app/api/review-ledger/route.ts");
    expect(pub).toContain("rateLimit(");
    expect(pub).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
    expect(read("src/lib/reviewer/server.ts")).not.toMatch(/admin[^\n]*\.(insert|update|delete|upsert)\(/);
  });

  it("the service worker never caches the reviewer portal", () => {
    expect(read("public/sw.js")).toContain('url.pathname.startsWith("/reviewer/")');
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
    // API responses: a strict no-document policy.
    expect(config).toContain("default-src 'none'; frame-ancestors 'none'");
  });

  it("gives every page a per-request nonce CSP with no inline-script allowance", () => {
    const policy = buildContentSecurityPolicy({ nonce: "abc123==", isDev: false });
    const scriptSrc = policy.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toContain("'nonce-abc123=='");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(buildContentSecurityPolicy({ nonce: "x", isDev: true })).toContain("'unsafe-eval'");
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
    // The proxy sets it; next.config must not add a second, nonce-less page CSP.
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain("buildContentSecurityPolicy");
    expect(proxy).toContain('requestHeaders.set("x-nonce", nonce)');
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    // No script-src in next.config may allow inline script: the only CSP it
    // sets on non-API paths is the static file policy for extension-ending
    // paths, which the proxy never runs on.
    for (const scriptSrc of config.match(/script-src[^"]*/g) ?? []) expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(config).toContain("staticFileContentSecurityPolicy");
    expect(config).toContain('source: "/:path((?!api(?:/|$)|_next/).*\\\\.[a-zA-Z0-9]+)"');
    expect(proxy).toContain('source: "/((?!api(?:/|$)|_next/static|_next/image|.*\\\\.[a-zA-Z0-9]+$).*)"');
    expect(readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8")).toContain("<script nonce={nonce}");
  });
});
