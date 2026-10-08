// ---------------------------------------------------------------------------
// Confidence-aware marking.
//
// An AI mark is an interpretation, not examiner truth. This module turns it
// into a result the learner can trust the right amount:
//
//   AI interpretation        (the model's per-part marks, credited points)
//     → structured evidence  (deterministic per-point evidence from marking.ts)
//     → deterministic checks (tariff, coverage, scheme membership, credit
//                             count, blank answers, rubric agreement)
//     → confidence           (model confidence discounted by failed checks)
//     → result               (corrected parts + "provisional" when not high)
//
// The deterministic path stays authoritative wherever it can be: impossible
// marks (more than the tariff, credit for a blank answer, a missing part) are
// corrected deterministically rather than shown. Everything else the checks
// cannot settle is labelled provisional and can be disputed through the
// existing "flag this mark" and escalation infrastructure — never silently
// presented as definitive.
//
// Pure: no React, no network, no storage.
// ---------------------------------------------------------------------------

import { LOW_CONFIDENCE_MARK_THRESHOLD } from "./mark-escalation";
import { textOverload } from "./text-similarity";
import type {
  MarkAssessmentRecord,
  MarkAuthority,
  MarkConfidenceLevel,
  MarkedPart,
  Question,
} from "./types";

export const MARK_ASSESSMENT_VERSION = "mark-confidence-v1";

/** Model confidence at or above which an AI mark that passes every check is "high". */
export const HIGH_MARK_CONFIDENCE = 0.75;
/** Confidence assumed when a model omits it — low enough to force review. */
export const MISSING_MODEL_CONFIDENCE = 0.3;
/** How closely a credited point must match a scheme point to count as "in the scheme". */
export const SCHEME_MATCH_THRESHOLD = 0.7;

export type MarkCheckId =
  | "part-coverage"
  | "tariff"
  | "blank-answer"
  | "points-in-scheme"
  | "credit-count"
  | "answer-evidence"
  | "rubric-agreement"
  | "model-confidence";

export interface MarkCheck {
  id: MarkCheckId;
  passed: boolean;
  /** Hard failures were corrected deterministically; soft failures only lower confidence. */
  severity: "hard" | "soft";
  /** Plain-English, learner-safe explanation. */
  detail: string;
}

export interface MarkConfidenceAssessment extends MarkAssessmentRecord {
  /** 0–1 confidence the system has in the final mark (not just the model's self-report). */
  score: number;
  /** The parts after deterministic correction. Always use these, not the raw model output. */
  marked: MarkedPart[];
  checks: MarkCheck[];
  /** Short learner-facing label for the result. */
  label: string;
  /** One sentence explaining what the label means and what the learner can do. */
  explanation: string;
}

export type MarkTierInput = "ai" | "cache" | "local" | "fallback" | "mcq";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normaliseConfidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : null;
}

function pointInScheme(point: string, scheme: readonly string[]): boolean {
  const p = point.trim().toLowerCase();
  if (!p) return false;
  return scheme.some((s) => s.trim().toLowerCase() === p || textOverload(point, s) >= SCHEME_MATCH_THRESHOLD);
}

function levelFor(score: number, hardFailures: number, softFailures: number): MarkConfidenceLevel {
  if (hardFailures === 0 && softFailures === 0 && score >= HIGH_MARK_CONFIDENCE) return "high";
  if (hardFailures === 0 && score >= LOW_CONFIDENCE_MARK_THRESHOLD) return "medium";
  return "low";
}

function labelFor(authority: MarkAuthority, level: MarkConfidenceLevel, provisional: boolean): string {
  if (authority === "deterministic") return provisional ? "Provisional mark · weak evidence match" : "Marked against the mark scheme";
  if (!provisional) return "AI-assisted mark · checked against the mark scheme";
  return level === "low" ? "Provisional mark · low confidence" : "Provisional mark · some checks disagreed";
}

function explanationFor(authority: MarkAuthority, provisional: boolean, firstFailure: MarkCheck | undefined): string {
  if (!provisional) {
    return authority === "deterministic"
      ? "Marked on this device against the mark scheme."
      : "An AI marker suggested this mark and it passed every check against the mark scheme on this device.";
  }
  const why = firstFailure ? `${firstFailure.detail} ` : "";
  return `${why}Treat this mark as provisional, not an examiner's decision. If you think it is wrong, use “Flag this mark”.`;
}

/**
 * Deterministic marks (MCQ, rubric fallback) are authoritative. They are only
 * provisional when their own evidence-derived confidence is low — the rubric
 * matched the answer to the scheme only weakly.
 */
