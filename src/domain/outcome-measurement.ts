// ---------------------------------------------------------------------------
// Conservative outcome measurement for revision interventions.
//
// Built from mission-attributed attempts and recorded mistakes only; nothing
// new is stored. One mission chain is one check, because attempts inside a
// chain are correlated. Only delayed (>= MIN_PROOF_DELAY_DAYS after the last
// teaching/practice contact), independent, trusted answers on questions the
// learner had not met in the chain count as proof. Supported or immediate
// success is reported separately and never feeds gains, marks recovered,
// marks per minute or the "works well" statement.
//
// Every share carries a 90% Wilson score interval on the mean per-check
// share. Gains use Newcombe's hybrid-score difference interval against the
// baseline. Results describe association in the learner's own data, never
// causation.
// ---------------------------------------------------------------------------

import { MIN_CHAINS_FOR_WEIGHT } from "./effectiveness";
import { INTERVENTION_LABEL, type InterventionKind as RankedKind } from "./intervention-ranking";
import { independentAttempt, questionFamilies, trustedAssessmentAttempt, trustworthyAttempt } from "./learning-evidence";
import { rootCauseOf } from "./mistake-patterns";
import { MIN_PROOF_DELAY_DAYS } from "./proof-of-improvement";
import type { Attempt, Id, Mistake, Question } from "./types";

/** Independent delayed checks needed before any "works well" claim. */
export const MIN_DELAYED_CHECKS = MIN_CHAINS_FOR_WEIGHT;
/** Two-sided confidence level of every reported band. */
export const BAND_LEVEL = 0.9;
const Z = 1.6448536269514722;
const DAY = 86_400_000;

export type SupportLevel = "unsupported" | "hinted" | "guided";
export type MeasuredKind = string;

export interface Band {
  /** Checks (mission chains) behind the figures. */
  sample: number;
  /** Raw mean; null without a sample. */
  value: number | null;
  /** Wilson centre, pulled toward neutral for small samples. */
  centre: number | null;
  low: number;
  high: number;
  level: typeof BAND_LEVEL;
}

export interface PerMinuteEstimate {
  sample: number;
  value: number | null;
  low: number | null;
  high: number | null;
  level: typeof BAND_LEVEL;
}

export interface RecurrenceMeasure {
  /** Chains with a later independent attempt or a recurrence to observe. */
  observed: number;
  recurred: number;
  /** Share of observed chains where the same cause came back on the same topic. */
  rate: Band;
}

export interface InterventionMeasurement {
  /** Intervention kind, or "all" for the overall row. */
  kind: MeasuredKind;
  chains: number;
  /** Chains with no qualifying delayed independent check yet. */
  awaitingDelayed: number;
  /** Marks lost on the source mistakes before the intervention. */
  baselineMarksLost: number;
  baselineShare: Band;
  /** Chains by the most support used in repair/practise attempts. */
  support: Record<SupportLevel | "unknown", number>;
  /** Descriptive only: trusted but assisted repair/practise answers. */
  supportedImmediate: Band;
  immediateIndependent: Band;
  /** Independent trusted answers on different-question or transfer items. */
  unfamiliar: Band;
  delayedIndependent: Band;
  /** Delayed share minus baseline share, from chains with both. */
  gain: Band;
  recurrence: RecurrenceMeasure;
  minutes: number;
  /** Estimated marks recovered, from delayed independent evidence only. */
  marksRecovered: number | null;
  /** Delayed marks recovered per revision minute; null without delayed evidence. */
  marksPerMinute: PerMinuteEstimate;
}

export interface LearnerOutcomes {
  userId: Id;
  overall: InterventionMeasurement;
  byIntervention: InterventionMeasurement[];
}

export interface OutcomeMeasurement {
  learners: LearnerOutcomes[];
}

export interface OutcomeInput {
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  questions: readonly Question[];
}

// --- statistics -------------------------------------------------------------

