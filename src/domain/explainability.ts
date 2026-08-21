// ---------------------------------------------------------------------------
// Explainability — for marking and recommendations.
// Marking: which points earned/missing/ambiguous, why awarded.
// Recommendations: weakness, evidence, action, expected benefit.
// ---------------------------------------------------------------------------

import type { MarkEvidence } from "./types";
import type { AnswerCorpusRecord } from "./answer-corpus";
import type { Recommendation } from "./types";

export interface MarkPointVerdict {
  point: string;
  status: "clearly-earned" | "missing" | "ambiguous" | "unreported";
  evidence: string | null;
  evidenceStrength: MarkEvidence["evidenceStrength"];
  reason: string;
}

export function explainMark(record: AnswerCorpusRecord, evidence: MarkEvidence[]): MarkPointVerdict[] {
  return evidence.map((e) => {
    let status: MarkPointVerdict["status"];
    if (e.status === "credited") {
      status = e.evidenceStrength === "strong" ? "clearly-earned" : "ambiguous";
    } else if (e.status === "missed") {
      status = e.evidenceStrength === "none" ? "missing" : "ambiguous";
    } else {
      status = "unreported";
    }
    const reason =
      status === "clearly-earned" ? `Awarded: answer covers "${e.point}" with strong evidence`
      : status === "missing" ? `Not awarded: no evidence for "${e.point}"`
      : status === "ambiguous" ? `Ambiguous: partial evidence for "${e.point}" — review needed`
      : `Unreported: no decision for "${e.point}"`;
    return {
      point: e.point,
      status,
      evidence: e.evidence,
      evidenceStrength: e.evidenceStrength,
      reason,
    };
  });
}

export interface RecommendationExplanation2 {
  identifiedWeakness: string;
  supportingEvidence: string[];
  recommendedAction: string;
  expectedBenefit: string;
  confidenceNote: string;
}

export function explainRecommendation(rec: Recommendation): RecommendationExplanation2 {
  const weakness = rec.topicId ? `Weak topic ${rec.topicId} at ${rec.explanation?.lastEvidencePercent ?? "—"}% accuracy` : "General revision";
  const evidence: string[] = [];
  if (rec.explanation?.recoverableMarks != null) evidence.push(`${rec.explanation.recoverableMarks} recoverable marks`);
  if (rec.explanation?.marksPerHour != null) evidence.push(`${rec.explanation.marksPerHour} marks/hour`);
  if (rec.explanation?.daysSinceRetrieval != null) evidence.push(`${rec.explanation.daysSinceRetrieval} days since retrieval`);
  if (rec.explanation?.daysToExam != null) evidence.push(`${rec.explanation.daysToExam} days to exam`);
  if (rec.explanation?.factors) {
    const f = rec.explanation.factors;
    evidence.push(`factors: examGain=${f.examGain}, urgency=${f.urgency.toFixed(2)}, weakness=${f.weakness.toFixed(2)}`);
  }
  if (evidence.length === 0) evidence.push("Limited prior evidence — exploratory recommendation");
  const action =
    rec.activity === "practice" ? "Complete exam-style questions on the weak topic under timed conditions"
    : rec.activity === "flashcards" ? "Review due cards to protect decaying memory"
    : rec.activity === "mistakes" ? "Repair unrepaired mistakes — re-answer until the point is earned reliably"
    : rec.activity === "learn" ? "First-pass learn: read, then immediately self-test"
    : rec.activity === "paper" ? "Sit a full timed past paper"
    : `Do ${rec.activity}`;
  const benefit = rec.explanation?.recoverableMarks != null
    ? `Expected to recover ~${rec.explanation.recoverableMarks} marks in ${rec.minutes} minutes`
    : "Expected benefit estimated from model — measure on next unseen assessment";
  const confidenceNote =
    rec.explanation?.factors.uncertainty != null && rec.explanation.factors.uncertainty > 1.2
      ? "Low confidence — thin evidence; treat as exploratory"
      : "Moderate to high confidence";
  return {
    identifiedWeakness: weakness,
    supportingEvidence: evidence,
    recommendedAction: action,
    expectedBenefit: benefit,
    confidenceNote,
  };
}
