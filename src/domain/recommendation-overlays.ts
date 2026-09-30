import type { Recommendation, IsoDate } from "./types";
import type { RecommendInput } from "./recommendation-contract";
import { timedSessionRecommendation } from "./exam-technique";

const TECHNIQUE_PROMOTE = { knowledge: 1.12, answering: 1.1 } as const;
const TECHNIQUE_DEMOTE = { knowledge: 0.88, answering: 0.9 } as const;

export function applyTechniqueSteering(ctx: { out: Recommendation[]; input: RecommendInput; today: IsoDate }): void {
  const { out, input: recInput } = ctx;
  const subjectSplit = recInput.techniqueSplit;
  const topicSplit = recInput.techniqueByTopic;
  if (!subjectSplit) return;

  for (const r of out) {
    // Topic recs steer only on their own topic's losses; subject-wide recs
    // (flashcards, papers, mistake repair) read the subject-level split.
    const report = r.topicId ? topicSplit?.get(r.topicId) : subjectSplit.get(r.subjectId);
    if (!report || !report.reliable) continue;
    if (report.verdict !== "knowledge" && report.verdict !== "answering") continue;
    const leak = report.verdict;

    const promotes =
      leak === "knowledge"
        ? r.activity === "learn" || r.activity === "flashcards" || r.activity === "mistakes"
        : r.activity === "practice" || r.activity === "paper";
    const steer = promotes ? TECHNIQUE_PROMOTE[leak] : TECHNIQUE_DEMOTE[leak];
    r.score *= steer;
    if (r.factors) r.factors.techniqueSteer = steer;
    r.techniqueKnowledgeShare = report.knowledgeShare;

    // An answering leak converts the practice rec into a named timed run —
    // but never overrides the student's own plan (planned sessions keep
    // their reason, the boost already biasing them is enough).
    if (leak === "answering" && r.activity === "practice" && !r.plannedSessionId) {
      const timed = timedSessionRecommendation(report);
      if (timed) {
        r.techniqueQuickMinutes = timed.minutes;
        r.techniqueKnowledgeShare = report.knowledgeShare;
        r.reason = `Timed run: ${timed.questionCount} questions against the clock — answering is the leak here (~${Math.round(
          report.answeringShare * 100,
        )}% of lost marks), not knowledge.`;
      }
    }
  }
}

/** Phase 4 overlays: historical gain, exploration, tie annotation. Separated so rank invariants remain testable. */
export function applyPhase4Overlays(input: { out: Recommendation[]; input: RecommendInput; today: IsoDate }): void {
  const { out, input: recInput } = input;
  const rng = recInput.rng ?? Math.random;
  const totalIssued = recInput.totalRecommendationsIssued ?? 0;
  // Historical gain: override recoverable/examGain for practice recs where we have real mph
  if (recInput.historicalGain && recInput.historicalGain.size > 0) {
    for (const r of out) {
      if (r.activity !== "practice" || !r.topicId) continue;
      const histMph = recInput.historicalGain.get(r.topicId);
      if (histMph == null) continue;
      // Only apply when the topic has not already been tuned via marksPerHour (historical is the override)
      // hist is marks-per-hour; convert back to block gain
      const histRecoverable = histMph * (r.minutes / 60);
      r.explanation!.marksPerHour = Math.round(histMph * 10) / 10;
      r.explanation!.recoverableMarks = Math.round(histRecoverable * 10) / 10;
      r.explanation!.factors.examGain = Math.round(histRecoverable * 10) / 10;
      // Small adaptive nudge toward historically rewarding topics (capped)
      if (histMph > 2) r.score *= 1.04;
      else if (histMph < 0) r.score *= 0.96;
    }
  }
  // Exploration: ε-greedy and UCB bonus for practice/learn (gated by flag so deterministic tests stay deterministic)
  if (recInput.enableExploration) {
    const totalEvidence = out.reduce((a, r) => {
      const row = recInput.mastery.find((m) => m.topicId === r.topicId);
      return a + (row ? row.cardsTotal + row.attempts * 2 : 0);
    }, 0);
    const eps = Math.max(0.04, 0.14 * Math.exp(-totalIssued / 120));
    for (const r of out) {
      if (r.activity !== "practice" && r.activity !== "learn") continue;
      const row = r.topicId ? recInput.mastery.find((m) => m.topicId === r.topicId) : undefined;
      const evidence = row ? row.cardsTotal + row.attempts * 2 : 0;
      const bonus = Math.min(0.9, Math.sqrt(Math.log(Math.max(2, totalEvidence || 8)) / Math.max(1, evidence)) * 0.45);
      const mult = Math.min(1.14, 1 + bonus * 0.22);
      // ε-greedy: with prob ε, give this thin-evidence topic an extra jitter
      if (evidence < 6) {
        if (rng() < eps) r.score *= mult;
        else r.score *= 1 + bonus * 0.08; // small persistent UCB even when not sampled
      }
    }
  }
}
