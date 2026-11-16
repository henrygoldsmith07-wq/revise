import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { sameOriginRequest } from "@/domain/account-deletion";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedText } from "@/lib/bounded-body";

// ---------------------------------------------------------------------------
// Pilot telemetry intake. Opt-in, insert-only, stored against the account.
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

/**
 * Revise's own pilot opt-in, re-read server-side from the caller's own synced
 * `user_settings` row on every request (same pattern as the Pulse history
 * route). Off by default: a missing row, a missing flag, or anything other than
 * an explicit boolean `true` withholds the write. A stale client that still
 * thinks the switch is on cannot keep writing study-outcome events after the
 * learner turns it off, and a hand-written request never reaches the insert.
 */
function pilotTelemetryAllowed(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  return (data as { pilotTelemetry?: unknown }).pilotTelemetry === true;
}

/**
 * The settings row is end-to-end encrypted, so the server cannot read the
 * pilot choice. Same shape test as `pulseSettingsEncrypted` and the client's
 * `isEncryptedPayload`; fail closed rather than guessing.
 */
function pilotSettingsEncrypted(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const v = data as Record<string, unknown>;
  return v.v === 1 && v.alg === "AES-GCM" && typeof v.iv === "string" && typeof v.ct === "string";
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !sameOriginRequest(request.url, origin, request.headers.get("sec-fetch-site"))) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  const read = await readBoundedText(request, MAX_BODY_CHARS);
  if (!read.ok) {
    return read.reason === "too-large"
      ? NextResponse.json({ error: "Request body is too large." }, { status: 413 })
      : NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(read.text);
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

  // Re-read the caller's own opt-in under RLS before any insert. The user-scoped
  // client (anon key + session cookies) can only see this account's settings
  // row; the service role is deliberately not used. Absent/false, E2EE, or an
  // unreadable row all refuse the write rather than trusting the client.
  const { data: settingsRow, error: settingsError } = await supabase
    .from("user_settings")
    .select("data")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (settingsError) {
    return NextResponse.json(
      { error: "Your pilot telemetry choice could not be read. Nothing was recorded." },
      { status: 409 },
    );
  }
  const settingsData =
    settingsRow && typeof settingsRow === "object" && "data" in settingsRow
      ? (settingsRow as { data: unknown }).data
      : null;
  if (pilotSettingsEncrypted(settingsData)) {
    return NextResponse.json(
      {
        error: "Sync encryption is on, so Revise's server cannot read your pilot telemetry choice. Turn off sync encryption in Revise settings.",
        code: "e2ee",
      },
      { status: 409 },
    );
  }
  if (!pilotTelemetryAllowed(settingsData)) {
    return NextResponse.json(
      { error: "Pilot telemetry is turned off. Enable it in Revise settings." },
      { status: 403 },
    );
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
