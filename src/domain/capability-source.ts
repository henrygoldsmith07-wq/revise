// ---------------------------------------------------------------------------
// Capability source — derives capability evidence from records Revise already
// keeps. No new capture, no new store tables: the tutor reads the evidence
// the existing engines already persist (recall rows, application rows, FSRS
// retention, far-transfer outcomes).
//
// Explanation has no persisted per-topic record yet, so it stays unknown
// until one exists — unknown is honest, and the diagnostic intake is the
// intended way to fill it.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { ApplicationMasteryRow } from "./application-mastery";
import type { RecallMasteryRow } from "./recall-mastery";
import { hintEvidenceSource } from "./hint-tiers";
import {
  emptyProfile,
  recordAttemptObservations,
  type CapabilityProfile,
  type EvidenceSource,
  type TopicCapabilityMap,
} from "./capability-mastery";
import type { Attempt, Id, Question } from "./types";
import { independentAttempt } from "./learning-evidence";

export interface CapabilitySourceInput {
  recallMastery: RecallMasteryRow[];
  applicationMastery: ApplicationMasteryRow[];
  attempts: Attempt[];
  /** Question bank, for per-attempt capability attribution (kind/AO-aware). */
  questions?: Question[];
  /** Explanations written this session feed the explanation capability. */
  explanations?: Array<{ topicId: Id; score: number }>;
}

/** Attempts with a completed far-transfer retest carry transfer evidence. */
export function transferEvidenceFromAttempts(attempts: Attempt[]): Array<{ topicId: Id; score: number }> {
  const out: Array<{ topicId: Id; score: number }> = [];
  for (const attempt of attempts) {
    const link = attempt.farTransfer;
    if (!link || link.role !== "retest" || !link.outcome || !independentAttempt(attempt) ||
      attempt.questionId !== link.candidateQuestionId || attempt.createdAt.slice(0, 10) < link.scheduledFor) continue;
    const source = attempts.find((a) => a.id === link.sourceAttemptId && a.userId === attempt.userId);
    if (!source || !independentAttempt(source)) continue;
    const topicId = attempt.topicIds[0];
    if (!topicId) continue;
    out.push({ topicId, score: Math.max(0, Math.min(1, attempt.awarded / attempt.max)) });
  }
  return out;
}

/**
 * Build per-topic capability profiles from the store's derived rows. Every
 * topic present gets a full profile; capabilities with no records stay
 * unknown (evidence 0, score null).
 */
export function deriveCapabilityProfiles(input: CapabilitySourceInput): TopicCapabilityMap {
  const profiles: TopicCapabilityMap = {};

  const profileFor = (topicId: Id): CapabilityProfile => (profiles[topicId] ??= emptyProfile());

  for (const row of input.recallMastery) {
    const profile = profileFor(row.topicId);
    if (row.reviews > 0) {
      // Each review is one independent recall observation; the row's mastery
      // is the FSRS-weighted score over them.
      profile.recall = recordAttemptObservations(profile, Array.from({ length: Math.min(row.reviews, 12) }, () => ({
        capability: "recall" as const,
        source: "independent" as const,
        score: row.mastery,
      }))).recall;
      const retention = row.trueRetention ?? row.currentRetention;
      profile.retention = recordAttemptObservations(profile, [{
        capability: "retention",
        source: "independent",
        score: retention,
      }]).retention;
    }
  }

  for (const row of input.applicationMastery) {
    if (row.attempts <= 0) continue;
    const profile = profileFor(row.topicId);
    // Application evidence: one observation per attempted question, scored
    // by the row's mark-weighted accuracy.
    profile.application = recordAttemptObservations(profile, Array.from({ length: Math.min(row.attempts, 12) }, () => ({
      capability: "application",
      source: "independent",
      score: row.accuracy,
    }))).application;
  }

  // Per-attempt explanation observations: extended-kind answers are the only
  // per-attempt explanation signal (application/recall/retention/transfer
  // stay on their existing row derivations, which already weight hint
  // support — adding per-attempt application observations here would
  // double-count the same attempts). Hint support downgrades the source.
  const questionsById = new Map((input.questions ?? []).map((q) => [q.id, q] as const));
  for (const attempt of input.attempts) {
    if (attempt.max <= 0 || attempt.mode === "recall") continue;
    const question = questionsById.get(attempt.questionId);
    if (question?.kind !== "extended") continue;
    const score = Math.max(0, Math.min(1, attempt.awarded / attempt.max));
    const source: EvidenceSource = hintEvidenceSource(attempt.hintTier ?? null);
    for (const topicId of [...new Set(attempt.topicIds)].filter((id) => id)) {
      const profile = profileFor(topicId);
      profile.explanation = recordAttemptObservations(profile, [{ capability: "explanation", source, score }]).explanation;
    }
  }

  // Explanation evidence from free-text explanations (adaptive explanation
  // rung, explanation study mode): already scored against authored idea
  // anchors by the caller, so record the score directly.
  for (const explanation of input.explanations ?? []) {
    const profile = profileFor(explanation.topicId);
    profile.explanation = recordAttemptObservations(profile, [{
      capability: "explanation",
      source: "independent",
      score: Math.max(0, Math.min(1, explanation.score)),
    }]).explanation;
  }

  for (const { topicId, score } of transferEvidenceFromAttempts(input.attempts)) {
    const profile = profileFor(topicId);
    profile.transfer = recordAttemptObservations(profile, [{
      capability: "transfer",
      source: "independent",
      score,
    }]).transfer;
  }

  return profiles;
}
