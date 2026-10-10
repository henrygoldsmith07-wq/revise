import { requiresWjecContentReview } from "./physics-content-review";
// ---------------------------------------------------------------------------
// Exam outlook — "based on your current evidence, most likely to score X–Y".
//
// Pure derivation over the store's live predictions: predictions recompute
// whenever evidence lands (every marked answer, every paper), so the outlook
// below is always current — it *is* the update-after-every-assessment rule,
// not a snapshot that can go stale.
//
// The band reuses the same convention the weekly grade log persists:
//   low  = percent − (100 − confidence·100)/2
//   high = percent + (100 − confidence·100)/2
// so what Today shows and what the calibration record believes always agree.
// Confidence is low early (wide band) and tightens as marked answers and
// topic coverage accumulate.
//
// Honesty rule: a subject with zero marked answers has no measured signal, so
// it must never produce a number. The UI gates rows on MIN_OUTLOOK_ATTEMPTS.
// ---------------------------------------------------------------------------

import { isFlagship } from "./flagship";
import type { GradePrediction } from "./grades";
import { authenticPaperEvidence, independentAttempt, trustedAssessmentAttempt, trustworthyAttempt } from "./learning-evidence";
import { localDayOfInstant } from "./local-date";
import { trustedAssessmentContent, verifiedWjecPaperProvenance } from "./physics-content-review";
import type { Attempt, Id, IsoInstant, Question } from "./types";

/** Marked answers needed before a subject may show a score band. */
export const MIN_OUTLOOK_ATTEMPTS = 3;

export interface PercentBand {
  low: number;
  high: number;
}

export function percentBand(prediction: GradePrediction): PercentBand {
  const half = (100 - prediction.confidence * 100) / 2;
  return {
    low: Math.max(0, Math.round(prediction.percent - half)),
    high: Math.min(100, Math.round(prediction.percent + half)),
  };
}

export interface ExamOutlookRow {
  subjectId: Id;
  /** Marked answers recorded for this subject. */
  attempts: number;
  /** Independent (unaided) answers; assisted work cannot strengthen the band alone. */
  independentAttempts: number;
  percent: number;
  grade: string;
  low: number;
  high: number;
  confidence: number;
  /** True when the band is provisional and must be labelled as such. */
  provisional: boolean;
  /**
   * Reference-tier subject: the band is built from questions that are not
   * checked against the exam board's specification. Always provisional, and
   * the UI must call it a practice estimate rather than an exam prediction.
   */
  referenceTier?: boolean;
}

// ---------------------------------------------------------------------------
// Real past-paper runs.
//
// The outlook band is a prediction; the graph's exam node should also carry
// what actually happened when whole papers were sat under the clock. Attempts
// recorded inside one sitting share a paperRunId and are collapsed into a
// single score (sum of awarded vs sum of max), so 30 question attempts from
// one morning become one "78%" — not 30 fragments pretending to be runs.
// Runs without a paperRunId (legacy sittings) collapse per day instead, the
// best available proxy for one sitting. Newest first, because the exam node
// answers "how did the most recent papers go?".
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

export interface PaperRunScore {
  /** Attempt provenance: the run id, or the date for legacy runs without one. */
  runKey: string;
  paperId?: Id;
  satAt: IsoInstant;
  /** Percent scored on the sitting (awarded ÷ max of its scorable attempts). */
  percent: number;
  awarded: number;
  max: number;
  /** Attempt count collapsed into this run. */
  questionCount: number;
}

