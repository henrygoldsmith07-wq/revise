import {
  diagnoseFallback,
  explainFallback,
  generateCardsFallback,
  generateQuestionsFallback,
  markFallback,
  socraticFallback,
  summariseFallback,
  tutorFallback,
} from "./fallback";
import { resilientMark } from "./marking-resilience";
import { maskChatHistory, maskPii, maskStudentText, maskSummaryMany } from "./pii";
import { localAiConsentGranted } from "./consent-client";
import { sendAiTask } from "./transport";
import { assessMarkConfidence } from "@/domain/marking-confidence";
import { AI_CONSENT_REQUIRED_MESSAGE } from "@/domain/ai-consent";
import { getTopic } from "@/domain/curriculum";
import { localClassifyError } from "@/domain/error-local-classifier";
import { ERROR_TAXONOMY_VERSION } from "@/domain/error-taxonomy";
import { rubricConfidence, withMarkEvidence } from "@/domain/marking";
import type { Mistake, Question, Topic } from "@/domain/types";
import { RESPONSE_SCHEMAS } from "./types";
import type { TutorLearnerContext } from "@/domain/tutor-grounding";
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
  TutorChatMessage,
  TutorResponse,
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
    // Consent gate + egress policy + request, in that order (src/ai/transport.ts).
    const sent = await sendAiTask(task, payload);
    if (!sent.ok) return { data: fallback(), source: "fallback", note: sent.note };
    const res = sent.response;
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

/**
 * One tutor turn. The conversation history and the lost mark-scheme points are
 * PII-masked before anything leaves the device; the offline fallback (and the
 * visible reply when the network fails) always sees the original text.
 */
export function aiTutor(input: {
  topicId: string;
  history: TutorChatMessage[];
  learner: TutorLearnerContext;
}) {
  return call<TutorResponse>(
    "tutor",
    {
      topicId: input.topicId,
      history: maskChatHistory(input.history),
      learner: {
        position: input.learner.position,
        masteryLine: input.learner.masteryLine,
        openMistakes: input.learner.openMistakes.map((mistake) => ({
          ...mistake,
          point: maskStudentText(mistake.point),
        })),
      },
    },
    () => tutorFallback(input.topicId, input.history.length, input.learner),
  );
}

export async function aiMark(question: Question, answers: Record<string, string>, opts?: { useLocalModel?: boolean }) {
  // Resilience chain: semantic cache → local model (when enabled + loaded) →
  // cloud AI → rubric fallback. The tier records which link actually graded;
  // the DLQ enqueue happens in the caller once the real attempt is persisted.
  // Student answers are PII-masked before anything leaves the device (here for
  // the disclosure, and again inside the shared transport's egress policy);
  // the rubric fallback (and the stored attempt) always see the original text.
  const maskByPart = new Map<string, ReturnType<typeof maskPii>>();
  const maskedAnswers = Object.fromEntries(
    Object.entries(answers).map(([key, value]) => {
      const result = maskPii(value);
      maskByPart.set(key, result);
      return [key, result.masked];
    }),
  );
  let cloudAttempted = false;
  let cloudBlocked = false;
  const { envelope, tier } = await resilientMark(
    question,
    answers,
    (q, a) => markFallback(q, a),
    async () => {
      cloudBlocked = !(await localAiConsentGranted());
      cloudAttempted = !cloudBlocked;
      const server = await call<MarkResponse>("mark", { question, answers: maskedAnswers }, () => markFallback(question, answers));
      // The server refusing for lack of consent (revoked on another device) is
      // not a transient failure: nothing should be queued for a retry.
      if (server.note === AI_CONSENT_REQUIRED_MESSAGE) cloudBlocked = true;
      // Only a genuine model grade is taken from the server. Any server-side
      // rubric result was computed from masked answers and a minimised
      // question, so the authoritative deterministic mark is recomputed here
      // from the full question and the learner's original text.
      return server.source === "ai" ? server : { ...server, data: markFallback(question, answers) };
    },
    opts,
  );
  // Disclosure is honest about *what left the device*: only the cloud AI tier
  // transmits masked text, so only then is "details withheld" claimed. Cache,
  // local-model and rubric grades never sent the answer anywhere.
  const withheld =
    tier === "ai" ? maskSummaryMany([...maskByPart.values()]) : null;
  const data = withMarkEvidence(question, answers, envelope.data);
  // Confidence-aware result: AI interpretation → deterministic checks against
  // the mark scheme and the rubric → confidence → provisional or not.
  const assessment = assessMarkConfidence({
    question,
    answers,
    mark: data,
    tier,
    rubric: tier === "fallback" ? null : markFallback(question, answers).marked,
    rubricConfidence: tier === "fallback" ? rubricConfidence(data.marked) : null,
  });
  return {
    ...envelope,
    data: { ...data, marked: assessment.marked },
    tier,
    withheld,
    assessment,
    /** True only when the cloud was tried with consent and failed — the DLQ may retry it. */
    retryable: tier === "fallback" && cloudAttempted && !cloudBlocked,
  };
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

export async function aiDiagnose(topicIds: string[], mistakes: Mistake[]) {
  const topics = topicIds.map((id) => getTopic(id)).filter((t): t is Topic => Boolean(t));
  // The egress policy sends only category + masked description per mistake.
  // A server-side fallback built from that reduced view is replaced by the
  // on-device fallback, which sees the full mistake records.
  const envelope = await call<DiagnoseResponse>("diagnose", { topicIds, mistakes }, () => diagnoseFallback(topics, mistakes));
  return envelope.source === "ai" ? envelope : { ...envelope, data: diagnoseFallback(topics, mistakes) };
}

export function aiDiagnoseError(input: { prompt: string; point: string; answer: string; awarded: number; maxMarks: number; command?: string | null }) {
  // Post-marking only: caller must have fixed awarded/max via marking first.
  const fallback = () => {
    const local = localClassifyError({ prompt: input.prompt, point: input.point, answer: input.answer, awarded: input.awarded, maxMarks: input.maxMarks, command: input.command ?? null });
    return { category: local.category, confidence: local.confidence, reasons: local.reasons, taxonomyVersion: ERROR_TAXONOMY_VERSION, provenance: "local-fallback", gated: local.confidence < 0.7 };
  };
  return call("diagnose-error", { ...input, answer: maskStudentText(input.answer), prompt: maskStudentText(input.prompt), point: maskStudentText(input.point) }, fallback);
}

export function aiRouteSpec(subjectId: string, text: string) {
  const syncFallback = () => ({ topics: [] as string[], candidates: [] as { specPointId: string; topicId: string; ref: string; text: string }[] });
  return call("route-spec", { subjectId, text: maskStudentText(text) }, syncFallback);
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
