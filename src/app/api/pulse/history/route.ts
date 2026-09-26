import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pulseHistoryAllowed } from "@/data/pulse-consent";
import {
  decodePulseCursor,
  encodePulseCursor,
  isAfterPulseCursor,
  comparePulseRow,
  pulseOrCondition,
  pulseTableQuery,
  type PulseKind,
} from "@/lib/pulse-history";

export const runtime = "nodejs";

const FORMAT = "le-studio.source-history";
const SCHEMA_VERSION = 2;
const CONNECTOR_VERSION = "2.0.0";

type JsonRow = { id?: unknown; updated_at?: unknown; data?: unknown };

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function iso(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function userId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

type PulseRecord = Record<string, unknown> & { kind: PulseKind; id: string; updatedAt: string };

function reviewRecord(row: JsonRow): PulseRecord | null {
  const data = object(row.data);
  const id = userId(row.id ?? data?.id);
  const updatedAt = iso(row.updated_at) ?? iso(data?.reviewedAt);
  const reviewedAt = iso(data?.reviewedAt);
  const cardId = userId(data?.cardId);
  const topicId = userId(data?.topicId);
  const subjectId = userId(data?.subjectId);
  const grade = data?.grade;
  if (!id || !updatedAt || !reviewedAt || !cardId || !topicId || !subjectId) return null;
  if (grade !== "again" && grade !== "hard" && grade !== "good" && grade !== "easy") return null;
  return {
    kind: "review",
    id,
    updatedAt,
    cardId,
    topicId,
    subjectId,
    grade,
    ...(typeof data?.confidence === "number" ? { confidence: data.confidence } : {}),
    elapsedMs: typeof data?.elapsedMs === "number" ? Math.max(0, data.elapsedMs) : 0,
    reviewedAt,
  };
}

function attemptRecord(row: JsonRow): PulseRecord | null {
  const data = object(row.data);
  const id = userId(row.id ?? data?.id);
  const updatedAt = iso(row.updated_at) ?? iso(data?.createdAt);
  const createdAt = iso(data?.createdAt);
  const questionId = userId(data?.questionId);
  const subjectId = userId(data?.subjectId);
  const topicIds = Array.isArray(data?.topicIds) ? data.topicIds.filter((item): item is string => typeof item === "string") : [];
  const awarded = data?.awarded;
  const max = data?.max;
  const mode = data?.mode;
  const markedBy = data?.markedBy;
  if (!id || !updatedAt || !createdAt || !questionId || !subjectId || typeof awarded !== "number" || typeof max !== "number") return null;
  if (mode !== "practice" && mode !== "paper" && mode !== "recall") return null;
  if (markedBy !== "ai" && markedBy !== "rubric" && markedBy !== "self") return null;
  return {
    kind: "attempt",
    id,
    updatedAt,
    questionId,
    subjectId,
    topicIds,
    awarded,
    max,
    ...(typeof data?.confidence === "number" ? { confidence: data.confidence } : {}),
    elapsedMs: typeof data?.elapsedMs === "number" ? Math.max(0, data.elapsedMs) : 0,
    mode,
    markedBy,
    createdAt,
  };
}

function isValidSince(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? value : "1970-01-01T00:00:00.000Z";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = isValidSince(url.searchParams.get("since"));
  const requestedLimit = Number(url.searchParams.get("limit") ?? 500);
  const limit = Math.min(1000, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 500));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw == null || cursorRaw === "" ? null : decodePulseCursor(cursorRaw);
  if (cursorRaw != null && cursorRaw !== "" && !cursor) {
    return NextResponse.json({ error: "Invalid cursor. Restart history sync from the beginning." }, { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Revise cloud history is not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // A read-only request cookie store is still sufficient to authenticate.
        }
      },
    },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to Revise before connecting Pulse." }, { status: 401 });

  // The user's own opt-in gates the flow at the source: Pulse may only read
  // this account's history while `pulseEnabled` is true in the synced
  // user_settings row. Absent row, absent flag, or a revoked flag all withhold.
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("data")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const settingsData =
    settingsRow && typeof settingsRow === "object" && "data" in settingsRow ? (settingsRow as { data: unknown }).data : null;
  if (!pulseHistoryAllowed(settingsData)) {
    return NextResponse.json(
      { error: "Sharing study history with Pulse is turned off. Enable it in Revise settings." },
      { status: 403 },
    );
  }

  // Deterministic continuation: each table queries its own exact
  // lexicographic tail of the global (updated_at, kind, id) order —
  // `updated_at > ts`, or the `= ts AND id > id` tie-block when the table's
  // kind can still hold rows after the cursor. A coarse `>= ts` prefix would
  // skip records whenever a timestamp tie exceeds the SQL limit (the database
  // returns the tie's earliest rows and the in-memory cursor filter discards
  // them all). Fetching limit+1 per table fills the merged page and detects
  // hasMore without a count query.
  const pageSize = limit + 1;
  const reviewsScope = pulseTableQuery("review", cursor, since);
  const attemptsScope = pulseTableQuery("attempt", cursor, since);
  const baseReviews = supabase.from("review_logs").select("id, updated_at, data").eq("user_id", auth.user.id);
  const baseAttempts = supabase.from("attempts").select("id, updated_at, data").eq("user_id", auth.user.id);
  const scopedReviews =
    reviewsScope.mode === "or"
      ? baseReviews.or(pulseOrCondition(reviewsScope))
      : reviewsScope.mode === "gte"
        ? baseReviews.gte("updated_at", reviewsScope.ts)
        : baseReviews.gt("updated_at", reviewsScope.ts);
  const scopedAttempts =
    attemptsScope.mode === "or"
      ? baseAttempts.or(pulseOrCondition(attemptsScope))
      : attemptsScope.mode === "gte"
        ? baseAttempts.gte("updated_at", attemptsScope.ts)
        : baseAttempts.gt("updated_at", attemptsScope.ts);
  const [reviews, attempts] = await Promise.all([
    scopedReviews.order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(pageSize),
    scopedAttempts.order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(pageSize),
  ]);
  const error = reviews.error ?? attempts.error;
  if (error) return NextResponse.json({ error: "Revise history could not be read." }, { status: 502 });

  const merged = [
    ...(reviews.data ?? []).map((row) => reviewRecord(row as JsonRow)).filter((row): row is PulseRecord => row !== null),
    ...(attempts.data ?? []).map((row) => attemptRecord(row as JsonRow)).filter((row): row is PulseRecord => row !== null),
  ]
    // Drop rows at/below the floor that the coarse >= scan over-fetched.
    // First page (no cursor): strict > since to preserve legacy since semantics.
    .filter((row) => (cursor ? isAfterPulseCursor({ kind: row.kind, id: row.id, updatedAt: row.updatedAt }, cursor) : row.updatedAt > since))
    .sort((a, b) => comparePulseRow(
      { kind: a.kind, id: a.id, updatedAt: a.updatedAt },
      { kind: b.kind, id: b.id, updatedAt: b.updatedAt },
    ));

  const page = merged.slice(0, limit);
  const hasMore = merged.length > limit;
  const last = page[page.length - 1] ?? null;
  const nextCursor = hasMore && last ? encodePulseCursor({ ts: last.updatedAt, kind: last.kind, id: last.id }) : null;
  // updatedAt is transport for ordering only — strip it so the wire format
  // stays exactly {kind, id, ...payload, reviewedAt/createdAt}.
  const records = page.map((row) => {
    const { updatedAt, ...rest } = row;
    void updatedAt;
    return rest;
  });

  return NextResponse.json({
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    source: "revise",
    connectorVersion: CONNECTOR_VERSION,
    generatedAt: new Date().toISOString(),
    records,
    cursor: nextCursor,
    hasMore,
  }, { headers: { "cache-control": "no-store" } });
}