/** Collapse authenticated paper-mode attempts into real sittings, newest first. */
export function paperRunScores(attempts: Attempt[], questions?: readonly Question[]): PaperRunScore[] {
  const questionList = questions ?? [];
  const questionById = new Map(questionList.map((question) => [question.id, question] as const));
  // For authenticated Physics papers, a score is a whole-sitting outcome.
  // Infer the expected question set from the immutable paper identity carried
  // by each trusted question; a run that only contains a convenient subset
  // must stay out of readiness and calibration evidence.
  const expectedPhysicsQuestionsByPaper = new Map<Id, Set<Id>>();
  for (const question of questionList) {
    if (!requiresWjecContentReview(question.subjectId) || question.source !== "past-paper" ||
      !question.paperId || !verifiedWjecPaperProvenance(question) || !trustedAssessmentContent(question)) continue;
    const ids = expectedPhysicsQuestionsByPaper.get(question.paperId) ?? new Set<Id>();
    ids.add(question.id);
    expectedPhysicsQuestionsByPaper.set(question.paperId, ids);
  }
  const paperAttempts = attempts.filter((a) => {
    if (a.mode !== "paper" || a.max <= 0 || !trustworthyAttempt(a)) return false;
    // A paper run is exam evidence only when answered independently under the
    // clock. Assisted or viewed paper attempts stay as practice; they must not
    // strengthen a timed-paper score as though they were unseen exam runs.
    if (!independentAttempt(a)) return false;
    if (!requiresWjecContentReview(a.subjectId)) return true;
    const question = questionById.get(a.questionId);
    return Boolean(question && authenticPaperEvidence(a, question, attempts, questions ?? []));
  });
  const byRun = new Map<string, Attempt[]>();
  for (const attempt of paperAttempts) {
    const key = attempt.paperRunId ?? localDayOfInstant(attempt.createdAt);
    const list = byRun.get(key) ?? [];
    list.push(attempt);
    byRun.set(key, list);
  }
  const out: PaperRunScore[] = [];
  for (const [runKey, list] of byRun) {
    const first = list[0]!;
    if (requiresWjecContentReview(first.subjectId)) {
      const expected = first.paperId ? expectedPhysicsQuestionsByPaper.get(first.paperId) : undefined;
      const present = new Set(list.map((attempt) => attempt.questionId));
      // No known manifest or an incomplete manifest is not evidence of a
      // complete paper.  This deliberately sacrifices a partial score rather
      // than letting selective human-reviewed rows look like a paper result.
      if (!expected || expected.size === 0 || list.length !== expected.size || present.size !== expected.size ||
        [...expected].some((questionId) => !present.has(questionId))) continue;
    }
    const awarded = list.reduce((a, x) => a + x.awarded, 0);
    const max = list.reduce((a, x) => a + x.max, 0);
    if (max <= 0) continue;
    const newest = list.reduce((a, x) => (x.createdAt > a ? x.createdAt : a), list[0]!.createdAt);
    out.push({
      runKey,
      ...(list[0]!.paperId ? { paperId: list[0]!.paperId } : {}),
      satAt: newest,
      percent: Math.round((awarded / max) * 100),
      awarded,
      max,
      questionCount: list.length,
    });
  }
  return out.sort((a, b) => b.satAt.localeCompare(a.satAt) || a.runKey.localeCompare(b.runKey));
}

/** One row per predicted subject, with measured evidence counted. */
export function outlookRows(predictions: GradePrediction[], attempts: Attempt[], questions: readonly Question[] = []): ExamOutlookRow[] {
  const questionById = new Map(questions.map((question) => [question.id, question] as const));
  const evidenceAttempts = attempts.filter((attempt) => {
    const question = questionById.get(attempt.questionId);
    if (!requiresWjecContentReview(attempt.subjectId)) return attempt.max > 0 && trustworthyAttempt(attempt);
    if (!question || !trustedAssessmentContent(question) || attempt.max <= 0) return false;
    return trustedAssessmentAttempt(attempt, question, attempts, questions);
  });
  return predictions.map((prediction) => {
    const subjectAttempts = evidenceAttempts.filter((a) => a.subjectId === prediction.subjectId);
    const marked = subjectAttempts.length;
    const independent = subjectAttempts.filter(independentAttempt).length;
    const band = percentBand(prediction);
    // Provisional until there is enough independent evidence to trust the
    // centre: assisted work may widen the sample but never confirms the band.
    // Reference-tier evidence is never more than provisional, however much
    // of it there is: volume cannot substitute for checked content.
    const referenceTier = !isFlagship(prediction.subjectId);
    const provisional = referenceTier || prediction.confidence < 0.35 || independent < MIN_OUTLOOK_ATTEMPTS;
    return {
      subjectId: prediction.subjectId,
      attempts: marked,
      independentAttempts: independent,
      percent: prediction.percent,
      grade: prediction.grade,
      low: band.low,
      high: band.high,
      confidence: prediction.confidence,
      provisional,
      referenceTier,
    };
  });
}
