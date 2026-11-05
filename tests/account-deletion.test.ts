import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  checkDeletionRequest,
  residualScopes,
  sameOriginRequest,
} from "@/domain/account-deletion";

// Behavioural tests for the account-deletion route with mocked edges: the
// cookie-session client (anon key) and the service-role client.
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

let sessionUser: { id: string } | null = null;
const calls: string[] = [];
let residual: unknown[] = [];
let deleteError: { message: string } | null = null;
let signedOut = false;
let subscriptionRow: { stripe_subscription_id: string; status: string } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUser } }),
      signOut: async () => {
        signedOut = true;
        return { error: null };
      },
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => {
            calls.push(`select:${table}:${value}`);
            return { data: subscriptionRow, error: null };
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${fn}:${String(args.p_user_id)}`);
      if (fn === "account_residual_rows") return { data: residual, error: null };
      return { data: [], error: null };
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.push(`deleteUser:${id}`);
          return { data: null, error: deleteError };
        },
      },
    },
  }),
}));

import { POST as deleteAccount } from "@/app/api/account/delete/route";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY"];
const saved: Record<string, string | undefined> = {};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://revise.example/api/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://revise.example", ...headers },
    body: JSON.stringify(body),
  });
}

describe("account deletion — request rules", () => {
  it("requires the exact typed confirmation", () => {
    const base = { requestUrl: "https://r.example/api/account/delete", origin: "https://r.example", secFetchSite: "same-origin" };
    expect(checkDeletionRequest({ ...base, body: { confirm: ACCOUNT_DELETION_CONFIRMATION } })).toEqual({ ok: true });
    expect(checkDeletionRequest({ ...base, body: { confirm: "delete my account" } })).toMatchObject({ ok: false, status: 400 });
    expect(checkDeletionRequest({ ...base, body: null })).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects cross-site requests", () => {
    expect(sameOriginRequest("https://r.example/x", "https://evil.example", null)).toBe(false);
    expect(sameOriginRequest("https://r.example/x", null, "cross-site")).toBe(false);
    expect(sameOriginRequest("https://r.example/x", "https://r.example", "same-origin")).toBe(true);
    expect(sameOriginRequest("https://r.example/x", null, null)).toBe(true);
  });

  it("treats unreadable residue checks as residue", () => {
    expect(residualScopes(null)).toEqual([{ scope: "unverified", remaining: 1 }]);
    expect(residualScopes([])).toEqual([]);
    expect(residualScopes([{ scope: "cards", remaining: "2" }, { scope: "x", remaining: 0 }])).toEqual([{ scope: "cards", remaining: 2 }]);
  });
});

describe("account deletion — route behaviour", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-DO-NOT-LEAK";
    sessionUser = { id: "user-1" };
    calls.length = 0;
    residual = [];
    deleteError = null;
    signedOut = false;
    subscriptionRow = null;
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("returns 401 without a session and touches nothing privileged", async () => {
    sessionUser = null;
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("returns 400 without the typed confirmation", async () => {
    const res = await deleteAccount(request({ confirm: "yes" }));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns 403 for a cross-origin request", async () => {
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("fails closed (503) without the service-role key, deleting nothing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(res.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("deletes the session's own account — never one named in the body — then verifies and signs out", async () => {
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION, userId: "someone-else" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(calls).toEqual([
      "select:subscriptions:user-1",
      "rpc:purge_account_server_data:user-1",
      "deleteUser:user-1",
      "rpc:account_residual_rows:user-1",
    ]);
    expect(signedOut).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("someone-else");
  });

  it("reports residue honestly instead of claiming a clean deletion, with a distinct code the client acts on", async () => {
    residual = [{ scope: "cards", remaining: 3 }];
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    // The auth user is gone, so this is not a failure to retry: a 202 with
    // its own code, telling the client to clear the device and sign out.
    expect(res.status).toBe(202);
    const body = (await res.json()) as { residual: string[]; deleted: boolean; code: string };
    expect(body.residual).toEqual(["cards"]);
    expect(body.deleted).toBe(true);
    expect(body.code).toBe("deleted_with_residue");
    expect(signedOut).toBe(true);
  });

  it("clears local data and signs out on the client when residue was found", () => {
    const settings = readFileSync(join(process.cwd(), "src/app/settings/page.tsx"), "utf8");
    const remove = settings.slice(settings.indexOf("async function remove()"), settings.indexOf("return (", settings.indexOf("async function remove()")));
    expect(remove).toContain('"deleted_with_residue"');
    expect(remove.indexOf("await clearAll()")).toBeGreaterThan(remove.indexOf('"deleted_with_residue"'));
    expect(remove).toContain("auth.signOut()");
  });

  it("does not claim deletion when the auth user could not be deleted", async () => {
    deleteError = { message: "boom" };
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(res.status).toBe(502);
    expect(calls).not.toContain("rpc:account_residual_rows:user-1");
  });

  const PAYER = "aaaaaaaa-1111-4111-8111-111111111111";

  /** Stripe over fetch: the search returns `found`; DELETE succeeds unless `failDelete`. */
  function stubStripe(found: { id: string; status: string }[], options: { failSearch?: boolean; failDelete?: boolean } = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/v1", "");
      calls.push(`stripe:${init?.method}:${path}`);
      if (path === "/subscriptions/search") {
        expect(url.searchParams.get("query")).toBe(`metadata['user_id']:'${PAYER}'`);
        if (options.failSearch) return new Response(JSON.stringify({ error: { code: "api_error" } }), { status: 500 });
        return new Response(JSON.stringify({ data: found, has_more: false }), { status: 200 });
      }
      if (options.failDelete) return new Response(JSON.stringify({ error: { code: "api_error" } }), { status: 500 });
      return new Response(JSON.stringify({ id: path.split("/").pop(), status: "canceled" }), { status: 200 });
    });
  }

  it("cancels a live Plus subscription in Stripe before deleting anything", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    sessionUser = { id: PAYER };
    subscriptionRow = { stripe_subscription_id: "sub_123", status: "active" };
    const fetchSpy = stubStripe([{ id: "sub_123", status: "active" }]);
    try {
      const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
      expect(res.status).toBe(200);
      expect(calls.slice(0, 4)).toEqual([
        `select:subscriptions:${PAYER}`,
        "stripe:GET:/subscriptions/search",
        "stripe:DELETE:/subscriptions/sub_123",
        `rpc:purge_account_server_data:${PAYER}`,
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("cancels every live subscription Stripe holds for the account, not only the one the row follows", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    sessionUser = { id: PAYER };
    // The row follows an old unpaid subscription; a second checkout is live,
    // and a third has already ended.
    subscriptionRow = { stripe_subscription_id: "sub_old", status: "unpaid" };
    const fetchSpy = stubStripe([
      { id: "sub_old", status: "unpaid" },
      { id: "sub_new", status: "active" },
      { id: "sub_done", status: "canceled" },
    ]);
    try {
      const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
      expect(res.status).toBe(200);
      const stripeCalls = calls.filter((call) => call.startsWith("stripe:DELETE"));
      expect(stripeCalls).toEqual(["stripe:DELETE:/subscriptions/sub_old", "stripe:DELETE:/subscriptions/sub_new"]);
      expect(calls.indexOf("stripe:DELETE:/subscriptions/sub_new")).toBeLessThan(calls.indexOf(`rpc:purge_account_server_data:${PAYER}`));
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("cancels a subscription whose webhook has not landed yet", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    sessionUser = { id: PAYER };
    subscriptionRow = null;
    const fetchSpy = stubStripe([{ id: "sub_fresh", status: "active" }]);
    try {
      const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
      expect(res.status).toBe(200);
      expect(calls).toContain("stripe:DELETE:/subscriptions/sub_fresh");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("deletes nothing when Stripe cannot be searched", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    sessionUser = { id: PAYER };
    subscriptionRow = null;
    const fetchSpy = stubStripe([], { failSearch: true });
    try {
      const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
      expect(res.status).toBe(502);
      expect(calls).toEqual([`select:subscriptions:${PAYER}`, "stripe:GET:/subscriptions/search"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("deletes nothing when Stripe will not cancel a live subscription", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    sessionUser = { id: PAYER };
    subscriptionRow = { stripe_subscription_id: "sub_123", status: "past_due" };
    const fetchSpy = stubStripe([{ id: "sub_123", status: "past_due" }], { failDelete: true });
    try {
      const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
      expect(res.status).toBe(502);
      expect(calls).toEqual([`select:subscriptions:${PAYER}`, "stripe:GET:/subscriptions/search", "stripe:DELETE:/subscriptions/sub_123"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("does not call Stripe for a subscription that has already ended", async () => {
    subscriptionRow = { stripe_subscription_id: "sub_123", status: "canceled" };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("never returns the service-role key", async () => {
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(await res.text()).not.toContain("service-role-secret-DO-NOT-LEAK");
  });
});
