// Post-marking diagnosis pipeline: question -> marking -> error diagnosis.
// Classifier never overrides marks; it only labels incorrect/partial parts.

import { ERROR_CONFIDENCE_THRESHOLD, ERROR_TAXONOMY_VERSION } from "./error-taxonomy";
import { remediationFor } from "./error-remediation";
import type { ErrorCategory } from "./error-taxonomy";
import type { Attempt, MarkedPart, Mistake, Question, QuestionPart } from "./types";

export interface DiagnosisInput {
  question: Question;
  part: QuestionPart;
  marked: MarkedPart;
  attempt: Attempt;
  mistake: Mistake;
  answer: string;
}

export interface ErrorDiagnosisRecord {
  mistakeId: string;
  attemptId: string;
  questionId: string;
  partId: string;
  awarded: number;
  max: number;
  category: ErrorCategory;
  confidence: number;
  reasons: string[];
  provenance: "classifier-dev" | "local-fallback" | "offline" | "deterministic";
  taxonomyVersion: string;
  remediationKind: string;
  remediationAction: string;
  remediationMinutes: number;
  gated: boolean;
  rawLabel?: string;
  createdAt: string;
}

/** Only incorrect/partial responses enter diagnosis. Full marks skip it. */
export function needsDiagnosis(marked: MarkedPart): boolean {
  return marked.awarded < marked.max;
}

/** Build the classifier input AFTER marking fixed awarded/max. */
export function diagnosisSignal(input: DiagnosisInput): {
  prompt: string; point: string; answer: string; awarded: number; maxMarks: number; command: string | null;
} {
  const cmd = (input.question.stem + " " + input.part.prompt).match(/\b(state|describe|explain|calculate|suggest|compare|evaluate|discuss|justify|deduce|predict|outline|show that)\b/i);
  return {
    prompt: `${input.question.stem}\n${input.part.prompt}`,
    point: input.marked.missedPoints[0] ?? input.part.markScheme[0] ?? "",
    answer: input.answer,
    awarded: input.marked.awarded,
    maxMarks: input.marked.max,
    command: cmd?.[1]?.toLowerCase() ?? null,
  };
}

export function recordDiagnosis(input: DiagnosisInput, verdict: {
  category: ErrorCategory; confidence: number; reasons: string[];
  provenance: ErrorDiagnosisRecord["provenance"]; gated: boolean; rawLabel?: string;
}): ErrorDiagnosisRecord {
  const remediation = remediationFor(verdict.category);
  return {
    mistakeId: input.mistake.id,
    attemptId: input.attempt.id,
    questionId: input.question.id,
    partId: input.part.id,
    awarded: input.marked.awarded,
    max: input.marked.max,
    category: verdict.gated && verdict.confidence < ERROR_CONFIDENCE_THRESHOLD ? "other" : verdict.category,
    confidence: verdict.confidence,
    reasons: verdict.reasons,
    provenance: verdict.provenance,
    taxonomyVersion: ERROR_TAXONOMY_VERSION,
    remediationKind: remediation.kind,
    remediationAction: remediation.action,
    remediationMinutes: remediation.minutes,
    gated: verdict.gated,
    ...(verdict.rawLabel ? { rawLabel: verdict.rawLabel } : {}),
    createdAt: new Date().toISOString(),
  };
}
