import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { providerStatus } from "@/ai/provider";
import * as tasks from "@/ai/tasks";
import { payloadSchemas } from "@/ai/tasks";
import { AI_TASKS } from "@/ai/types";
import type { AiTask, SocraticExaminerPayload } from "@/ai/types";
import type { Question } from "@/domain/types";
import {
  aiTaskCost,
  resolveRateLimitKey,
} from "@/lib/rate-limit";
import { enforceAiRateLimit, RateLimiterUnavailableError, type QuotaRpcCaller } from "@/lib/rate-limit-supabase";
import { captureServerTelemetry, errorClass } from "@/lib/observability";
import { AI_CONSENT_HEADER, decideAiConsent, type AiConsentDecision } from "@/domain/ai-consent";
import { prepareAiEgress } from "@/ai/egress";

// The single AI entry point. Keys never leave this process; the browser only
// ever sees a task name and a validated payload going out, and an envelope
// coming back that states whether a model or the offline fallback answered.
// Provider credentials are read only inside src/ai/provider.ts (server-only);
// this route never references a key and never serialises one.
//
// Privacy order for every POST, before any quota row is touched or any
// provider is called:
//   1. authentication (401), or fail-closed configuration (503);
//   2. the learner's AI consent (403 when absent, disabled or revoked; 503
//      when it cannot be read) — re-read from public.ai_consent on every
//      request, so revoking takes effect on the very next call;
//   3. payload validation (400/413);
//   4. the egress policy (src/ai/egress.ts) re-applied server-side, so an
//      older client or a hand-written request still cannot put unmasked
//      learner text in front of a model;
//   5. the shared quota.

export const runtime = "nodejs";

export const MAX_BODY_CHARS = 1_500_000;
export const MAX_OCR_CHARS = 1_200_000;

type AiAuth =
  | { error: NextResponse }
  | { userId: string | null; rpc: QuotaRpcCaller | null; consent: AiConsentDecision };

function providerCredentialsPresent(): boolean {
  // Mirrors src/ai/provider.ts selection without importing keys: any provider
  // env means a deployment intends to call a model.
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (process.env.AI_PROVIDER === "none") return false;
  if (process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_MODEL) return true;
  if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "none") return true;
  return false;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

async function requireAiUser(request: Request): Promise<AiAuth> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    // Fail closed in production: a deployment with provider credentials but
    // missing auth config must not expose AI endpoints without authentication.
    // Local development keeps intentional offline mode (no auth, local user).
    if (isProduction() && providerCredentialsPresent()) {
      return {
        error: NextResponse.json(
          { error: "AI authentication is not configured. Set Supabase auth before enabling AI providers." },
          { status: 503 },
        ),
      };
    }
    // Local mode (non-production, or no provider configured): there is no
    // account to hold consent, so the browser's versioned consent header is
    // the learner's recorded choice. Production with a provider never gets
    // here — it failed closed above.
    return { userId: null, rpc: null, consent: decideAiConsent({ mode: "local", header: request.headers.get(AI_CONSENT_HEADER) }) };
  }

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
    return { error: NextResponse.json({ error: "Sign in to use AI features." }, { status: 401 }) };
  }
  // The same authenticated client enforces the shared quota: its JWT scopes
  // the consume_ai_quota RPC to this user via auth.uid().
  const rpc: QuotaRpcCaller = {
    rpc: async (fn, args) => {
      const res = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>)(
        fn,
        args as Record<string, unknown>,
      );
      return res;
    },
  };
  // Consent is the server's own record, read with the learner's JWT (RLS
  // scopes the row to auth.uid()). Never the synced settings blob: that can be
  // end-to-end encrypted and lags behind a revocation by a sync cycle.
  const { data: consentRow, error: consentError } = await supabase
    .from("ai_consent")
    .select("enabled, consent_version")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return { userId: auth.user.id, rpc, consent: decideAiConsent({ mode: "account", row: consentRow, error: consentError }) };
}

export async function GET() {
  return NextResponse.json(providerStatus());
}

