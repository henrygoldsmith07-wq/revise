import { NextResponse } from "next/server";
import { sameOriginRequest } from "@/domain/account-deletion";
import { errorClass } from "@/lib/observability";
import { rateLimit } from "@/lib/rate-limit";
import { effectiveLedger } from "@/lib/reviewer/runtime-ledger";
import { committedLedger, getReviewerContext, loadCombinedLog, reviewBank } from "@/lib/reviewer/server";

// ---------------------------------------------------------------------------
// Developer export path back to the committed files. Returns the combined,
// verified audit log and the effective ledger in exactly the committed file
// formats. `npm run wjec:review:pull` (scripts/pull-runtime-review-log.mjs)
// is the scripted equivalent using the service role; either way the result is
// committed only after `npm run wjec:review:gates` passes.
// Reviewer-only; read-only.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!sameOriginRequest(request.url, request.headers.get("origin"), request.headers.get("sec-fetch-site"))) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  const context = await getReviewerContext();
  if (context.status === "unconfigured") return NextResponse.json({ error: "Reviewer accounts are not configured on this server." }, { status: 503 });
  if (context.status === "signed-out") return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  if (context.status === "not-reviewer") return NextResponse.json({ error: "This account is not an active reviewer." }, { status: 403 });
  if (!rateLimit(`reviewer-export:${context.grant.userId}`, { ratePerMinute: 6, burst: 3 }).ok) {
    return NextResponse.json({ error: "Too many exports in a short time." }, { status: 429 });
  }
  try {
    const combined = await loadCombinedLog(context.supabase);
    if (combined.issues.length) return NextResponse.json({ error: "The review audit chain failed verification.", issues: combined.issues }, { status: 500 });
    return NextResponse.json(
      { auditLog: combined.log, ledger: effectiveLedger(reviewBank, committedLedger, combined), runtimeOnlyEvents: combined.runtimeOnly },
      { headers: { "cache-control": "no-store", "content-disposition": "attachment; filename=\"wjec-review-export.json\"" } },
    );
  } catch (error) {
    console.error("[reviewer] export failed", { errorClass: errorClass(error) });
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
