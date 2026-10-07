// ---------------------------------------------------------------------------
// Personal intervention memory — what Revise has learned about which kinds of
// session work for this learner, and the outcome chain behind each one.
//
//   Problem → Intervention → Immediate → Different question → Delayed → Outcome
//
// Composition only. The measurements come from the existing systems:
//   · InterventionOutcomeRecord + durableOutcomeScore  (intervention-calibration)
//   · effectivenessReport / effectivenessClaims          (effectiveness)
//   · mistake patterns                                   (mistake-patterns)
//   · the proof ledger                                   (proof-of-improvement)
//
// Honesty rules carried over unchanged:
//   · a "different question" that repeats the immediate question's family is
//     a repeat, never proof (same rule as durableOutcomeScore);
//   · an observation about a kind of session needs that kind's reliable row
//     (MIN_CHAINS_FOR_WEIGHT durable chains), so a tiny sample never speaks;
//   · nothing here is psychological or sensitive: it is about questions,
//     topics and kinds of session only.
//
// The same evidence already feeds ranking: estimateEffectiveness weights
// mission and adaptive actions in rankRevisionActions. This module is the
// learner-facing half of that loop. Pure domain: no React, no storage.
// ---------------------------------------------------------------------------

import { effectivenessClaims, effectivenessReport, type EffectivenessRow, type MissionChain } from "./effectiveness";
import { durableOutcomeScore } from "./intervention-calibration";
import type { MistakePattern } from "./mistake-patterns";
import { MEANINGFUL_CHANGE, type ProofLedger } from "./proof-of-improvement";
import type { Id, InterventionKind, InterventionOutcomeRecord } from "./types";

/** Plain names for the coarse outcome kinds a record carries. */
export const OUTCOME_KIND_LABEL: Record<InterventionKind, string> = {
  diagnose: "Quick checks",
  guided: "Guided practice with support",
  independent: "Answering on your own",
  transfer: "Questions in a new context",
  retention: "Spaced recall",
};

export type ChainStepStatus = "done" | "missed" | "pending" | "not-counted" | "not-applicable";

export interface ChainStep {
  stage: "problem" | "intervention" | "immediate" | "different" | "delayed" | "outcome";
  label: string;
  status: ChainStepStatus;
  detail: string;
}

export type ChainOutcome = "improved" | "no-clear-change" | "declined" | "held" | "not-held" | "pending";

export interface InterventionChainView {
  id: Id;
  subjectId: Id;
  topicId: Id;
  kind: InterventionKind;
  at: string;
  steps: ChainStep[];
  outcome: ChainOutcome;
  outcomeLabel: string;
}

const pct = (row?: { awarded: number; max: number }) => (row && row.max > 0 ? row.awarded / row.max : null);
const PASS = 0.5;

const OUTCOME_LABEL: Record<ChainOutcome, string> = {
  improved: "Improved, and it held after a delay",
  "no-clear-change": "Checked after a delay: no clear change yet",
  declined: "Checked after a delay: lower than before",
  held: "Held after a delay on new questions",
  "not-held": "Did not hold after a delay",
  pending: "Not proven yet",
};

/** One outcome record as a learner-readable chain. Never upgrades a repeat into proof. */
export function interventionChain(record: InterventionOutcomeRecord, topicTitle: string): InterventionChainView {
  const immediate = pct(record.immediate);
  const transfer = record.transfer;
  const delayed = record.delayedRetention;
  const repeatedFamily = Boolean(transfer?.familyId && record.immediateFamilyId && transfer.familyId === record.immediateFamilyId);
  const delayedRepeat = Boolean(delayed?.familyId && (delayed.familyId === record.immediateFamilyId || delayed.familyId === transfer?.familyId));
  const durable = durableOutcomeScore(record);

  const steps: ChainStep[] = [
    {
      stage: "problem", label: "Starting point", status: "done",
      detail: record.priorAccuracy == null
        ? `${topicTitle}: no measured starting point.`
        : `${topicTitle}: ${record.priorState === "unknown" ? "not measured" : record.priorState} before this.`,
    },
    { stage: "intervention", label: OUTCOME_KIND_LABEL[record.kind], status: "done", detail: record.support === "none" ? "No hints used." : "Support was used, so this counts as weaker evidence." },
    {
      stage: "immediate", label: "Straight after",
      status: immediate === null ? "pending" : immediate >= PASS ? "done" : "missed",
      detail: immediate === null ? "No marked answer." : !record.immediate.independent ? "Answered with help: practice, not proof." : immediate >= PASS ? "Answered without help." : "Marks dropped.",
    },
    {
      stage: "different", label: "A different question",
      status: !transfer ? "pending" : repeatedFamily ? "not-counted" : !transfer.independent ? "not-counted" : (pct(transfer) ?? 0) >= PASS ? "done" : "missed",
      detail: !transfer ? "Still to come." : repeatedFamily ? "Same kind of question again, so it does not count as proof." : !transfer.independent ? "Answered with help, so it does not count as proof." : (pct(transfer) ?? 0) >= PASS ? "Solved without help." : "Marks dropped on the new question.",
    },
    {
      stage: "delayed", label: "After a delay",
      status: !delayed ? "pending" : delayedRepeat || !delayed.independent ? "not-counted" : (pct(delayed) ?? 0) >= PASS ? "done" : "missed",
      detail: !delayed ? "Revise checks again after a few days." : delayedRepeat ? "Repeated a question type already seen, so it does not count." : !delayed.independent ? "Answered with help, so it does not count." : (pct(delayed) ?? 0) >= PASS ? "Still there after the delay." : "Faded after the delay.",
    },
  ];

  let outcome: ChainOutcome = "pending";
  if (durable !== null) {
    if (record.priorAccuracy != null) {
      const change = durable - record.priorAccuracy;
      outcome = change >= MEANINGFUL_CHANGE ? "improved" : change <= -MEANINGFUL_CHANGE ? "declined" : "no-clear-change";
    } else {
      outcome = durable >= PASS ? "held" : "not-held";
    }
  }
  steps.push({ stage: "outcome", label: "Outcome", status: outcome === "pending" ? "pending" : outcome === "declined" || outcome === "not-held" ? "missed" : "done", detail: OUTCOME_LABEL[outcome] });

  return {
    id: record.chainId ?? record.id, subjectId: record.subjectId, topicId: record.topicId, kind: record.kind,
    at: record.updatedAt, steps, outcome, outcomeLabel: OUTCOME_LABEL[outcome],
  };
}

