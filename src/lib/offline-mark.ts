import { getTopic } from "@/domain/curriculum";
import { markQuestion, rubricConfidence, withMarkEvidence } from "@/domain/marking";
import { assessMarkConfidence } from "@/domain/marking-confidence";
import type { MarkedPart, Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Marking on this device when the AI marker cannot even be loaded.
//
// The AI client is a separate chunk (`@/lib/optional-ai` imports it on first
// use). A student whose first marked answer of the day happens offline, or on
// a connection that drops the chunk, used to press Submit and see nothing:
// the import rejected, the submit promise rejected silently and the button
// came back as if never pressed. The deterministic mark-scheme marker is
// already in the main bundle, so it marks the answer here instead, labelled
// exactly as the existing rubric fallback is. Nothing is sent anywhere.
// ---------------------------------------------------------------------------

export const DEVICE_MARK_FOOTER = "_Marked against the mark scheme on this device — no AI was involved._";
export const AI_MARKER_UNAVAILABLE_NOTE = "The AI marker could not be loaded (you may be offline), so this was marked against the mark scheme on this device.";

/** The deterministic mark-scheme mark, with the topic's classic error as a pointer. */
export function deviceRubricMark(question: Question, answers: Record<string, string>): { marked: MarkedPart[]; feedback: string; confidence: number } {
  const result = markQuestion(question, answers);
  const topic = getTopic(question.topicIds[0] ?? "");
  const errorNote = topic?.commonErrors.length ? ` Watch for the classic error on this topic: ${topic.commonErrors[0]}` : "";
  return { marked: result.marked, feedback: `${result.feedback}${errorNote}\n\n${DEVICE_MARK_FOOTER}`, confidence: 1 };
}

/**
 * The same envelope the AI client returns for its rubric-fallback tier, built
 * without the AI client. Not retryable: the cloud was never tried, so nothing
 * is queued for an AI re-mark.
 */
export function aiMarkerUnavailableMark(question: Question, answers: Record<string, string>) {
  const data = withMarkEvidence(question, answers, deviceRubricMark(question, answers));
  const assessment = assessMarkConfidence({
    question, answers, mark: data, tier: "fallback", rubric: null, rubricConfidence: rubricConfidence(data.marked),
  });
  return {
    data: { ...data, marked: assessment.marked },
    source: "fallback" as const,
    provider: null,
    note: AI_MARKER_UNAVAILABLE_NOTE,
    tier: "fallback" as const,
    withheld: null,
    assessment,
    retryable: false,
  };
}