export function assessDeterministicMark(input: {
  marked: MarkedPart[];
  /** Evidence-derived rubric confidence (marking.ts `rubricConfidence`), or null for exact marks such as MCQ. */
  rubricConfidence: number | null;
}): MarkConfidenceAssessment {
  const score = input.rubricConfidence == null ? 1 : clamp01(input.rubricConfidence);
  const level: MarkConfidenceLevel = score >= HIGH_MARK_CONFIDENCE ? "high" : score >= LOW_CONFIDENCE_MARK_THRESHOLD ? "medium" : "low";
  const provisional = level === "low";
  const checks: MarkCheck[] = input.rubricConfidence == null
    ? []
    : [{
        id: "answer-evidence",
        passed: !provisional,
        severity: "soft",
        detail: provisional
          ? "The answer only partly matched the mark scheme wording, so the automatic mark may have missed valid credit."
          : "The answer matched the mark scheme wording clearly.",
      }];
  return {
    version: MARK_ASSESSMENT_VERSION,
    level,
    provisional,
    authority: "deterministic",
    failedChecks: checks.filter((c) => !c.passed).map((c) => c.id),
    modelConfidence: null,
    score,
    marked: input.marked,
    checks,
    label: labelFor("deterministic", level, provisional),
    explanation: explanationFor("deterministic", provisional, checks.find((c) => !c.passed)),
  };
}

/**
 * Check a model-produced mark against the question and the deterministic
 * rubric, correct what is impossible, and say how far to trust the rest.
 */