export type MemoryObservationKind = "worked" | "did-not-hold" | "compare" | "keeps-costing" | "does-not-transfer" | "proven" | "repeats-excluded";

export interface MemoryObservation { kind: MemoryObservationKind; text: string }

export interface InterventionMemory {
  observations: MemoryObservation[];
  /** Most recent chains first. */
  recent: InterventionChainView[];
  /** True once any kind of session has enough checked chains to speak for this learner. */
  personalised: boolean;
  /** One sentence for "what Revise knows about how you learn" when nothing is personalised yet. */
  emptyLine: string;
}

export interface InterventionMemoryInput {
  records: readonly InterventionOutcomeRecord[];
  chains?: readonly MissionChain[];
  patterns?: readonly MistakePattern[];
  ledger?: ProofLedger;
  topicTitle: (id: Id) => string;
  /** Restrict to enrolled subjects. */
  subjectIds?: readonly Id[];
  recentLimit?: number;
}

const list = (titles: readonly string[], max = 3) => titles.slice(0, max).join(", ") + (titles.length > max ? ` and ${titles.length - max} more` : "");

export function buildInterventionMemory(input: InterventionMemoryInput): InterventionMemory {
  const enrolled = input.subjectIds ? new Set(input.subjectIds) : null;
  const records = input.records.filter((r) => !enrolled || enrolled.has(r.subjectId));
  const report: EffectivenessRow[] = effectivenessReport(records);
  const observations: MemoryObservation[] = [];

  for (const row of report.filter((r) => r.reliable)) {
    const label = OUTCOME_KIND_LABEL[row.kind];
    if (row.weight > 1.05) observations.push({ kind: "worked", text: `${label} has tended to hold for you after a delay (${row.durableChains} checked sessions).` });
    else if (row.weight < 0.95) observations.push({ kind: "did-not-hold", text: `${label} has not tended to hold for you after a delay (${row.durableChains} checked sessions), so Revise leans on other approaches.` });
    if (row.immediate !== null && row.transfer !== null && row.immediate - row.transfer >= 0.25) {
      observations.push({ kind: "does-not-transfer", text: `After ${label.toLowerCase()}, you do well straight away but less well on a new question. Revise adds new-context questions sooner.` });
    }
  }
  for (const claim of effectivenessClaims((input.chains ?? []).filter((c) => !enrolled || enrolled.has(c.subjectId)))) {
    observations.push({ kind: "compare", text: claim });
  }
  for (const pattern of (input.patterns ?? []).filter((p) => p.recurring && !p.repaired).slice(0, 2)) {
    observations.push({ kind: "keeps-costing", text: pattern.headline });
  }
  const ledgerRows = (input.ledger?.topics ?? []).filter((row) => !enrolled || enrolled.has(row.subjectId));
  const memorised = ledgerRows.filter((row) => row.illusory).map((row) => input.topicTitle(row.topicId));
  if (memorised.length) observations.push({ kind: "does-not-transfer", text: `Strong on questions you have seen but not on new ones: ${list(memorised)}.` });
  const proven = ledgerRows.filter((row) => row.status === "proven-gain" && !row.illusory).map((row) => input.topicTitle(row.topicId));
  if (proven.length) observations.push({ kind: "proven", text: `Improved on new questions after a delay: ${list(proven)}.` });
  const repeats = report.reduce((sum, row) => sum + row.repeatOnly, 0);
  if (repeats > 0) observations.push({ kind: "repeats-excluded", text: `${repeats} check${repeats === 1 ? "" : "s"} repeated a question type you had already seen, so ${repeats === 1 ? "it was" : "they were"} not counted as proof.` });

  const recent = [...records]
    .filter((r) => !r.activity || r.activity === "question")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .slice(0, input.recentLimit ?? 5)
    .map((r) => interventionChain(r, input.topicTitle(r.topicId)));

  const personalised = report.some((r) => r.reliable);
  return {
    observations,
    recent,
    personalised,
    emptyLine: records.length
      ? "Revise is still collecting checks. Once a kind of session has been tested after a delay a few times, it will say what works for you."
      : "Each session you finish is checked again later. Over time this shows which kinds of session actually work for you.",
  };
}
