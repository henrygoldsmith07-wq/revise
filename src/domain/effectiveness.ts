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
import { MIN_PROOF_DELAY_DAYS } from "./proof-of-improvement";
import { independentAttempt, trustedAssessmentAttempt } from "./learning-evidence";
import { INTERVENTION_LABEL } from "./intervention-ranking";
import { ROOT_CAUSE_LABEL, type RootCause } from "./mistake-patterns";
import type { Attempt, Mistake, Question } from "./types";

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

// ---------------------------------------------------------------------------
// Mission-attributed effectiveness. Attempts made inside a mission session
// carry the mission, stage, repair method and target cause, so a chain
// (baseline → supported → different question → delayed) can be rebuilt from
// attempts alone, at the level of the actual method rather than "guided".
// ---------------------------------------------------------------------------


export interface MissionChain {
  missionId: string;
  intervention: string;
  cause: string | null;
  subjectId: string;
  baseline: number | null;
  immediate: number | null;
  differentQuestion: number | null;
  transfer: number | null;
  delayed: number | null;
  delayedMarks: number;
  minutes: number;
  /** Independent different-question success, then an independent verified delayed answer at least the proof delay later. */
  durable: boolean;
  /** Gain on the delayed check over the original baseline, in share of marks. */
  gain: number | null;
}

const DAY = 86_400_000;
const rate = (rows: readonly Attempt[]): number | null => {
  const max = rows.reduce((s, a) => s + a.max, 0);
  return max > 0 ? rows.reduce((s, a) => s + a.awarded, 0) / max : null;
};

export function missionChains(input: { attempts: readonly Attempt[]; mistakes: readonly Mistake[]; questions: readonly Question[] }): MissionChain[] {
  const byMission = new Map<string, Attempt[]>();
  for (const a of input.attempts) if (a.mission) byMission.set(a.mission.missionId, [...(byMission.get(a.mission.missionId) ?? []), a]);
  const attemptById = new Map(input.attempts.map((a) => [a.id, a] as const));
  const qById = new Map(input.questions.map((q) => [q.id, q] as const));
  const out: MissionChain[] = [];
  for (const [missionId, rows] of [...byMission].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const stage = (...s: string[]) => sorted.filter((a) => s.includes(a.mission!.stage));
    const intervention = sorted.find((a) => a.mission!.stage === "repair" && a.mission!.intervention)?.mission!.intervention ??
      sorted.find((a) => a.mission!.intervention)?.mission!.intervention ?? null;
    if (!intervention) continue;
    const ids = new Set(sorted.flatMap((a) => a.mission!.sourceMistakeIds));
    const sourceAttempts = input.mistakes.filter((m) => ids.has(m.id) && m.attemptId).map((m) => attemptById.get(m.attemptId!)).filter((a): a is Attempt => Boolean(a));
    const independent = (a: Attempt) => independentAttempt(a) && trustedAssessmentAttempt(a, qById.get(a.questionId), input.attempts, input.questions);
    const apply = stage("apply").filter(independent);
    const delayed = stage("delayed-proof").filter(independent);
    const transfer = stage("transfer").filter(independent);
    const baseline = rate(sourceAttempts);
    const delayedRate = rate(delayed);
    const firstApply = apply[0]?.createdAt;
    const gapOk = firstApply !== undefined && delayed.some((a) => Date.parse(a.createdAt) - Date.parse(firstApply) >= MIN_PROOF_DELAY_DAYS * DAY);
    const durable = apply.length > 0 && delayed.length > 0 && gapOk && rate(apply) !== null;
    out.push({
      missionId, intervention, cause: sorted[0]!.mission!.targetCause, subjectId: sorted[0]!.subjectId,
      baseline, immediate: rate(stage("repair", "practise", "diagnose")), differentQuestion: rate(apply), transfer: rate(transfer), delayed: delayedRate,
      delayedMarks: delayed.reduce((s, a) => s + a.max, 0),
      minutes: Math.round(sorted.reduce((s, a) => s + a.elapsedMs, 0) / 60_000 * 10) / 10,
      durable, gain: durable && baseline !== null && delayedRate !== null ? delayedRate - baseline : null,
    });
  }
  return out;
}

