// ---------------------------------------------------------------------------
// Intervention effectiveness, measured from outcome chains the learner has
// already produced (InterventionOutcomeRecord). Nothing new is stored.
//
// Same-question or same-family repeats are never strong evidence: a chain
// counts as "durable" only when immediate, transfer and delayed answers come
// from three different families (see durableOutcomeScore).
// ---------------------------------------------------------------------------

import { durableOutcomeScore } from "./intervention-calibration";
import type { InterventionKind as RankedKind } from "./intervention-ranking";
import type { InterventionKind, InterventionOutcomeRecord } from "./types";

/** Which recorded outcome type measures each ranked intervention. */
export function outcomeKindFor(kind: RankedKind): InterventionKind | null {
  switch (kind) {
    case "misconception-correction": case "technique-intervention": case "prerequisite-repair": case "mistake-recovery":
    case "supported-question": case "retrieval-set": case "first-pass-lesson": return "guided";
    case "independent-set": case "timed-sprint": case "paper-section": case "full-paper": return "independent";
    case "transfer-set": return "transfer";
    case "delayed-proof-retest": case "spaced-repetition": return "retention";
  }
}

/** Weight for a ranked intervention from the learner's own outcomes; 1 without reliable evidence. */
export function rankedWeight(report: readonly EffectivenessRow[], kind: RankedKind): number {
  const outcome = outcomeKindFor(kind);
  return outcome ? effectivenessWeight(report, outcome) : 1;
}

export const MIN_CHAINS_FOR_WEIGHT = 5;
export const WEIGHT_MIN = 0.6;
export const WEIGHT_MAX = 1.3;
/** A delayed score this far below the immediate one counts as regression. */
const REGRESSION_DROP = 0.25;

export interface EffectivenessRow {
  key: string;
  kind: InterventionKind;
  chains: number;
  /** Chains that meet the durable standard (three different families, trusted, delayed). */
  durableChains: number;
  /** Chains whose transfer or delayed answer repeated an earlier family; excluded from gain. */
  repeatOnly: number;
  minutes: number;
  baseline: number | null;
  immediate: number | null;
  differentQuestion: number | null;
  transfer: number | null;
  delayed: number | null;
  /** Marks gained on delayed checks above baseline; null without durable chains. */
  marksGained: number | null;
  marksPerHour: number | null;
  /** Share of delayed marks retained relative to immediate performance. */
  retained: number | null;
  regressionRate: number | null;
  /** Weight for ranking: 1 means neutral. */
  weight: number;
  reliable: boolean;
}

const score = (row?: { awarded: number; max: number }) => (row && row.max > 0 ? row.awarded / row.max : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (n: number | null, dp = 2) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

export function groupKey(record: InterventionOutcomeRecord, by: "kind" | "capability"): string {
  return by === "kind" ? record.kind : `${record.kind}:${record.capabilityId}`;
}

function row(key: string, records: readonly InterventionOutcomeRecord[]): EffectivenessRow {
  const kind = records[0]!.kind;
  const durable = records.flatMap((r) => {
    const s = durableOutcomeScore(r);
    return s === null || r.priorAccuracy == null ? [] : [{ r, s }];
  });
  const repeatOnly = records.filter((r) => {
    const fams = [r.immediateFamilyId, r.transfer?.familyId, r.delayedRetention?.familyId].filter(Boolean);
    return fams.length > 1 && new Set(fams).size < fams.length;
  }).length;
  const independentDifferent = records.flatMap((r) => (r.transfer?.independent ? [score(r.transfer)!] : []));
  const immediate = records.flatMap((r) => (r.immediate.independent ? [score(r.immediate)!] : []));
  const delayedPairs = records.flatMap((r) => {
    const d = score(r.delayedRetention);
    const i = score(r.immediate);
    return d !== null && i !== null && r.delayedRetention?.independent ? [{ d, i }] : [];
  });
  const minutes = records.reduce((s, r) => s + (r.timeMeasured ? r.actualMinutes : 0), 0);
  const gains = durable.map(({ r, s }) => (s - r.priorAccuracy!) * (r.delayedRetention?.max ?? 0));
  const marksGained = gains.length ? gains.reduce((a, b) => a + b, 0) : null;
  const durableMinutes = durable.reduce((s, { r }) => s + r.actualMinutes, 0);
  const marksPerHour = marksGained !== null && durableMinutes > 0 ? marksGained / (durableMinutes / 60) : null;
  const regressionRate = delayedPairs.length ? delayedPairs.filter((p) => p.i - p.d >= REGRESSION_DROP).length / delayedPairs.length : null;
  const meanGain = mean(durable.map(({ r, s }) => s - r.priorAccuracy!));
  const reliable = durable.length >= MIN_CHAINS_FOR_WEIGHT;
  // Shrink toward neutral: an observed gain of +0.2 maps to the maximum weight.
  const weight = !reliable || meanGain === null ? 1 : Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, 1 + meanGain * 1.5));
  return {
    key, kind, chains: records.length, durableChains: durable.length, repeatOnly, minutes: Math.round(minutes),
    baseline: round(mean(records.flatMap((r) => (r.priorAccuracy == null ? [] : [r.priorAccuracy])))),
    immediate: round(mean(immediate)),
    differentQuestion: round(mean(independentDifferent)),
    transfer: round(mean(records.flatMap((r) => (r.transfer?.independent && r.transfer.trusted ? [score(r.transfer)!] : [])))),
    delayed: round(mean(records.flatMap((r) => (r.delayedRetention?.independent ? [score(r.delayedRetention)!] : [])))),
    marksGained: round(marksGained), marksPerHour: round(marksPerHour), retained: round(mean(delayedPairs.map((p) => (p.i > 0 ? Math.min(1, p.d / p.i) : 1)))),
    regressionRate: round(regressionRate), weight: round(weight)!, reliable,
  };
}

export function effectivenessReport(records: readonly InterventionOutcomeRecord[], by: "kind" | "capability" = "kind"): EffectivenessRow[] {
  const groups = new Map<string, InterventionOutcomeRecord[]>();
  for (const r of records) {
    if (r.activity && r.activity !== "question") continue;
    groups.set(groupKey(r, by), [...(groups.get(groupKey(r, by)) ?? []), r]);
  }
  return [...groups].map(([key, rs]) => row(key, rs)).sort((a, b) => a.key.localeCompare(b.key));
}

/** Ranking multiplier for an intervention type; 1 until there is reliable outcome evidence. */
export function effectivenessWeight(report: readonly EffectivenessRow[], kind: InterventionKind, capabilityKey?: string): number {
  const exact = capabilityKey ? report.find((r) => r.key === capabilityKey && r.reliable) : undefined;
  return (exact ?? report.find((r) => r.key === kind && r.reliable))?.weight ?? 1;
}
