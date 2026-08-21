import { NextResponse } from "next/server";
import { providerStatus } from "@/ai/provider";
import * as tasks from "@/ai/tasks";
import { payloadSchemas } from "@/ai/tasks";
import { AI_TASKS } from "@/ai/types";
import type { AiTask } from "@/ai/types";
import type { Question } from "@/domain/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// The single AI entry point. Keys never leave this process; the browser only
// ever sees a task name and a validated payload going out, and an envelope
// coming back that states whether a model or the offline fallback answered.

export const runtime = "nodejs";

const LIMIT = { ratePerMinute: 20, burst: 10 };

export async function GET() {
  return NextResponse.json(providerStatus());
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request), LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many AI requests. The rest of the app keeps working — try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { task?: string; payload?: unknown };
  try {
    body = await request.json();
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

  try {
    const result = await dispatch(task, parsed.data);
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
