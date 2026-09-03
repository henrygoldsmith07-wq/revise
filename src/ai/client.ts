import {
  diagnoseFallback,
  explainFallback,
  generateCardsFallback,
  generateQuestionsFallback,
  markFallback,
  socraticFallback,
  summariseFallback,
  videoLessonFallback,
} from "./fallback";
import { resilientMark } from "./marking-resilience";
import { maskChatHistory, maskPii, maskStudentText, maskSummaryMany } from "./pii";
import { getTopic } from "@/domain/curriculum";
import { withMarkEvidence } from "@/domain/marking";
import type { Mistake, Question, Topic } from "@/domain/types";
import { RESPONSE_SCHEMAS } from "./types";
import type {
  AiEnvelope,
  AiTask,
  DiagnoseResponse,
  ExplainResponse,
  GeneratedCard,
  GeneratedQuestion,
  MarkResponse,
  OcrResponse,
  SocraticResponse,
  SummariseResponse,
  VideoLessonResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Browser-side AI client. Every call has the *same* offline fallback the
// server has, so losing the network mid-session degrades identically to having
// no provider configured: the feature still returns something correct.
// ---------------------------------------------------------------------------

async function call<T>(task: AiTask, payload: unknown, fallback: () => T): Promise<AiEnvelope<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { data: fallback(), source: "fallback", note: "offline" };
  }
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, payload }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { data: fallback(), source: "fallback", note: body.error ?? `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { data?: unknown; source?: unknown; [key: string]: unknown };
    const parsed = RESPONSE_SCHEMAS[task].safeParse(body?.data);
    if (!parsed.success || (body?.source !== "ai" && body?.source !== "fallback")) {
      return {
        data: fallback(),
        source: "fallback",
        note: "The AI response did not match its structured output contract.",
      };
    }
    return { ...body, data: parsed.data } as AiEnvelope<T>;
  } catch (error) {
    return {
      data: fallback(),
      source: "fallback",
      note: error instanceof Error ? error.message : "request failed",
    };
  }
}

export function aiExplain(topicId: string, question?: string) {
  return call<ExplainResponse>("explain", { topicId, question: question ? maskStudentText(question) : undefined }, () =>
    explainFallback(topicId, question),
  );
}

export function aiSocratic(topicId: string, history: { role: "user" | "assistant"; content: string }[]) {
  return call<SocraticResponse>("socratic", { topicId, history: maskChatHistory(history) }, () =>
    socraticFallback(topicId, history.length),
  );
}

export async function aiMark(question: Question, answers: Record<string, string>, opts?: { useLocalModel?: boolean }) {
  // Resilience chain: semantic cache → local model (when enabled + loaded) →
  // cloud AI → rubric fallback. The tier records which link actually graded;
  // the DLQ enqueue happens in the caller once the real attempt is persisted.
  // Student answers are PII-masked before anything leaves the device; the
  // rubric fallback (and the stored attempt) always see the original text.
  const maskByPart = new Map<string, ReturnType<typeof maskPii>>();
  const maskedAnswers = Object.fromEntries(
    Object.entries(answers).map(([key, value]) => {
      const result = maskPii(value);
      maskByPart.set(key, result);
      return [key, result.masked];
    }),
  );
  const { envelope, tier } = await resilientMark(
    question,
    answers,
    (q, a) => markFallback(q, a),
    () => call<MarkResponse>("mark", { question, answers: maskedAnswers }, () => markFallback(question, answers)),
    opts,
  );
  // Disclosure is honest about *what left the device*: only the cloud AI tier
  // transmits masked text, so only then is "details withheld" claimed. Cache,
  // local-model and rubric grades never sent the answer anywhere.
  const withheld =
    tier === "ai" ? maskSummaryMany([...maskByPart.values()]) : null;
  return { ...envelope, data: withMarkEvidence(question, answers, envelope.data), tier, withheld };
}

export function aiGenerateCards(topicId: string, count = 8) {
  return call<{ cards: GeneratedCard[] }>("generate-cards", { topicId, count }, () => ({
    cards: generateCardsFallback(topicId, count),
  }));
}

export function aiGenerateQuestions(topicId: string, count = 2, difficulty?: number) {
  return call<{ questions: GeneratedQuestion[] }>("generate-questions", { topicId, count, difficulty }, () => ({
    questions: generateQuestionsFallback(topicId, count),
  }));
}

export function aiSummarise(topicId: string) {
  return call<SummariseResponse>("summarise", { topicId }, () => summariseFallback(topicId));
}

/** Storyboard a topic as a video-style lesson (timed scenes with narration). */
export function aiVideoLesson(topicId: string) {
  return call<VideoLessonResponse>("video-lesson", { topicId }, () => videoLessonFallback(topicId));
}

export function aiDiagnose(topicIds: string[], mistakes: Mistake[]) {
  const topics = topicIds.map((id) => getTopic(id)).filter((t): t is Topic => Boolean(t));
  return call<DiagnoseResponse>("diagnose", { topicIds, mistakes }, () => diagnoseFallback(topics, mistakes));
}

export function aiExtractQuestions(subjectId: string, text: string) {
  return call<{ questions: GeneratedQuestion[] }>("extract-questions", { subjectId, text }, () => ({
    questions: [],
  }));
}

/** Generate cards from the student's own notes. Needs a model: nothing local
 *  can comprehend arbitrary prose. */
export function aiCardsFromNotes(text: string, count = 10, topicId?: string) {
  return call<{ cards: GeneratedCard[] }>("cards-from-notes", { text, count, topicId }, () => ({ cards: [] }));
}

/**
 * Transcribe a photographed answer or paper. Returns empty text when no vision
 * provider is available — callers must keep the type/dictate paths available.
 */
export function aiOcr(image: string, mediaType: string, hint: "handwriting" | "printed" | "auto" = "auto") {
  return call<OcrResponse>("ocr", { image, mediaType, hint }, () => ({ text: "", confidence: 0 }));
}

/** Whether a model is configured. Used only to label the UI honestly. */
export async function aiStatus(): Promise<{ available: boolean; name: string | null }> {
  try {
    const res = await fetch("/api/ai");
    if (!res.ok) return { available: false, name: null };
    return (await res.json()) as { available: boolean; name: string | null };
  } catch {
    return { available: false, name: null };
  }
}