interface Interval { centre: number; low: number; high: number }
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function wilson(successes: number, n: number): Interval {
  const p = successes / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { centre, low: clamp(centre - half, 0, 1), high: clamp(centre + half, 0, 1) };
}

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

/** Band on the mean of per-check shares in [0, 1]. */
export function shareBand(shares: readonly number[]): Band {
  const n = shares.length;
  if (!n) return { sample: 0, value: null, centre: null, low: 0, high: 1, level: BAND_LEVEL };
  const bounded = shares.map((s) => clamp(s, 0, 1));
  const w = wilson(sum(bounded), n);
  return { sample: n, value: sum(bounded) / n, centre: w.centre, low: w.low, high: w.high, level: BAND_LEVEL };
}

/** Newcombe hybrid-score band on mean(later) - mean(baseline), paired by check. */
export function gainBand(later: readonly number[], baseline: readonly number[]): Band {
  const n = Math.min(later.length, baseline.length);
  if (!n) return { sample: 0, value: null, centre: null, low: -1, high: 1, level: BAND_LEVEL };
  const d = sum(later.slice(0, n).map((s) => clamp(s, 0, 1))), b = sum(baseline.slice(0, n).map((s) => clamp(s, 0, 1)));
  const p1 = d / n, p2 = b / n;
  const w1 = wilson(d, n), w2 = wilson(b, n);
  const diff = p1 - p2;
  return {
    sample: n, value: diff, centre: w1.centre - w2.centre,
    low: clamp(diff - Math.sqrt((p1 - w1.low) ** 2 + (w2.high - p2) ** 2), -1, 1),
    high: clamp(diff + Math.sqrt((w1.high - p1) ** 2 + (p2 - w2.low) ** 2), -1, 1),
    level: BAND_LEVEL,
  };
}

// --- support ----------------------------------------------------------------

const SUPPORT_RANK: Record<SupportLevel, number> = { unsupported: 0, hinted: 1, guided: 2 };

/** Support used on one attempt, from its recorded hint, repair-teaching and intervention fields. */
export function supportLevelOf(attempt: Attempt): SupportLevel {
  const tiers = [attempt.hintTier, attempt.intervention?.support];
  if (attempt.repairTeachingSeen || attempt.copiedAnswer || tiers.some((t) => t === "scaffold" || t === "worked-solution")) return "guided";
  if (tiers.some((t) => t === "cue" || t === "prompt")) return "hinted";
  return "unsupported";
}

// --- chain extraction -------------------------------------------------------

interface Chain {
  userId: Id;
  missionId: string;
  intervention: string;
  baselineMarksLost: number;
  baseline: number | null;
  support: SupportLevel | null;
  supportedImmediate: number | null;
  immediate: number | null;
  unfamiliar: number | null;
  delayed: number | null;
  recurred: boolean;
  observed: boolean;
  minutes: number;
}

const time = (a: Attempt) => Date.parse(a.createdAt);
const byTime = (a: Attempt, b: Attempt) => time(a) - time(b) || a.id.localeCompare(b.id);
const share = (rows: readonly Attempt[]): number | null => {
  const max = sum(rows.map((a) => a.max));
  return max > 0 ? sum(rows.map((a) => a.awarded)) / max : null;
};
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

