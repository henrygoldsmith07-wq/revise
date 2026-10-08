import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
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
      "rpc:purge_account_server_data:user-1",
      "deleteUser:user-1",
      "rpc:account_residual_rows:user-1",
    ]);
    expect(signedOut).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("someone-else");
  });

  it("reports residue honestly instead of claiming success", async () => {
    residual = [{ scope: "cards", remaining: 3 }];
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { residual: string[] };
    expect(body.residual).toEqual(["cards"]);
  });

  it("does not claim deletion when the auth user could not be deleted", async () => {
    deleteError = { message: "boom" };
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(res.status).toBe(502);
    expect(calls).not.toContain("rpc:account_residual_rows:user-1");
  });

  it("never returns the service-role key", async () => {
    const res = await deleteAccount(request({ confirm: ACCOUNT_DELETION_CONFIRMATION }));
    expect(await res.text()).not.toContain("service-role-secret-DO-NOT-LEAK");
  });
});
