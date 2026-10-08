import { NextResponse } from "next/server";
import { sameOriginRequest } from "@/domain/account-deletion";
import { reviewStateOf } from "@/domain/review-workflow";
import { errorClass } from "@/lib/observability";
import { rateLimit } from "@/lib/rate-limit";
import { prepareDecision, reviewDecisionRequestSchema } from "@/lib/reviewer/runtime-ledger";
import { appendRuntimeEvent, getReviewerContext, loadCombinedLog, reviewBank } from "@/lib/reviewer/server";

// ---------------------------------------------------------------------------
// Record one reviewer decision (Approve / Request changes).
//
//   1. Same-origin (Origin required and matching; Sec-Fetch-Site same-origin).
//   2. Body size cap, then zod validation. Identity, role, qualification and
//      the review instant are NEVER read from the body.
//   3. Session verified with getUser(), then the caller's reviewer grant is
//      read under RLS (401 / 403).
//   4. Per-reviewer rate limit (429).
//   5. The combined (committed + runtime) audit chain is loaded and verified
//      with the domain's auditLogIssues; the next event is built by the
//      domain's appendReviewDecisions (422 with the domain's reasons).
//   6. Inserted with the caller's session: RLS + the append trigger check the
//      grant binding and chain continuity again (409 if someone appended first).
// The service role is never used here.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 8_000;
const REVIEW_RATE = { ratePerMinute: 30, burst: 10 } as const;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !sameOriginRequest(request.url, origin, request.headers.get("sec-fetch-site"))) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = reviewDecisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review decision.", issues: parsed.error.issues.map((i) => i.path.join(".") || i.message) }, { status: 400 });
  }

  const context = await getReviewerContext();
  if (context.status === "unconfigured") return NextResponse.json({ error: "Reviewer accounts are not configured on this server." }, { status: 503 });
  if (context.status === "signed-out") return NextResponse.json({ error: "Sign in to review." }, { status: 401 });
  if (context.status === "not-reviewer") return NextResponse.json({ error: "This account is not an active reviewer." }, { status: 403 });

  const limited = rateLimit(`reviewer:${context.grant.userId}`, REVIEW_RATE);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many decisions in a short time. Wait a moment." }, { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } });
  }

  try {
    // One retry covers the common race (another reviewer appended between our
    // read and our insert); the domain rules are re-run on the fresh chain.
    for (let attempt = 0; attempt < 2; attempt++) {
      const combined = await loadCombinedLog(context.supabase);
      if (combined.issues.length) {
        console.error("[reviewer] audit chain failed verification", { issues: combined.issues.length });
        return NextResponse.json({ error: "The review audit chain failed verification. Nothing was recorded; tell the maintainer." }, { status: 500 });
      }
      const prepared = prepareDecision(combined, parsed.data, reviewBank, context.grant, Date.now());
      if (!prepared.ok) {
        return NextResponse.json({ error: "Decision not recorded.", problems: prepared.problems.map((p) => p.detail) }, { status: 422 });
      }
      const outcome = await appendRuntimeEvent(context.supabase, prepared.row);
      if (outcome === "conflict") continue;
      if (outcome === "forbidden") return NextResponse.json({ error: "This account is not an active reviewer." }, { status: 403 });
      if (outcome === "error") return NextResponse.json({ error: "The decision could not be saved. Nothing was recorded." }, { status: 502 });
      const question = reviewBank.find((q) => q.id === prepared.event.questionId)!;
      const state = reviewStateOf(question, [...combined.log.events, prepared.event]);
      return NextResponse.json(
        { recorded: { seq: prepared.event.seq, hash: prepared.event.hash, decision: prepared.event.decision }, stage: state.stage, approvalsNeeded: state.approvalsNeeded },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "Another reviewer was recording at the same moment. Try again." }, { status: 409 });
  } catch (error) {
    console.error("[reviewer] decision failed", { errorClass: errorClass(error) });
    return NextResponse.json({ error: "The decision could not be saved. Nothing was recorded." }, { status: 500 });
  }
}
