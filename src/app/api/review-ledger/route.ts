import { NextResponse } from "next/server";
import { errorClass } from "@/lib/observability";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getPublicRuntimeLedger } from "@/lib/reviewer/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ---------------------------------------------------------------------------
// Public, read-only feed of the EFFECTIVE human-verification ledger: the
// committed ledger plus entries derived (promotableLedgerEntries) from the
// runtime continuation of the review audit chain. Students' devices merge it
// with applyHumanVerificationLedger, which re-checks every entry against the
// exact content fingerprint and the trust contract before trusting anything.
//
// It exposes only what the committed ledger already publishes (question id,
// fingerprint, the final approver's pseudonymous label, role, qualification,
// date and checks); never reviewer account ids, comments or rejected events.
// If the chain fails verification it falls back to the committed ledger.
// The service role is used read-only and never leaves this server.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 30_000;
let cache: { at: number; body: unknown } | null = null;

export async function GET(request: Request) {
  const limited = rateLimit(`review-ledger:${clientKey(request)}`, { ratePerMinute: 30, burst: 10 });
  if (!limited.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } });
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    try {
      const result = await getPublicRuntimeLedger(getSupabaseAdmin());
      if (!result.chainOk) console.error("[review-ledger] runtime chain failed verification; serving committed ledger only");
      cache = { at: now, body: { ...result.ledger, chainVerified: result.chainOk, generatedAt: new Date(now).toISOString() } };
    } catch (error) {
      console.error("[review-ledger] read failed", { errorClass: errorClass(error) });
      return NextResponse.json({ error: "The review ledger is temporarily unavailable." }, { status: 503 });
    }
  }
  return NextResponse.json(cache.body, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=300" } });
}
