import {
  diagnoseFallback,
  explainFallback,
  generateCardsFallback,
  generateQuestionsFallback,
  markFallback,
  socraticFallback,
  summariseFallback,
} from "./fallback";
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
  return call<ExplainResponse>("explain", { topicId, question }, () => explainFallback(topicId, question));
}

export function aiSocratic(topicId: string, history: { role: "user" | "assistant"; content: string }[]) {
  return call<SocraticResponse>("socratic", { topicId, history }, () => socraticFallback(topicId, history.length));
}

export async function aiMark(question: Question, answers: Record<string, string>) {
  const envelope = await call<MarkResponse>("mark", { question, answers }, () => markFallback(question, answers));
  return { ...envelope, data: withMarkEvidence(question, answers, envelope.data) };
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