export interface EffectivenessQuery { kind: RankedKind; cause?: string | null }
export type EvidenceLevel = "learner-cause" | "learner" | "outcome-chains" | "population" | "neutral";
export interface EffectivenessEstimate {
  weight: number;
  level: EvidenceLevel;
  samples: number;
  uncertainty: "none" | "high" | "moderate" | "low";
}

export interface EffectivenessEvidence {
  chains?: readonly MissionChain[];
  /** Coarse outcome-chain report (guided / independent / transfer / retention). */
  report?: readonly EffectivenessRow[];
  /** Population default weight per method, supplied only when one has been measured. */
  population?: Partial<Record<RankedKind, number>>;
}

const clampWeight = (w: number) => Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w));
const weightFrom = (gains: readonly number[]) => {
  const mean = gains.reduce((a, b) => a + b, 0) / gains.length;
  return clampWeight(1 + mean * 1.5 * Math.min(1, gains.length / 10));
};
const uncertaintyFor = (n: number): EffectivenessEstimate["uncertainty"] => (n === 0 ? "none" : n < MIN_CHAINS_FOR_WEIGHT ? "high" : n < 10 ? "moderate" : "low");

/**
 * Learner + cause + method, then learner + method, then coarse outcome chains,
 * then a measured population default, then neutral. Falls through whenever a
 * level has fewer durable chains than MIN_CHAINS_FOR_WEIGHT, so a tiny sample
 * never personalises.
 */
export function estimateEffectiveness(ev: EffectivenessEvidence, q: EffectivenessQuery): EffectivenessEstimate {
  const durable = (ev.chains ?? []).filter((c) => c.durable && c.gain !== null && c.intervention === q.kind);
  const withCause = q.cause ? durable.filter((c) => c.cause === q.cause) : [];
  if (withCause.length >= MIN_CHAINS_FOR_WEIGHT) return { weight: weightFrom(withCause.map((c) => c.gain!)), level: "learner-cause", samples: withCause.length, uncertainty: uncertaintyFor(withCause.length) };
  if (durable.length >= MIN_CHAINS_FOR_WEIGHT) return { weight: weightFrom(durable.map((c) => c.gain!)), level: "learner", samples: durable.length, uncertainty: uncertaintyFor(durable.length) };
  const coarse = ev.report ? rankedWeight(ev.report, q.kind) : 1;
  const coarseRow = ev.report?.find((r) => r.kind === outcomeKindFor(q.kind) && r.reliable);
  if (coarseRow && coarse !== 1) return { weight: coarse, level: "outcome-chains", samples: coarseRow.durableChains, uncertainty: uncertaintyFor(coarseRow.durableChains) };
  const pop = ev.population?.[q.kind];
  if (pop !== undefined) return { weight: clampWeight(pop), level: "population", samples: 0, uncertainty: "high" };
  return { weight: 1, level: "neutral", samples: durable.length, uncertainty: durable.length ? "high" : "none" };
}

/** A comparative claim, only when two methods each have enough durable chains and clearly differ. */
export function effectivenessClaims(chains: readonly MissionChain[]): string[] {
  const claims: string[] = [];
  const causes = [...new Set(chains.filter((c) => c.durable && c.cause).map((c) => c.cause!))].sort();
  for (const cause of causes) {
    const rows = [...new Set(chains.filter((c) => c.cause === cause && c.durable).map((c) => c.intervention))].sort().map((kind) => {
      const gains = chains.filter((c) => c.cause === cause && c.durable && c.intervention === kind && c.gain !== null).map((c) => c.gain!);
      return { kind, n: gains.length, mean: gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length) };
    }).filter((r) => r.n >= MIN_CHAINS_FOR_WEIGHT).sort((a, b) => b.mean - a.mean);
    if (rows.length < 2 || rows[0]!.mean - rows.at(-1)!.mean < 0.15) continue;
    const label = (k: string) => INTERVENTION_LABEL[k as RankedKind] ?? k;
    claims.push(`For ${ROOT_CAUSE_LABEL[cause as RootCause] ?? cause}, you tend to do better after ${label(rows[0]!.kind)} than after ${label(rows.at(-1)!.kind)} (${rows[0]!.n} and ${rows.at(-1)!.n} completed chains).`);
  }
  return claims;
}
