// ---------------------------------------------------------------------------
// Knowledge-tracing validation — offline evaluation metrics
// Evaluate whether: predicted weak skills produce future errors,
// predicted strong skills transfer to unseen questions, prerequisite
// weaknesses explain downstream difficulty, inferred misconceptions recur.
// ---------------------------------------------------------------------------

import type { Attempt, Card, Id, Topic } from "./types";
import { traceTopic, predictCorrect } from "./knowledge-tracing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KTValidationSnapshot {
  topicId: Id;
  pKnown: number;
  predictedCorrect: number;
  cutoff: string;
}

export interface KTFutureOutcome {
  topicId: Id;
  observedAccuracy: number | null;
  futureAttempts: number;
  errorRate: number | null;
}

export interface WeakSkillPredictivePower {
  weakTopicCount: number;
  weakProducesErrorRate: number | null; // share of weak topics where future error > 0.4
  strongTransferRate: number | null; // share of strong topics where future accuracy > 0.6
  weakVsStrongGap: number | null;
}

export interface PrerequisiteExplanation {
  blockedWeakCount: number;
  downstreamErrorWhenPrereqWeak: number | null;
  downstreamErrorWhenPrereqOk: number | null;
  gap: number | null;
  supportsPrerequisiteModel: boolean;
}

export interface MisconceptionRecurrence {
  misconceptionTag: string;
  topicId: Id;
  recurrences: number;
  recurrenceRate: number | null;
  lesson: string;
}

export interface KnowledgeTracingValidationReport {
  snapshots: number;
  outcomesMeasured: number;
  weakSkillPower: WeakSkillPredictivePower;
  prerequisiteExplanation: PrerequisiteExplanation;
  misconceptionRecurrence: MisconceptionRecurrence[];
  overallAccuracy: number | null; // |predicted - observed| averaged
  insufficientData: boolean;
  insufficientReason: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, p = 3): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Build snapshots at cutoff — using only history <= cutoff
// ---------------------------------------------------------------------------

export function buildKTSnapshots(input: {
  topics: Topic[];
  attemptsByTopic: Map<Id, Attempt[]>;
  cardsByTopic: Map<Id, Card[]>;
  cutoff: string;
  now?: Date;
}): KTValidationSnapshot[] {
  const cutoffDate = new Date(input.cutoff);
  return input.topics.map((topic) => {
    const atts = (input.attemptsByTopic.get(topic.id) ?? []).filter((a) => a.createdAt <= input.cutoff);
    const cards = (input.cardsByTopic.get(topic.id) ?? []).filter((c) => c.createdAt <= input.cutoff);
    const trace = traceTopic({ topic, attempts: atts, cards, now: cutoffDate });
    return {
      topicId: topic.id,
      pKnown: trace.pKnown,
      predictedCorrect: predictCorrect(trace.pKnown),
      cutoff: input.cutoff,
    };
  });
}

// ---------------------------------------------------------------------------
// Evaluate future outcomes after cutoff
// ---------------------------------------------------------------------------