export async function POST(request: Request) {
  const auth = await requireAiUser(request);
  if ("error" in auth) return auth.error;
  if (!auth.consent.allowed) {
    return NextResponse.json({ error: auth.consent.error, code: auth.consent.code }, { status: auth.consent.status });
  }
  const rateKey = resolveRateLimitKey(request, auth.userId);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: { task?: string; payload?: unknown };
  try {
    body = JSON.parse(raw) as { task?: string; payload?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const task = body.task as AiTask;
  if (!AI_TASKS.includes(task)) {
    return NextResponse.json({ error: `Unknown task "${body.task}".` }, { status: 400 });
  }

  const parsed = payloadSchemas[task].safeParse(body.payload ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid payload: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` },
      { status: 400 },
    );
  }

  if (task === "ocr") {
    const image = (parsed.data as { image?: string }).image ?? "";
    if (image.length > MAX_OCR_CHARS) {
      return NextResponse.json({ error: "Image payload is too large." }, { status: 413 });
    }
  }

  // Same egress policy the browser applied: masking, minimisation and image
  // metadata stripping. Idempotent, so a well-behaved client loses nothing.
  const egress = prepareAiEgress(task, parsed.data);
  if (!egress.ok) {
    return NextResponse.json({ error: egress.reason }, { status: 400 });
  }

  // Enforce quota by authenticated user where possible (else IP), with
  // per-minute + burst + daily allowance and per-task cost accounting. The
  // shared Supabase backend holds the quota across instances; the in-memory
  // bucket is local development only.
  const cost = aiTaskCost(task);
  let limit;
  try {
    limit = await enforceAiRateLimit({ key: rateKey, cost, userId: auth.userId, rpc: auth.rpc });
  } catch (error) {
    if (error instanceof RateLimiterUnavailableError) {
      captureServerTelemetry("ai.degraded", { status: "degraded", task, provider: null });
      return NextResponse.json(
        { error: "AI rate limiting is unavailable right now. The rest of the app keeps working — try again shortly." },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!limit.ok) {
    return NextResponse.json(
      {
        error:
          limit.limitedBy === "daily"
            ? "Daily AI allowance used up. The rest of the app keeps working — try again tomorrow."
            : "Too many AI requests. The rest of the app keeps working — try again shortly.",
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await dispatch(task, egress.payload);
    const envelope = result as { source?: unknown; provider?: unknown };
    if (envelope.source === "fallback") {
      captureServerTelemetry("ai.degraded", {
        status: "degraded",
        task,
        provider: typeof envelope.provider === "string" ? envelope.provider : null,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    // Genuine 500s only — task-level model failures are handled inside the
    // task layer and come back as `source: "fallback"`.
    // Log a label only: a thrown provider error can quote the provider's
    // response, which may echo the request. Never log the error object, its
    // message, or anything derived from the payload.
    console.error(`[ai] ${task} failed`, { errorClass: errorClass(error) });
    return NextResponse.json({ error: "The AI service failed unexpectedly." }, { status: 500 });
  }
}

async function dispatch(task: AiTask, payload: unknown) {
  switch (task) {
    case "explain": {
      const p = payload as { topicId: string; question?: string };
      return tasks.explain(p.topicId, p.question);
    }
    case "socratic": {
      const p = payload as {
        topicId: string;
        history: { role: "user" | "assistant"; content: string }[];
        examiner?: SocraticExaminerPayload;
      };
      return tasks.socratic(p.topicId, p.history, p.examiner);
    }
    case "tutor": {
      const p = payload as {
        topicId: string;
        history: { role: "user" | "assistant"; content: string }[];
        learner: { position?: string; masteryLine?: string; openMistakes: { point: string; category: string; marksLost: number }[] };
      };
      return tasks.tutor(p.topicId, p.history, p.learner);
    }
    case "mark": {
      const p = payload as { question: Question; answers: Record<string, string> };
      return tasks.mark(p.question, p.answers);
    }
    case "generate-cards": {
      const p = payload as { topicId: string; count: number };
      return tasks.generateCards(p.topicId, p.count);
    }
    case "generate-questions": {
      const p = payload as { topicId: string; count: number; difficulty?: number };
      return tasks.generateQuestions(p.topicId, p.count, p.difficulty);
    }
    case "summarise": {
      const p = payload as { topicId: string };
      return tasks.summarise(p.topicId);
    }
    case "diagnose": {
      const p = payload as { topicIds: string[]; mistakes: unknown[] };
      return tasks.diagnose(p.topicIds, p.mistakes);
    }
    case "cards-from-notes": {
      const p = payload as { text: string; count: number; topicId?: string };
      return tasks.cardsFromNotes(p.text, p.count, p.topicId);
    }
    case "ocr": {
      const p = payload as { image: string; mediaType: string; hint: "handwriting" | "printed" | "auto" };
      return tasks.ocr(p.image, p.mediaType, p.hint);
    }
    case "extract-questions": {
      const p = payload as { subjectId: string; text: string };
      return tasks.extractQuestions(p.subjectId, p.text);
    }
    case "diagnose-error": {
      const p = payload as { prompt: string; point: string; answer: string; awarded: number; maxMarks: number; command?: string | null };
      return tasks.diagnoseError(p);
    }
    case "route-spec": {
      const p = payload as { subjectId: string; text: string };
      return tasks.routeSpec(p);
    }
  }
}