function buildChain(missionId: string, rows: readonly Attempt[], input: OutcomeInput, qById: ReadonlyMap<Id, Question>): Chain | null {
  const sorted = rows.filter((a) => Number.isFinite(time(a))).sort(byTime);
  const first = sorted[0];
  if (!first) return null;
  const stage = (...s: string[]) => sorted.filter((a) => s.includes(a.mission!.stage));
  const intervention = stage("repair").find((a) => a.mission!.intervention)?.mission!.intervention ??
    sorted.find((a) => a.mission!.intervention)?.mission!.intervention ?? null;
  if (!intervention) return null;
  const userId = first.userId;

  const sourceIds = new Set(sorted.flatMap((a) => a.mission!.sourceMistakeIds));
  const sources = input.mistakes.filter((m) => sourceIds.has(m.id) && m.userId === userId);
  const sourceById = new Map(sources.map((m) => [m.id, m] as const));
  const baselineMarksLost = sum([...sourceById.values()].map((m) => nonNeg(m.marksLost)));
  const attemptById = new Map(input.attempts.map((a) => [a.id, a] as const));
  const sourceAttempts = [...new Set(sources.flatMap((m) => (m.attemptId ? [m.attemptId] : [])))].sort()
    .flatMap((id) => { const a = attemptById.get(id); return a && trustworthyAttempt(a) ? [a] : []; });
  const baseline = share(sourceAttempts);

  const trusted = (a: Attempt) => independentAttempt(a) && trustedAssessmentAttempt(a, qById.get(a.questionId), input.attempts, input.questions);
  const repair = stage("repair", "practise");
  const known = (ids: Iterable<Id>) => {
    const qs = [...ids].flatMap((id) => { const q = qById.get(id); return q ? [q] : []; });
    return { ids: new Set(ids), families: new Set(qs.flatMap(questionFamilies)) };
  };
  const unseen = (a: Attempt, seen: ReturnType<typeof known>) => {
    const q = qById.get(a.questionId);
    return Boolean(q) && !seen.ids.has(a.questionId) && questionFamilies(q!).every((f) => !seen.families.has(f));
  };
  const sourceQuestionIds = sources.flatMap((m) => (m.questionId ? [m.questionId] : [])).concat(sourceAttempts.map((a) => a.questionId));
  const seenBeforeApply = known([...sourceQuestionIds, ...stage("diagnose", "repair", "practise").map((a) => a.questionId)]);
  const seenBeforeDelayed = known([...sourceQuestionIds, ...stage("diagnose", "repair", "practise", "apply", "transfer").map((a) => a.questionId)]);

  const unfamiliar = stage("apply", "transfer").filter((a) => trusted(a) && unseen(a, seenBeforeApply));
  const exposure = stage("repair", "practise", "apply", "transfer");
  const delayed = stage("delayed-proof").filter((a) => {
    if (!trusted(a) || !unseen(a, seenBeforeDelayed)) return false;
    const contact = Math.max(...exposure.filter((e) => time(e) < time(a)).map(time));
    return Number.isFinite(contact) && time(a) - contact >= MIN_PROOF_DELAY_DAYS * DAY;
  });
  const worst = repair.reduce<SupportLevel | null>((w, a) => {
    const s = supportLevelOf(a);
    return w === null || SUPPORT_RANK[s] > SUPPORT_RANK[w] ? s : w;
  }, null);

  // Recurrence: same cause on the same topic, recorded after the repair ended.
  const repairEnd = Math.max(...(repair.length ? repair : sorted).map(time));
  const missionOwn = new Set(stage("diagnose", "repair", "practise").map((a) => a.id));
  const topics = new Set(sources.map((m) => m.topicId));
  const causes = new Set(first.mission!.targetCause ? [first.mission!.targetCause] : sources.map((m) => rootCauseOf(m)));
  const recurred = causes.size > 0 && input.mistakes.some((m) =>
    m.userId === userId && !sourceIds.has(m.id) && topics.has(m.topicId) && causes.has(rootCauseOf(m)) &&
    Date.parse(m.createdAt) > repairEnd && !(m.attemptId && missionOwn.has(m.attemptId)));
  const later = input.attempts.some((a) =>
    a.userId === userId && !missionOwn.has(a.id) && time(a) > repairEnd && a.topicIds.some((t) => topics.has(t)) && independentAttempt(a));

  return {
    userId, missionId, intervention, baselineMarksLost, baseline, support: worst,
    supportedImmediate: share(repair.filter((a) => trustworthyAttempt(a) && !independentAttempt(a))),
    immediate: share(repair.filter(trusted)),
    unfamiliar: share(unfamiliar),
    delayed: share(delayed),
    recurred, observed: recurred || later,
    minutes: sum(sorted.map((a) => nonNeg(a.elapsedMs))) / 60_000,
  };
}