export function assessMarkConfidence(input: {
  question: Pick<Question, "kind" | "parts">;
  answers: Record<string, string>;
  mark: { marked: MarkedPart[]; confidence?: number };
  tier: MarkTierInput;
  /** The deterministic rubric's marks for the same answers, when available. */
  rubric: MarkedPart[] | null;
  /** Evidence-derived rubric confidence, used when the deterministic tier produced the mark. */
  rubricConfidence?: number | null;
}): MarkConfidenceAssessment {
  if (input.tier === "fallback" || input.tier === "mcq" || input.question.kind === "mcq") {
    return assessDeterministicMark({
      marked: input.mark.marked,
      rubricConfidence: input.tier === "mcq" || input.question.kind === "mcq" ? null : input.rubricConfidence ?? null,
    });
  }

  const checks: MarkCheck[] = [];
  const rubricByPart = new Map((input.rubric ?? []).map((m) => [m.partId, m]));
  const byPart = new Map<string, MarkedPart>();
  for (const marked of input.mark.marked) {
    if (!byPart.has(marked.partId)) byPart.set(marked.partId, marked);
  }

  // 1. Coverage: exactly one mark per question part. A missing part falls
  //    back to the deterministic rubric for that part (or zero) — never a
  //    silent gap.
  const missing = input.question.parts.filter((part) => !byPart.has(part.id));
  const extra = input.mark.marked.filter((m) => !input.question.parts.some((p) => p.id === m.partId));
  checks.push({
    id: "part-coverage",
    passed: missing.length === 0 && extra.length === 0,
    severity: "hard",
    detail: missing.length
      ? "The AI marker skipped part of the question, so that part was marked against the mark scheme on this device instead."
      : extra.length
        ? "The AI marker returned marks for parts this question does not have; they were ignored."
        : "Every part of the question was marked.",
  });

  let tariffViolations = 0;
  let blankCredit = 0;
  let outOfScheme = 0;
  let overCounted = 0;
  let unsupported = 0;

  const corrected: MarkedPart[] = input.question.parts.map((part) => {
    const raw = byPart.get(part.id);
    if (!raw) {
      const substitute = rubricByPart.get(part.id);
      return substitute ?? {
        partId: part.id,
        awarded: 0,
        max: part.marks,
        creditedPoints: [],
        missedPoints: [...part.markScheme],
        comment: "Not marked by the AI marker.",
      };
    }
    let awarded = Number.isFinite(raw.awarded) ? raw.awarded : 0;
    // 2. Tariff: the mark can never exceed the part's marks or go negative.
    if (raw.max !== part.marks || awarded < 0 || awarded > part.marks) tariffViolations++;
    awarded = Math.max(0, Math.min(part.marks, awarded));
    // 3. Blank answers earn nothing, whatever a model says.
    const answer = input.answers[part.id] ?? "";
    if (!answer.trim() && awarded > 0) {
      blankCredit++;
      awarded = 0;
    }
    // 4. Credited points must be points from this part's mark scheme.
    const credited = awarded > 0 ? raw.creditedPoints : [];
    outOfScheme += credited.filter((point) => !pointInScheme(point, part.markScheme)).length;
    // 5. With one scheme bullet per mark, a mark needs a credited point.
    if (part.markScheme.length >= part.marks && awarded > credited.length) overCounted++;
    // 6. Structured evidence: credited points with no supporting text in the answer.
    unsupported += (raw.evidence ?? []).filter((e) => e.status === "credited" && e.evidenceStrength === "none").length;
    return { ...raw, awarded, max: part.marks, creditedPoints: credited };
  });

  checks.push({
    id: "tariff",
    passed: tariffViolations === 0,
    severity: "hard",
    detail: tariffViolations
      ? "The AI marker gave a mark outside the marks available, so it was corrected to fit the question."
      : "Marks fit the marks available.",
  });
  checks.push({
    id: "blank-answer",
    passed: blankCredit === 0,
    severity: "hard",
    detail: blankCredit ? "The AI marker gave credit for a blank answer, so that credit was removed." : "No credit was given for blank answers.",
  });
  checks.push({
    id: "points-in-scheme",
    passed: outOfScheme === 0,
    severity: "soft",
    detail: outOfScheme
      ? "The AI marker credited something that is not in the mark scheme."
      : "Every credited point is in the mark scheme.",
  });
  checks.push({
    id: "credit-count",
    passed: overCounted === 0,
    severity: "soft",
    detail: overCounted
      ? "The AI marker awarded more marks than the mark-scheme points it said were present."
      : "Each mark is backed by a credited mark-scheme point.",
  });
  checks.push({
    id: "answer-evidence",
    passed: unsupported === 0,
    severity: "soft",
    detail: unsupported
      ? "Some credit could not be matched to words in your answer on this device."
      : "Credited points match words in your answer.",
  });

  // 7. Agreement with the deterministic rubric over the whole question.
  if (input.rubric) {
    const aiTotal = corrected.reduce((a, m) => a + m.awarded, 0);
    const rubricTotal = input.rubric.reduce((a, m) => a + m.awarded, 0);
    const total = input.question.parts.reduce((a, p) => a + p.marks, 0);
    const tolerance = Math.max(1, Math.round(total * 0.25));
    const agrees = Math.abs(aiTotal - rubricTotal) <= tolerance;
    checks.push({
      id: "rubric-agreement",
      passed: agrees,
      severity: "soft",
      detail: agrees
        ? "The AI mark is close to the mark-scheme check on this device."
        : `The AI mark (${aiTotal}) and the mark-scheme check on this device (${rubricTotal}) disagree.`,
    });
  }

  // 8. The model's own confidence, which must be present.
  const modelConfidence = normaliseConfidence(input.mark.confidence);
  checks.push({
    id: "model-confidence",
    passed: modelConfidence !== null && modelConfidence >= LOW_CONFIDENCE_MARK_THRESHOLD,
    severity: "soft",
    detail: modelConfidence === null
      ? "The AI marker did not say how confident it was."
      : modelConfidence >= LOW_CONFIDENCE_MARK_THRESHOLD
        ? "The AI marker was reasonably confident."
        : "The AI marker was not confident in this mark.",
  });

  const failed = checks.filter((c) => !c.passed);
  const hard = failed.filter((c) => c.severity === "hard").length;
  const soft = failed.filter((c) => c.severity === "soft").length;
  let score = modelConfidence ?? MISSING_MODEL_CONFIDENCE;
  score *= 0.75 ** soft;
  if (hard) score = Math.min(score, 0.4);
  score = Math.round(clamp01(score) * 100) / 100;
  const level = levelFor(score, hard, soft);
  const provisional = level !== "high";
  const authority: MarkAuthority = provisional ? "ai-provisional" : "ai-checked";
  return {
    version: MARK_ASSESSMENT_VERSION,
    level,
    provisional,
    authority,
    failedChecks: failed.map((c) => c.id),
    modelConfidence,
    score,
    marked: corrected,
    checks,
    label: labelFor(authority, level, provisional),
    explanation: explanationFor(authority, provisional, failed[0]),
  };
}

/** The durable subset stored on the attempt. */
export function markAssessmentRecord(assessment: MarkConfidenceAssessment): MarkAssessmentRecord {
  return {
    version: assessment.version,
    level: assessment.level,
    provisional: assessment.provisional,
    authority: assessment.authority,
    failedChecks: [...assessment.failedChecks],
    modelConfidence: assessment.modelConfidence,
  };
}

/** Learner-facing label for a stored record (e.g. a reloaded attempt). */
export function markAssessmentLabel(record: MarkAssessmentRecord): string {
  return labelFor(record.authority, record.level, record.provisional);
}
