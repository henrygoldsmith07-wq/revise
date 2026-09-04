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
import {
  emptyProfile,
  recordAttemptObservations,
  type CapabilityProfile,
  type TopicCapabilityMap,
} from "./capability-mastery";
import type { Attempt, Id } from "./types";

export interface CapabilitySourceInput {
  recallMastery: RecallMasteryRow[];
  applicationMastery: ApplicationMasteryRow[];
  attempts: Attempt[];
}

/** Attempts with a completed far-transfer retest carry transfer evidence. */
export function transferEvidenceFromAttempts(attempts: Attempt[]): Array<{ topicId: Id; score: number }> {
  const out: Array<{ topicId: Id; score: number }> = [];
  for (const attempt of attempts) {
    const link = attempt.farTransfer;
    if (!link || link.role !== "source" || !link.outcome) continue;
    const topicId = attempt.topicIds[0];
    if (!topicId) continue;
    out.push({ topicId, score: Math.max(0, Math.min(1, link.outcome.percentage / 100)) });
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
