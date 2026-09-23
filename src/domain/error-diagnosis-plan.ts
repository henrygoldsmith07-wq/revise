// Attempt-level error diagnosis: marking → per-part diagnosis → intervention.
//
// The mark is an input here, never an output. This module reads the already
// fixed awarded/max, decides *why* each dropped mark was lost, and names the
// intervention that follows. Pure and deterministic, so it runs on the server,
// in the browser, and in tests with identical results.

import { ERROR_CONFIDENCE_THRESHOLD, ERROR_TAXONOMY_VERSION } from "./error-taxonomy";
import { remediationFor } from "./error-remediation";
import { localClassifyError } from "./error-local-classifier";
import type { ErrorCategory } from "./error-taxonomy";
import type { RemediationKind } from "./error-remediation";
import type { ErrorProvenance } from "./error-local-classifier";
import type { MarkedPart, Question, QuestionPart } from "./types";

export interface PartErrorDiagnosis {
  partId: string;
  label: string;
  /** Fixed by marking — carried through untouched. */
  awarded: number;
  max: number;
  category: ErrorCategory;
  confidence: number;
  reasons: string[];
  provenance: ErrorProvenance;
  gated: boolean;
  rawLabel?: string;
  taxonomyVersion: string;
  /** What to do next, mapped from the category. */
  intervention: { kind: RemediationKind; action: string; minutes: number };
}

export interface AttemptErrorDiagnosis {
  parts: PartErrorDiagnosis[];
  /** The single intervention worth doing first, when any part was diagnosed. */
  headline: PartErrorDiagnosis | null;
  /** Total minutes the mapped interventions would take. */
  minutes: number;
  /** True when no part dropped a mark — diagnosis is skipped entirely. */
  clean: boolean;
}

function commandWordIn(question: Question, part: QuestionPart): string | null {
  const match = `${question.stem} ${part.prompt}`.match(
    /\b(state|describe|explain|calculate|suggest|compare|evaluate|discuss|justify|deduce|predict|outline|show that)\b/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Diagnose every part that dropped a mark. Parts with full marks are left out:
 * there is no error to explain, and inventing one would be dishonest.
 */
export function diagnoseAttemptErrors(input: {
  question: Question;
  marked: readonly MarkedPart[];
  answers: Record<string, string>;
  /** Injectable so the async classifier.dev path can supply remote verdicts. */
  classify?: (signal: {
    partId: string;
    prompt: string;
    point: string;
    answer: string;
    awarded: number;
    maxMarks: number;
    command: string | null;
  }) => { category: ErrorCategory; confidence: number; reasons: string[]; provenance: ErrorProvenance; gated: boolean; rawLabel?: string } | null;
}): AttemptErrorDiagnosis {
  const parts: PartErrorDiagnosis[] = [];

  for (const marked of input.marked) {
    if (marked.awarded >= marked.max) continue;
    const part = input.question.parts.find((candidate) => candidate.id === marked.partId);
    if (!part) continue;
    const answer = input.answers[part.id] ?? "";
    const signal = {
      partId: part.id,
      prompt: `${input.question.stem}\n${part.prompt}`,
      point: marked.missedPoints[0] ?? part.markScheme[0] ?? "",
      answer,
      awarded: marked.awarded,
      maxMarks: marked.max,
      command: commandWordIn(input.question, part),
    };
    // A remote verdict is used only when it arrives already gated and
    // confident; anything else falls back to the deterministic local read.
    const remote = input.classify?.(signal) ?? null;
    const verdict = remote ?? { ...localClassifyError(signal), provenance: "local-fallback" as const, gated: false };
    const category = verdict.gated && verdict.confidence < ERROR_CONFIDENCE_THRESHOLD ? "other" : verdict.category;
    const intervention = remediationFor(category);
    parts.push({
      partId: part.id,
      label: part.label || part.id,
      awarded: marked.awarded,
      max: marked.max,
      category,
      confidence: verdict.confidence,
      reasons: verdict.reasons,
      provenance: verdict.provenance,
      gated: verdict.gated,
      ...(verdict.rawLabel ? { rawLabel: verdict.rawLabel } : {}),
      taxonomyVersion: ERROR_TAXONOMY_VERSION,
      intervention: { kind: intervention.kind, action: intervention.action, minutes: intervention.minutes },
    });
  }

  // The headline is the most urgent intervention, not the most confident one:
  // a misconception outranks a slipped unit even at equal confidence.
  const headline = parts.length
    ? [...parts].sort((a, b) =>
        b.confidence - a.confidence ||
        remediationFor(b.category).minutes - remediationFor(a.category).minutes ||
        a.partId.localeCompare(b.partId),
      )[0]!
    : null;

  return {
    parts,
    headline,
    minutes: parts.reduce((sum, entry) => sum + entry.intervention.minutes, 0),
    clean: parts.length === 0,
  };
}

/** True when a diagnosis carries enough confidence to drive remediation. */
export function isActionable(diagnosis: PartErrorDiagnosis): boolean {
  return !diagnosis.gated && diagnosis.confidence >= ERROR_CONFIDENCE_THRESHOLD && diagnosis.category !== "other";
}
