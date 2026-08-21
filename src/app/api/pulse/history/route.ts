import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pulseHistoryAllowed } from "@/data/pulse-consent";

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

function reviewRecord(row: JsonRow): Record<string, unknown> | null {
  const data = object(row.data);
  const id = userId(row.id ?? data?.id);
  const reviewedAt = iso(data?.reviewedAt);
  const cardId = userId(data?.cardId);
  const topicId = userId(data?.topicId);
  const subjectId = userId(data?.subjectId);
  const grade = data?.grade;
  if (!id || !reviewedAt || !cardId || !topicId || !subjectId) return null;
  if (grade !== "again" && grade !== "hard" && grade !== "good" && grade !== "easy") return null;
  return {
    kind: "review",
    id,
    cardId,
    topicId,
    subjectId,
    grade,
    ...(typeof data?.confidence === "number" ? { confidence: data.confidence } : {}),
    elapsedMs: typeof data?.elapsedMs === "number" ? Math.max(0, data.elapsedMs) : 0,
    reviewedAt,
  };
}

function attemptRecord(row: JsonRow): Record<string, unknown> | null {
  const data = object(row.data);
  const id = userId(row.id ?? data?.id);
  const createdAt = iso(data?.createdAt);
  const questionId = userId(data?.questionId);
  const subjectId = userId(data?.subjectId);
  const topicIds = Array.isArray(data?.topicIds) ? data.topicIds.filter((item): item is string => typeof item === "string") : [];
  const awarded = data?.awarded;
  const max = data?.max;
  const mode = data?.mode;
  const markedBy = data?.markedBy;
  if (!id || !createdAt || !questionId || !subjectId || typeof awarded !== "number" || typeof max !== "number") return null;
  if (mode !== "practice" && mode !== "paper" && mode !== "recall") return null;
  if (markedBy !== "ai" && markedBy !== "rubric" && markedBy !== "self") return null;
  return {
    kind: "attempt",
    id,
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

  const [reviews, attempts] = await Promise.all([
    supabase.from("review_logs").select("id, updated_at, data").eq("user_id", auth.user.id).gt("updated_at", since).order("updated_at", { ascending: true }).limit(limit),
    supabase.from("attempts").select("id, updated_at, data").eq("user_id", auth.user.id).gt("updated_at", since).order("updated_at", { ascending: true }).limit(limit),
  ]);
  const error = reviews.error ?? attempts.error;
  if (error) return NextResponse.json({ error: "Revise history could not be read." }, { status: 502 });

  const records = [
    ...(reviews.data ?? []).map((row) => reviewRecord(row as JsonRow)).filter((row): row is Record<string, unknown> => row !== null),
    ...(attempts.data ?? []).map((row) => attemptRecord(row as JsonRow)).filter((row): row is Record<string, unknown> => row !== null),
  ].sort((a, b) => String(a.kind === "review" ? a.reviewedAt : a.createdAt).localeCompare(String(b.kind === "review" ? b.reviewedAt : b.createdAt)));

  return NextResponse.json({
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    source: "revise",
    connectorVersion: CONNECTOR_VERSION,
    generatedAt: new Date().toISOString(),
    records: records.slice(0, limit),
    cursor: null,
    hasMore: records.length > limit,
  }, { headers: { "cache-control": "no-store" } });
}
