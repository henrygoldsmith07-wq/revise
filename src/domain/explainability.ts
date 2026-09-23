// ---------------------------------------------------------------------------
// Explainability — for marking and recommendations.
// Marking: which points earned/missing/ambiguous, why awarded.
// Recommendations: weakness, evidence, action, expected benefit.
// ---------------------------------------------------------------------------

import type { MarkEvidence, RecommendationFactors } from "./types";
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

// ---------------------------------------------------------------------------
// Evidence-cited narrative: "Do X because Y", built from computed numbers only.
//
// The factor pills are honest but they read like a dashboard, not a reason. A
// student should be able to see *the claim, the numbers behind it, and the
// action* in one sentence — e.g. "Do exam questions on electrolysis because
// you recalled the definitions (84% recall) but earned 38% of application
// marks, and the topic has not been practised for 12 days." Every clause
// below is guarded: a number that is null is never phrased, so the narrative
// can only contain evidence the engine actually computed.
// ---------------------------------------------------------------------------

export interface NarrativeInput {
  activity: Recommendation["activity"];
  /** Topic title, for practice/learn recs. */
  topicTitle?: string;
  factors: RecommendationFactors;
  lastEvidencePercent: number | null;
  daysSinceRetrieval: number | null;
  daysToExam: number | null;
  recoverableMarks: number | null;
  minutes: number | null;
}

function pluralise(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function buildRecommendationNarrative(input: NarrativeInput): string | null {
  const clauses: string[] = [];
  const action =
    input.activity === "practice" && input.topicTitle
      ? `Do exam questions on ${input.topicTitle}`
      : input.activity === "learn" && input.topicTitle
        ? `Start ${input.topicTitle}`
        : input.activity === "flashcards"
          ? "Clear your due reviews"
          : input.activity === "mistakes"
            ? "Repair your unrepaired mistakes"
            : input.activity === "paper"
              ? "Sit a timed paper"
              : null;
  if (!action) return null;
  const f = input.factors;

  // Recall-vs-application split — the strongest clause when present.
  if (f.applicationGap != null && f.recallMastery != null) {
    clauses.push(
      `you recalled the definitions (${Math.round(f.recallMastery * 100)}% recall) but application marks are much weaker`,
    );
  } else if (input.lastEvidencePercent != null && input.lastEvidencePercent < 55) {
    clauses.push(`your last evidence here is ${input.lastEvidencePercent}%`);
  }

  if (input.daysSinceRetrieval != null && input.daysSinceRetrieval >= 5) {
    clauses.push(
      `it has not been practised for ${input.daysSinceRetrieval} ${pluralise(input.daysSinceRetrieval, "day", "days")}`,
    );
  }

  if (input.daysToExam != null && input.daysToExam <= 21) {
    clauses.push(
      input.daysToExam <= 0
        ? "the exam is now"
        : `the exam is in ${input.daysToExam} ${pluralise(input.daysToExam, "day", "days")}`,
    );
  }

  if (input.recoverableMarks != null && input.recoverableMarks >= 2) {
    clauses.push(
      `about ${Math.round(input.recoverableMarks * 10) / 10} exam marks are recoverable in ~${input.minutes ?? 20} min`,
    );
  }

  if (!clauses.length) return null;
  return `${action} because ${clauses.join(" and ")}.`;
}
