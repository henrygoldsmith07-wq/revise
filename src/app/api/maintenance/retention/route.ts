import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { errorClass } from "@/lib/observability";

// ---------------------------------------------------------------------------
// Scheduled retention purge (see domain/retention-policy.ts).
//
// Invoked daily by the Vercel cron in vercel.json, which sends
// `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the
// route refuses every call (503) — it never runs unauthenticated. It calls
// one service-role-only SQL function and returns counts, never row data.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

function authorised(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "Retention purge is not configured." }, { status: 503 });
  }
  if (!authorised(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Retention purge is not configured." }, { status: 503 });
  }
  try {
    const { data, error } = await admin.rpc("purge_expired_server_data");
    if (error) return NextResponse.json({ error: "Retention purge failed." }, { status: 502 });
    const removed = Array.isArray(data)
      ? data.map((row: { scope?: unknown; removed?: unknown }) => ({ scope: String(row.scope ?? ""), removed: Number(row.removed ?? 0) }))
      : [];
    return NextResponse.json({ ok: true, removed }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[retention] purge failed", { errorClass: errorClass(error) });
    return NextResponse.json({ error: "Retention purge failed." }, { status: 500 });
  }
}
