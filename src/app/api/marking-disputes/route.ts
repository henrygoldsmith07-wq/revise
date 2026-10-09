import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOriginRequest } from "@/domain/account-deletion";
import { MARKING_FLAG_REASONS } from "@/domain/marking-flag";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Shared marking-dispute intake. A dispute never changes a mark, question
// trust or proof; it routes one flagged mark-scheme point to a human.
//
// Local records stay on device (markingFlags store). A row lands here only
// when the learner explicitly taps "share with the Revise team" on one
// dispute — per-dispute opt-in, not a blanket toggle. Insert-only: no select
// policy exists, so shared disputes cannot be read back by clients.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 4_000;
const DISPUTE_RATE = { ratePerMinute: 10, burst: 3 } as const;

const disputeSchema = z.object({
  anonId: z.string().regex(/^[0-9a-fA-F-]{8,64}$/),
  attemptId: z.string().min(1).max(200),
  questionId: z.string().min(1).max(200),
  partId: z.string().min(1).max(200),
  subjectId: z.string().min(1).max(120),
  reason: z.enum(MARKING_FLAG_REASONS),
  note: z.string().max(500).default(""),
  awarded: z.number().int().min(0).max(30).nullable().optional(),
  maxMarks: z.number().int().min(0).max(30),
  markedBy: z.enum(["ai", "rubric", "self"]),
});

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
  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dispute." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Dispute sharing is not configured on this server." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // Read-only cookie stores still authenticate reads.
        }
      },
    },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to share a dispute." }, { status: 401 });

  const limited = rateLimit(`dispute:${auth.user.id}`, DISPUTE_RATE);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many disputes in a short time. Wait a moment." }, { status: 429 });
  }

  const d = parsed.data;
  const { error } = await supabase.from("marking_disputes").insert({
    user_id: auth.user.id,
    anon_id: d.anonId,
    attempt_id: d.attemptId,
    question_id: d.questionId,
    part_id: d.partId,
    subject_id: d.subjectId,
    reason: d.reason,
    note: d.note,
    awarded: d.awarded ?? null,
    max_marks: d.maxMarks,
    marked_by: d.markedBy,
  });
  if (error) {
    return NextResponse.json({ error: "The dispute could not be shared. It stays on this device." }, { status: 502 });
  }
  return NextResponse.json({ shared: true }, { status: 201, headers: { "cache-control": "no-store" } });
}