// --- aggregation ------------------------------------------------------------

const present = (xs: readonly (number | null)[]) => xs.filter((x): x is number => x !== null);

function summarise(kind: MeasuredKind, chains: readonly Chain[]): InterventionMeasurement {
  const delayedChains = chains.filter((c) => c.delayed !== null);
  const gained = delayedChains.filter((c) => c.baseline !== null);
  const support: InterventionMeasurement["support"] = { unsupported: 0, hinted: 0, guided: 0, unknown: 0 };
  for (const c of chains) support[c.support ?? "unknown"]++;

  const lostTotal = sum(gained.map((c) => c.baselineMarksLost));
  const recoveredMarks = gained.map((c) => {
    const gap = 1 - c.baseline!;
    return gap > 0 ? c.baselineMarksLost * clamp((c.delayed! - c.baseline!) / gap, 0, 1) : 0;
  });
  const recovered = gained.length ? sum(recoveredMarks) : null;
  const minutesOnDelayed = sum(gained.map((c) => c.minutes));
  const fraction = lostTotal > 0 && recovered !== null ? wilson(recovered, lostTotal) : null;
  const perMinute = (marks: number) => marks / minutesOnDelayed;
  const observed = chains.filter((c) => c.observed);

  return {
    kind, chains: chains.length, awaitingDelayed: chains.length - delayedChains.length,
    baselineMarksLost: sum(chains.map((c) => c.baselineMarksLost)),
    baselineShare: shareBand(present(chains.map((c) => c.baseline))),
    support,
    supportedImmediate: shareBand(present(chains.map((c) => c.supportedImmediate))),
    immediateIndependent: shareBand(present(chains.map((c) => c.immediate))),
    unfamiliar: shareBand(present(chains.map((c) => c.unfamiliar))),
    delayedIndependent: shareBand(present(delayedChains.map((c) => c.delayed))),
    gain: gainBand(gained.map((c) => c.delayed!), gained.map((c) => c.baseline!)),
    recurrence: { observed: observed.length, recurred: observed.filter((c) => c.recurred).length, rate: shareBand(observed.map((c) => (c.recurred ? 1 : 0))) },
    minutes: Math.round(sum(chains.map((c) => c.minutes)) * 10) / 10,
    marksRecovered: recovered === null ? null : Math.round(recovered * 100) / 100,
    marksPerMinute: recovered !== null && minutesOnDelayed > 0 && fraction
      ? { sample: gained.length, value: perMinute(recovered), low: perMinute(fraction.low * lostTotal), high: perMinute(fraction.high * lostTotal), level: BAND_LEVEL }
      : { sample: gained.length, value: null, low: null, high: null, level: BAND_LEVEL },
  };
}

/**
 * Measure outcomes per learner and intervention kind from mission-attributed
 * attempts. Pure and independent of input order.
 */
export function measureOutcomes(input: OutcomeInput): OutcomeMeasurement {
  const qById = new Map(input.questions.map((q) => [q.id, q] as const));
  const missions = new Map<string, Attempt[]>();
  for (const a of input.attempts) {
    if (!a.mission) continue;
    const key = JSON.stringify([a.userId, a.mission.missionId]);
    missions.set(key, [...(missions.get(key) ?? []), a]);
  }
  const chains = [...missions].sort((x, y) => x[0].localeCompare(y[0]))
    .flatMap(([, rows]) => { const c = buildChain(rows[0]!.mission!.missionId, rows, input, qById); return c ? [c] : []; });
  const byUser = new Map<Id, Chain[]>();
  for (const c of chains) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);
  const learners = [...byUser].sort((x, y) => x[0].localeCompare(y[0])).map(([userId, rows]): LearnerOutcomes => {
    const kinds = [...new Set(rows.map((c) => c.intervention))].sort();
    return {
      userId, overall: summarise("all", rows),
      byIntervention: kinds.map((k) => summarise(k, rows.filter((c) => c.intervention === k))),
    };
  });
  return { learners };
}

