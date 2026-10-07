import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkDeletionRequest, residualScopes } from "@/domain/account-deletion";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { errorClass } from "@/lib/observability";

// ---------------------------------------------------------------------------
// Authenticated account deletion.
//
// The only privileged action a learner can trigger. Order matters:
//
//   1. Same-origin check and an exact typed confirmation (403 / 400).
//   2. The caller's session is verified with the anon-key client and the
//      request cookies (401). The user id comes from that verified session —
//      never from the request body — so nobody can delete another account.
//   3. Only then is the service-role client created (server-only module; the
//      key never reaches a browser). Missing configuration fails closed (503)
//      rather than pretending the account was deleted.
//   4. purge_account_server_data removes rows with no auth.users cascade path
//      (AI quota counters, AI consent).
//   5. auth.admin.deleteUser removes the auth user; ON DELETE CASCADE removes
//      every synced table, sync_writes, learner_records and sync_tombstones.
//   6. account_residual_rows verifies nothing is left for that id in any
//      public table with a user_id column, in ai_rate_quota by key, or in
//      auth.users. Any residue is a 500 naming the tables (never their data).
//   7. The session cookies are cleared.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Accounts are not configured, so there is no server data to delete. Use Erase local data instead." },
      { status: 503 },
    );
  }

  let body: unknown = null;
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const check = checkDeletionRequest({
    requestUrl: request.url,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    body,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // A read-only cookie store is still sufficient to authenticate.
        }
      },
    },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sign in to delete your account." }, { status: 401 });
  }
  const userId = auth.user.id;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Account deletion is not configured on this server yet. Nothing has been deleted." },
      { status: 503 },
    );
  }

  try {
    const purge = await admin.rpc("purge_account_server_data", { p_user_id: userId });
    if (purge.error) {
      return NextResponse.json({ error: "Account deletion could not start. Nothing has been deleted." }, { status: 502 });
    }

    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) {
      return NextResponse.json(
        { error: "Your account could not be deleted right now. AI usage counters and AI consent were cleared; try again." },
        { status: 502 },
      );
    }

    const residual = await admin.rpc("account_residual_rows", { p_user_id: userId });
    const remaining = residual.error ? [{ scope: "unverified", remaining: 1 }] : residualScopes(residual.data);
    if (remaining.length) {
      console.error("[account] deletion left residual rows", { scopes: remaining.map((row) => row.scope) });
      return NextResponse.json(
        {
          error: "Your account was deleted, but some server data could not be confirmed as removed. Contact support.",
          residual: remaining.map((row) => row.scope),
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[account] deletion failed", { errorClass: errorClass(error) });
    return NextResponse.json({ error: "Account deletion failed unexpectedly." }, { status: 500 });
  }

  // The auth user no longer exists; clear the now-invalid session cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}
