import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { providerStatus } from "@/ai/provider";
import * as tasks from "@/ai/tasks";
import { payloadSchemas } from "@/ai/tasks";
import { AI_TASKS } from "@/ai/types";
import type { AiTask } from "@/ai/types";
import type { Question } from "@/domain/types";
import {
  AI_RATE_LIMIT,
  aiDailyLimit,
  aiTaskCost,
  rateLimitWithCost,
  resolveRateLimitKey,
} from "@/lib/rate-limit";
import { captureServerTelemetry } from "@/lib/observability";

// The single AI entry point. Keys never leave this process; the browser only
// ever sees a task name and a validated payload going out, and an envelope
// coming back that states whether a model or the offline fallback answered.
// Provider credentials are read only inside src/ai/provider.ts (server-only);
// this route never references a key and never serialises one.

export const runtime = "nodejs";

export const MAX_BODY_CHARS = 1_500_000;
export const MAX_OCR_CHARS = 1_200_000;

type AiAuth = { error: NextResponse } | { userId: string | null };

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

async function requireAiUser(): Promise<AiAuth> {
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
    return { userId: null };
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
  return { userId: auth.user.id };
}

export async function GET() {
  return NextResponse.json(providerStatus());
}

export async function POST(request: Request) {
  const auth = await requireAiUser();
  if ("error" in auth) return auth.error;
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

  // Enforce quota by authenticated user where possible (else IP), with
  // per-minute + burst + daily allowance and per-task cost accounting.
  const cost = aiTaskCost(task);
  const limit = rateLimitWithCost(rateKey, cost, {
    ...AI_RATE_LIMIT,
    dailyLimit: aiDailyLimit(),
  });
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
    const result = await dispatch(task, parsed.data);
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
    console.error(`[ai] ${task} failed`, error);
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
      const p = payload as { topicId: string; history: { role: "user" | "assistant"; content: string }[] };
      return tasks.socratic(p.topicId, p.history);
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
  }
}