// --- learner-facing statements ----------------------------------------------

export type StatementLevel = "works-well" | "early-signs" | "too-early" | "no-clear-gain";
export interface OutcomeStatement { level: StatementLevel; text: string }

const pct = (x: number) => `${Math.round(x * 100)}%`;
const points = (x: number) => `${Math.round(x * 100)} percentage points`;
const labelOf = (kind: MeasuredKind) => (kind === "all" ? "Your revision overall" : INTERVENTION_LABEL[kind as RankedKind] ?? kind);
const checks = (n: number) => `${n} ${n === 1 ? "check" : "checks"}`;

/**
 * "Works well" only with >= MIN_DELAYED_CHECKS independent delayed checks and
 * a gain band entirely above zero. Assisted or immediate success is ignored.
 */
export function statement(m: InterventionMeasurement): OutcomeStatement {
  const label = labelOf(m.kind);
  const n = m.gain.sample;
  if (m.delayedIndependent.sample === 0) {
    return { level: "too-early", text: `Too early to tell for ${label}. No later check on new questions has been completed yet (it needs an unaided check at least ${MIN_PROOF_DELAY_DAYS} days after revising).` };
  }
  if (n < MIN_DELAYED_CHECKS) {
    const shown = m.delayedIndependent.sample;
    return { level: n === 0 ? "too-early" : "early-signs", text: `Too early to tell for ${label}. ${shown} later ${shown === 1 ? "check" : "checks"} completed; ${MIN_DELAYED_CHECKS - shown} more later ${MIN_DELAYED_CHECKS - shown === 1 ? "check" : "checks"} needed before Revise can judge this reliably.` };
  }
  const base = pct(m.baselineShare.value ?? 0), later = pct(m.delayedIndependent.value ?? 0);
  if (m.gain.low > 0) {
    return { level: "works-well", text: `${label} has worked well for you: on ${checks(n)} done unaided on new questions at least ${MIN_PROOF_DELAY_DAYS} days later you scored ${later}, up from ${base} before. We're ${pct(BAND_LEVEL)} sure the real gain is at least ${points(m.gain.low)}. This shows your results improved afterwards, not that it was the cause.` };
  }
  return { level: "no-clear-gain", text: `No clear gain yet for ${label}: ${checks(n)} unaided on new questions at least ${MIN_PROOF_DELAY_DAYS} days later gave ${later} against ${base} before, which is within normal variation.` };
}

export function recurrenceStatement(m: InterventionMeasurement): OutcomeStatement {
  const { observed, recurred } = m.recurrence;
  const label = labelOf(m.kind);
  if (observed < MIN_DELAYED_CHECKS) {
    return { level: observed === 0 ? "too-early" : "early-signs", text: `Too early to tell whether the same mistake comes back after ${label}: only ${checks(observed)} so far.` };
  }
  return { level: "early-signs", text: `After ${label}, the same mistake on the same topic came back in ${recurred} of ${observed} cases (${pct(m.recurrence.rate.low)}-${pct(m.recurrence.rate.high)} allowing for chance).` };
}

export function efficiencyStatement(m: InterventionMeasurement): OutcomeStatement {
  const label = labelOf(m.kind);
  const e = m.marksPerMinute;
  if (e.value === null || e.low === null || e.high === null) {
    return { level: "too-early", text: `We can't say how many marks ${label} earns per minute yet: it needs an unaided check on new questions at least ${MIN_PROOF_DELAY_DAYS} days later.` };
  }
  if (e.sample < MIN_DELAYED_CHECKS) {
    return { level: "early-signs", text: `Early signs only for ${label}: too few delayed checks (${e.sample}) to put a reliable figure on marks per minute.` };
  }
  const per10 = (x: number) => (x * 10).toFixed(1);
  return { level: "early-signs", text: `${label} has recovered about ${per10(e.value)} marks per 10 minutes of revision (${per10(e.low)}-${per10(e.high)} allowing for chance), counting only delayed unaided checks.` };
}
