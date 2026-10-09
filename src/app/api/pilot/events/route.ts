import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOriginRequest } from "@/domain/account-deletion";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Pilot telemetry intake. Opt-in, anonymous, insert-only.
//
// The client sends outcome events only after the learner switches pilot
// telemetry on in Settings → Data (off by default;_revise pilotTelemetry_).
// Each row carries a rotating device-minted pseudonym, a closed event name,
// counts and a curriculum subject id. No free text, no raw answers, no device
// data; the UTC day is stamped by the database default. There is no select
// policy on the table, so nothing inserted here can be read back by clients.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 8_000;
const MAX_EVENTS = 50;
const PILOT_RATE = { ratePerMinute: 20, burst: 5 } as const;

const pilotEventSchema = z.object({
  anonId: z.string().regex(/^[0-9a-fA-F-]{8,64}$/),
  event: z.enum([
    "diagnostic.completed",
    "recommendation.started",
    "marks.recovered",
    "proof.completed",
    "first-loss-to-proof",
    "proof.blocked",
  ]),
  subjectId: z.string().min(1).max(120).nullable().optional(),
  count: z.number().int().min(0).max(1_000_000).nullable().optional(),
  minutes: z.number().int().min(0).max(100_000).nullable().optional(),
});

const pilotBodySchema = z.object({ events: z.array(pilotEventSchema).min(1).max(MAX_EVENTS) });

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
  const parsed = pilotBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pilot events." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Pilot telemetry is not configured on this server." }, { status: 503 });
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
  if (!auth.user) return NextResponse.json({ error: "Sign in to share pilot telemetry." }, { status: 401 });

  const limited = rateLimit(`pilot:${auth.user.id}`, PILOT_RATE);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many events in a short time. Wait a moment." }, { status: 429 });
  }

  const rows = parsed.data.events.map((e) => ({
    user_id: auth.user!.id,
    anon_id: e.anonId,
    event: e.event,
    subject_id: e.subjectId ?? null,
    count_value: e.count ?? null,
    minutes_value: e.minutes ?? null,
  }));
  const { error } = await supabase.from("product_events").insert(rows);
  if (error) {
    return NextResponse.json({ error: "Pilot events could not be saved. Nothing was recorded." }, { status: 502 });
  }
  return NextResponse.json({ recorded: rows.length }, { status: 201, headers: { "cache-control": "no-store" } });
}
