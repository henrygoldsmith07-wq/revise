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

import type { GradePrediction } from "./grades";
import { authenticPaperEvidence, trustedAssessmentAttempt, trustworthyAttempt } from "./learning-evidence";
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
  percent: number;
  grade: string;
  low: number;
  high: number;
  confidence: number;
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
    if (!requiresWjecContentReview(a.subjectId)) return true;
    const question = questionById.get(a.questionId);
    return Boolean(question && authenticPaperEvidence(a, question, attempts, questions ?? []));
  });
  const byRun = new Map<string, Attempt[]>();
  for (const attempt of paperAttempts) {
    const key = attempt.paperRunId ?? attempt.createdAt.slice(0, 10);
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
    const marked = evidenceAttempts.filter((a) => a.subjectId === prediction.subjectId).length;
    const band = percentBand(prediction);
    return {
      subjectId: prediction.subjectId,
      attempts: marked,
      percent: prediction.percent,
      grade: prediction.grade,
      low: band.low,
      high: band.high,
      confidence: prediction.confidence,
    };
  });
}
