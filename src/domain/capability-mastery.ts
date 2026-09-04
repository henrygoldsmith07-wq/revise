// ---------------------------------------------------------------------------
// Capability mastery — per-capability evidence, separate from topic mastery.
//
// Topic mastery (./mastery) answers "how strong is this topic overall". The
// tutor needs a finer question: *which capability* is weak? A student can have
// strong recall and weak application; the fix for each is a different learning
// experience, and recommending flashcards at a recall-strong/application-weak
// student makes flashcard-only memory worse.
//
// The model tracks five capabilities per topic, each with its own evidence
// count and score. Unknown is its own state: with zero evidence a capability
// is *unknown*, never weak — the tutor diagnoses before it teaches.
//
// Evidence quality is weighted by how the success was earned: an independent
// success is full evidence, a hint-assisted success is weaker, and merely
// viewing an answer barely counts. This is what makes "assisted success is
// weaker evidence" structural rather than a UI claim.
//
// Pure domain: no React, no storage, no network. Deterministic fallback by
// construction — no model calls anywhere.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export const CAPABILITIES = ["recall", "explanation", "application", "transfer", "retention"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  recall: "recall",
  explanation: "explanation",
  application: "application",
  transfer: "transfer",
  retention: "retention",
};

/** How much evidence a success is worth, by how much support it needed. */
export const EVIDENCE_WEIGHT = {
  independent: 1,
  assisted: 0.5,
  viewed: 0.15,
} as const;
export type EvidenceSource = keyof typeof EVIDENCE_WEIGHT;

/** A capability with no evidence at all. Diagnosis must come before teaching. */
export type CapabilityState = "unknown" | "emerging" | "developing" | "secure";

export interface CapabilityEvidence {
  capability: Capability;
  /** Weighted observation count. 0 means unknown, not weak. */
  evidence: number;
  /** Evidence-weighted mean score in [0,1]; null while unknown. */
  score: number | null;
  /** Seconds of working time observed, for pacing decisions. */
  seconds: number;
}

export type CapabilityProfile = Record<Capability, CapabilityEvidence>;

export function emptyProfile(): CapabilityProfile {
  return {
    recall: { capability: "recall", evidence: 0, score: null, seconds: 0 },
    explanation: { capability: "explanation", evidence: 0, score: null, seconds: 0 },
    application: { capability: "application", evidence: 0, score: null, seconds: 0 },
    transfer: { capability: "transfer", evidence: 0, score: null, seconds: 0 },
    retention: { capability: "retention", evidence: 0, score: null, seconds: 0 },
  };
}

/** Minimum weighted evidence before a score is taken at face value. */
export const CAPABILITY_FULL_EVIDENCE = 4;
/** Evidence-weighted score bands. Unknown is deliberately not "weak". */
export const EMERGING_THRESHOLD = 0.6;
export const DEVELOPING_THRESHOLD = 0.7;

export function capabilityState(evidence: CapabilityEvidence): CapabilityState {
  if (evidence.evidence <= 0 || evidence.score === null) return "unknown";
  if (evidence.evidence < 1 || evidence.score < EMERGING_THRESHOLD) return "emerging";
  if (evidence.score < DEVELOPING_THRESHOLD) return "developing";
  return "secure";
}

/**
 * Blend one new observation into a capability's evidence. The update is
 * evidence-weighted (a single observation moves a thin file more than a thick
 * one) and support-weighted (assisted success counts less per observation).
 */
export function recordObservation(
  current: CapabilityEvidence,
  input: { source: EvidenceSource; score: number; seconds?: number },
): CapabilityEvidence {
  const weight = EVIDENCE_WEIGHT[input.source];
  const score = Math.max(0, Math.min(1, input.score));
  const evidence = current.evidence + weight;
  const blended =
    current.score === null ? score : (current.score * current.evidence + score * weight) / evidence;
  return {
    ...current,
    evidence,
    score: blended,
    seconds: current.seconds + Math.max(0, input.seconds ?? 0),
  };
}

/** Observation recorded from one attempt or review, keyed by capability. */
export function recordAttemptObservations(
  profile: CapabilityProfile,
  observations: Array<{ capability: Capability; source: EvidenceSource; score: number; seconds?: number }>,
): CapabilityProfile {
  const next = { ...profile };
  for (const o of observations) {
    next[o.capability] = recordObservation(next[o.capability], o);
  }
  return next;
}

/** True when the capability has never been observed — diagnose, don't assume. */
export function isUnknown(capability: CapabilityEvidence): boolean {
  return capabilityState(capability) === "unknown";
}

/** Capabilities worth working on, weakest first. Unknowns sort last and say so. */
export function developmentNeeds(profile: CapabilityProfile): Array<{
  capability: Capability;
  state: CapabilityState;
  score: number | null;
}> {
  return CAPABILITIES.map((capability) => {
    const e = profile[capability];
    return { capability, state: capabilityState(e), score: e.score };
  }).sort((a, b) => {
    if (a.state === "unknown" && b.state !== "unknown") return 1;
    if (b.state === "unknown" && a.state !== "unknown") return -1;
    return (a.score ?? 0) - (b.score ?? 0);
  });
}

/** The tutor's one-line read, e.g. "recall is strong but application is weak". */
export function capabilitySentence(profile: CapabilityProfile): string | null {
  const needs = developmentNeeds(profile);
  const measurable = needs.filter((n) => n.state !== "unknown");
  if (measurable.length === 0) return null;
  const weakest = measurable[0];
  const strongest = measurable[measurable.length - 1];
  if (strongest.capability === weakest.capability) return null;
  const strongLabel = strongest.score !== null && strongest.score >= DEVELOPING_THRESHOLD ? "strong" : "solid";
  return `Your ${CAPABILITY_LABELS[strongest.capability]} is ${strongLabel} but ${CAPABILITY_LABELS[weakest.capability]} is weak.`;
}

/** The one capability the next session should move: the weakest measured one
 * that is still below developing; when everything measured is healthy, the
 * strongest measured one (it is transfer-ready); only with no evidence at all
 * does the session start by diagnosing. */
export function focusCapability(profile: CapabilityProfile): Capability {
  const needs = developmentNeeds(profile);
  const measurable = needs.filter((n) => n.state !== "unknown");
  const weak = measurable.find((n) => (n.score ?? 0) < DEVELOPING_THRESHOLD);
  if (weak) return weak.capability;
  if (measurable.length) return measurable[measurable.length - 1].capability;
  return CAPABILITIES[0];
}

/** Aggregate one capability across topics — for whole-subject reads. */
export function aggregateCapability(
  profiles: CapabilityProfile[],
  capability: Capability,
): CapabilityEvidence {
  const withData = profiles.map((p) => p[capability]).filter((e) => e.evidence > 0 && e.score !== null);
  if (!withData.length) return { capability, evidence: 0, score: null, seconds: 0 };
  const evidence = withData.reduce((a, e) => a + e.evidence, 0);
  const score = withData.reduce((a, e) => a + (e.score ?? 0) * e.evidence, 0) / evidence;
  return { capability, evidence, score, seconds: withData.reduce((a, e) => a + e.seconds, 0) };
}

/** Map a stored per-topic profile record onto the profile shape. */
export type TopicCapabilityMap = Record<Id, CapabilityProfile>;