export function evaluateKTFuture(input: {
  snapshots: KTValidationSnapshot[];
  attemptsByTopic: Map<Id, Attempt[]>;
}): KTFutureOutcome[] {
  return input.snapshots.map((s) => {
    const future = (input.attemptsByTopic.get(s.topicId) ?? []).filter((a) => a.createdAt > s.cutoff);
    const awarded = future.reduce((sum, a) => sum + a.awarded, 0);
    const available = future.reduce((sum, a) => sum + a.max, 0);
    const acc = available ? awarded / available : null;
    const errorRate = acc != null ? 1 - acc : null;
    return {
      topicId: s.topicId,
      observedAccuracy: acc != null ? round(acc, 3) : null,
      futureAttempts: future.length,
      errorRate: errorRate != null ? round(errorRate, 3) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Weak/strong predictive power
// ---------------------------------------------------------------------------

export function weakSkillPredictivePower(input: {
  snapshots: KTValidationSnapshot[];
  outcomes: KTFutureOutcome[];
  minFutures?: number;
}): WeakSkillPredictivePower {
  const minFutures = input.minFutures ?? 1;
  const paired = input.snapshots.map((s, i) => ({ s, o: input.outcomes[i] })).filter((p) => p.o != null && p.o.futureAttempts >= minFutures && p.o.errorRate != null);
  const weak = paired.filter((p) => p.s.pKnown < 0.45);
  const strong = paired.filter((p) => p.s.pKnown > 0.75);
  const weakProduces = weak.length ? weak.filter((p) => (p.o.errorRate ?? 0) > 0.4).length / weak.length : null;
  const strongTransfers = strong.length ? strong.filter((p) => (p.o.observedAccuracy ?? 0) > 0.6).length / strong.length : null;
  const gap = weakProduces != null && strongTransfers != null ? round(strongTransfers - (1 - weakProduces), 3) : null;
  return {
    weakTopicCount: weak.length,
    weakProducesErrorRate: weakProduces != null ? round(weakProduces, 3) : null,
    strongTransferRate: strongTransfers != null ? round(strongTransfers, 3) : null,
    weakVsStrongGap: gap,
  };
}

// ---------------------------------------------------------------------------
// Prerequisite weakness explanation (simplified — checks co-occurrence)
// ---------------------------------------------------------------------------

export function prerequisiteExplanation(input: {
  snapshots: KTValidationSnapshot[];
  outcomes: KTFutureOutcome[];
  prerequisiteEdges: Array<{ topicId: Id; prerequisiteId: Id }>;
  minFutures?: number;
}): PrerequisiteExplanation {
  const minFutures = input.minFutures ?? 1;
  const map = new Map<string, KTValidationSnapshot>(input.snapshots.map((s) => [s.topicId, s]));
  const outMap = new Map<string, KTFutureOutcome>(input.outcomes.map((o) => [o.topicId, o]));
  let blockedWeak = 0;
  const downstreamErrorsWeak: number[] = [];
  const downstreamErrorsOk: number[] = [];
  for (const e of input.prerequisiteEdges) {
    const downstream = map.get(e.topicId);
    const prereq = map.get(e.prerequisiteId);
    const downstreamOut = outMap.get(e.topicId);
    if (!downstream || !prereq || !downstreamOut) continue;
    if (downstreamOut.futureAttempts < minFutures || downstreamOut.errorRate == null) continue;
    if (downstream.pKnown < 0.5 && prereq.pKnown < 0.45) {
      blockedWeak += 1;
      downstreamErrorsWeak.push(downstreamOut.errorRate);
    } else if (downstream.pKnown < 0.5 && prereq.pKnown >= 0.6) {
      downstreamErrorsOk.push(downstreamOut.errorRate);
    }
  }
  const avgWeak = downstreamErrorsWeak.length ? downstreamErrorsWeak.reduce((a, b) => a + b, 0) / downstreamErrorsWeak.length : null;
  const avgOk = downstreamErrorsOk.length ? downstreamErrorsOk.reduce((a, b) => a + b, 0) / downstreamErrorsOk.length : null;
  const gap = avgWeak != null && avgOk != null ? round(avgWeak - avgOk, 3) : null;
  return {
    blockedWeakCount: blockedWeak,
    downstreamErrorWhenPrereqWeak: avgWeak != null ? round(avgWeak, 3) : null,
    downstreamErrorWhenPrereqOk: avgOk != null ? round(avgOk, 3) : null,
    gap,
    supportsPrerequisiteModel: gap != null ? gap > 0.08 : false,
  };
}

// ---------------------------------------------------------------------------
// Main report
// ---------------------------------------------------------------------------

export function buildKnowledgeTracingValidationReport(input: {
  snapshots: KTValidationSnapshot[];
  outcomes: KTFutureOutcome[];
  prerequisiteEdges?: Array<{ topicId: Id; prerequisiteId: Id }>;
  minFutures?: number;
}): KnowledgeTracingValidationReport {
  // Prerequisite explanation is computed independently of overall sample size,
  // so a small corpus still reports whether prerequisite weakness explains
  // downstream difficulty on the pairs that do exist.
  const prerequisiteExplanationResult = prerequisiteExplanation({
    snapshots: input.snapshots,
    outcomes: input.outcomes,
    prerequisiteEdges: input.prerequisiteEdges ?? [],
    minFutures: input.minFutures,
  });
  const paired = input.snapshots.map((s, i) => ({ s, o: input.outcomes[i] })).filter((p) => p.o != null && p.o.futureAttempts >= (input.minFutures ?? 1) && p.o.observedAccuracy != null);
  if (paired.length < 8) {
    return {
      snapshots: input.snapshots.length,
      outcomesMeasured: paired.length,
      weakSkillPower: { weakTopicCount: 0, weakProducesErrorRate: null, strongTransferRate: null, weakVsStrongGap: null },
      prerequisiteExplanation: prerequisiteExplanationResult,
      misconceptionRecurrence: [],
      overallAccuracy: null,
      insufficientData: true,
      insufficientReason: `Only ${paired.length} measurable KT snapshot→future pairs — need 8+`,
    };
  }
  const overallAccuracy = round(paired.reduce((s, p) => s + Math.abs(p.s.predictedCorrect - (p.o.observedAccuracy ?? 0)), 0) / paired.length, 3);
  const weakSkillPower = weakSkillPredictivePower({ snapshots: input.snapshots, outcomes: input.outcomes, minFutures: input.minFutures });
  return {
    snapshots: input.snapshots.length,
    outcomesMeasured: paired.length,
    weakSkillPower,
    prerequisiteExplanation: prerequisiteExplanationResult,
    misconceptionRecurrence: [], // populated when mistake history is wired
    overallAccuracy,
    insufficientData: false,
    insufficientReason: null,
  };
}
