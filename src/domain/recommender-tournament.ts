// ---------------------------------------------------------------------------
// Recommender tournament — ten selection policies replayed over historical
// learner trajectories, scored on immediate, medium-term and long-term
// outcomes. The instrument that decides whether anything may replace the
// deterministic Revise heuristic.
//
// Leakage rule (structural, not disciplinary): at every decision point the
// policy context is folded from STRICTLY EARLIER events. Outcome attribution
// reads only the events inside the step that follows. Mutating the future can
// therefore never change the past's recommendations - pinned by tests.
//
// Policies
//   random            uniform over eligible topics (seeded, reproducible)
//   weakest           lowest current mastery estimate
//   exam-weighting    highest paper weight among weak-ish topics
//   most-overdue      deepest overdue FSRS queue
//   lowest-predicted  lowest predicted marks headroom
//   mistake-first     topic of the oldest unresolved mistake
//   fsrs-only         most overdue card, ignoring mastery entirely
//   revise            the shipped heuristic ordering (urgency*weakness*forgetting)
//   bandit            LinUCB contextual bandit over activity/topic features,
//                     trained online from replay-past rewards only
//   learned           logistic ranker fitted on replay-past outcomes
//
// Everything is pure: same trajectories + seed -> identical leaderboard.
// ---------------------------------------------------------------------------

import type { Id, IsoInstant } from "./types";

// --- trajectory model --------------------------------------------------------

/** One recorded unit of studying. Ordered by `at`; nothing after a decision
 *  point may influence the decision made there. */
export interface TrajectoryEvent {
  anonId: string;
  at: IsoInstant;
  topicId: Id;
  /** Question-level detail lets the scorer separate seen from unseen work. */
  questionId: Id;
  awarded: number;
  max: number;
  durationMinutes: number;
  /** Set when this event was a response to an explicit recommendation. */
  followedRecommendation?: boolean;
}

export interface ParticipantTrajectory {
  anonId: string;
  /** Subject id -> exam paper weight (0..1) used by the exam-weighting policy. */
  subjectWeights: Record<string, number>;
  events: TrajectoryEvent[];
  /** Optional held-out final mock: questionId -> {topicId, awarded, max}. */
  finalAssessment?: Array<{ questionId: Id; topicId: Id; awarded: number; max: number }>;
}

// --- policy context (folded from the past only) -------------------------------

export interface TopicState {
  topicId: Id;
  attempts: number;
  accuracy: number; // 0..1, null-equivalent when attempts === 0
  lastStudiedAt: IsoInstant | null;
  minutesInvested: number;
}

export interface PolicyContext {
  anonId: string;
  now: number;
  topics: TopicState[];
  /** Overdue card count per topic from review-log gaps (FSRS-only policy). */
  overdueByTopic: Map<Id, number>;
  /** Oldest unresolved mistake per topic. */
  mistakeByTopic: Map<Id, IsoInstant>;
  subjectWeightOf: (topicId: Id) => number;
  /** Seeded RNG for the random policy - reproducible across runs. */
  random: () => number;
}

export interface PolicyPick {
  topicId: Id;
  reason: string;
  /** Bandit/ranker expose their score for inspection. */
  score?: number;
}

export interface Policy {
  id: string;
  label: string;
  pick(ctx: PolicyContext): PolicyPick | null;
}

function eligibleTopics(ctx: PolicyContext): TopicState[] {
  return ctx.topics.filter((t) => t.attempts > 0 || ctx.overdueByTopic.get(t.topicId));
}

// --- the ten policies ---------------------------------------------------------

export const RANDOM: Policy = {
  id: "random",
  label: "Random",
  pick(ctx) {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    const choice = pool[Math.floor(ctx.random() * pool.length)];
    return { topicId: choice.topicId, reason: "random" };
  },
};

export const WEAKEST: Policy = {
  id: "weakest",
  label: "Weakest topic",
  pick(ctx) {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    const best = [...pool].sort(
      (a, b) => a.accuracy - b.accuracy || String(a.lastStudiedAt ?? "").localeCompare(String(b.lastStudiedAt ?? "")),
    )[0];
    return { topicId: best.topicId, reason: "lowest accuracy" };
  },
};

export const EXAM_WEIGHTING: Policy = {
  id: "exam-weighting",
  label: "Highest exam weighting",
  pick(ctx) {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    let best = pool[0];
    for (const t of pool) if (ctx.subjectWeightOf(t.topicId) > ctx.subjectWeightOf(best.topicId)) best = t;
    return { topicId: best.topicId, reason: "heaviest exam paper" };
  },
};

export const MOST_OVERDUE: Policy = {
  id: "most-overdue",
  label: "Most overdue",
  pick(ctx) {
    let best: TopicState | null = null;
    let bestOverdue = 0;
    for (const t of ctx.topics) {
      const overdue = ctx.overdueByTopic.get(t.topicId) ?? 0;
      if (overdue > bestOverdue) {
        bestOverdue = overdue;
        best = t;
      }
    }
    return best ? { topicId: best.topicId, reason: `${bestOverdue} overdue` } : null;
  },
};

export const LOWEST_PREDICTED: Policy = {
  id: "lowest-predicted",
  label: "Lowest predicted marks",
  pick(ctx) {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    // Predicted headroom proxy: exam weight × (1 − accuracy).
    const best = [...pool].sort(
      (a, b) =>
        ctx.subjectWeightOf(b.topicId) * (1 - b.accuracy) - ctx.subjectWeightOf(a.topicId) * (1 - a.accuracy),
    )[0];
    return { topicId: best.topicId, reason: "largest weighted headroom" };
  },
};

export const MISTAKE_FIRST: Policy = {
  id: "mistake-first",
  label: "Mistake-first",
  pick(ctx) {
    let oldest: IsoInstant | null = null;
    let topicId: Id | null = null;
    for (const [tid, at] of ctx.mistakeByTopic) {
      if (oldest == null || at < oldest) {
        oldest = at;
        topicId = tid;
      }
    }
    return topicId ? { topicId, reason: "unresolved mistake" } : null;
  },
};

export const FSRS_ONLY: Policy = {
  id: "fsrs-only",
  label: "FSRS-only",
  pick(ctx) {
    let best: { topicId: Id; lastStudiedAt: string | null } | null = null;
    for (const t of ctx.topics) {
      const overdue = ctx.overdueByTopic.get(t.topicId) ?? 0;
      if (overdue <= 0) continue;
      if (!best || String(t.lastStudiedAt ?? "") < String(best.lastStudiedAt ?? "")) best = t;
    }
    return best ? { topicId: best.topicId, reason: "stalest FSRS queue" } : null;
  },
};

/**
 * Stand-in for the shipped heuristic ordering: urgency × weakness × forgetting
 * approximated with the folded state (exam proximity is folded into weights by
 * the caller when constructing trajectories).
 */
export const REVISE_HEURISTIC: Policy = {
  id: "revise",
  label: "Revise heuristic",
  pick(ctx) {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    const score = (t: TopicState): number => {
      const daysSince = t.lastStudiedAt ? (ctx.now - new Date(t.lastStudiedAt).getTime()) / 86_400_000 : 30;
      const forgetting = 1 / (1 + Math.max(0, daysSince) / 7);
      const weakness = 1 - t.accuracy;
      const weight = ctx.subjectWeightOf(t.topicId);
      return weight * weakness * (0.5 + forgetting) * (1 + Math.min(2, ctx.overdueByTopic.get(t.topicId) ?? 0) * 0.1);
    };
    const best = [...pool].sort((a, b) => score(b) - score(a))[0];
    return { topicId: best.topicId, reason: "marks-per-minute heuristic", score: score(best) };
  },
};

// --- contextual bandit (LinUCB over topic/activity features) -------------------

const BANDIT_ARMS = ["practice", "review", "mixed"] as const;
type BanditArm = (typeof BANDIT_ARMS)[number];

interface BanditModel {
  /** Per-arm inverse covariance A and reward vector b (LinUCB). */
  A: Record<BanditArm, number[][]>;
  b: Record<BanditArm, number[]>;
  dimension: number;
}

const FEATURE_DIMENSION = 4;

function identityMatrix(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function newBandit(): BanditModel {
  const A = {} as Record<BanditArm, number[][]>;
  const b = {} as Record<BanditArm, number[]>;
  for (const arm of BANDIT_ARMS) {
    A[arm] = identityMatrix(FEATURE_DIMENSION);
    b[arm] = new Array<number>(FEATURE_DIMENSION).fill(0);
  }
  return { A, b, dimension: FEATURE_DIMENSION };
}

function featuresFor(topic: TopicState, ctx: PolicyContext): number[] {
  const daysSince = topic.lastStudiedAt ? Math.max(0, (ctx.now - new Date(topic.lastStudiedAt).getTime()) / 86_400_000) : 30;
  return [
    1,
    topic.accuracy,
    Math.min(3, daysSince / 7),
    ctx.subjectWeightOf(topic.topicId),
  ];
}

function matVec(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((acc, v, i) => acc + v * x[i], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((acc, v, i) => acc + v * b[i], 0);
}

function linUcbScore(model: BanditModel, arm: BanditArm, x: number[], alpha = 0.6): number {
  const theta = solveSymmetric(model.A[arm], model.b[arm]);
  const expected = dot(theta, x);
  const aInvX = solve(model.A[arm], x);
  const bonus = alpha * Math.sqrt(Math.max(0, dot(x, aInvX)));
  return expected + bonus;
}

/** Gaussian elimination with partial pivoting — fine at feature dimension 4. */
function solve(A: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const m = A.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col] || 1e-9;
    for (let r = col + 1; r < n; r++) {
      const factor = m[r][col] / pv;
      for (let cIdx = col; cIdx <= n; cIdx++) m[r][cIdx] -= factor * m[col][cIdx];
    }
  }
  const out = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * out[c];
    out[r] = sum / (m[r][r] || 1e-9);
  }
  return out;
}

function solveSymmetric(A: number[][], b: number[]): number[] {
  return solve(A, b);
}

export class ContextualBanditPolicy implements Policy {
  id = "bandit";
  label = "Contextual bandit";
  private model: BanditModel = newBandit();

  pick(ctx: PolicyContext): PolicyPick | null {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    let bestTopic = pool[0];
    let bestArm: BanditArm = "practice";
    let bestScore = -Infinity;
    for (const topic of pool) {
      const x = featuresFor(topic, ctx);
      for (const arm of BANDIT_ARMS) {
        const score = linUcbScore(this.model, arm, x);
        if (score > bestScore) {
          bestScore = score;
          bestTopic = topic;
          bestArm = arm;
        }
      }
    }
    return { topicId: bestTopic.topicId, reason: `bandit ${bestArm}`, score: bestScore };
  }

  /** Online update from a realised step (reward 0..1). Called with PAST rows only. */
  update(topic: TopicState, ctx: PolicyContext, arm: BanditArm, reward: number): void {
    const x = featuresFor(topic, ctx);
    const A = this.model.A[arm];
    for (let i = 0; i < this.model.dimension; i++) {
      for (let j = 0; j < this.model.dimension; j++) A[i][j] += x[i] * x[j];
    }
    const bb = this.model.b[arm];
    for (let i = 0; i < this.model.dimension; i++) bb[i] += x[i] * reward;
  }

  static armFor(mode: string): BanditArm {
    if (/review|fsrs/i.test(mode)) return "review";
    if (/mixed|paper/i.test(mode)) return "mixed";
    return "practice";
  }
}

/** Logistic ranker fitted on replay-past (features -> completed) outcomes. */
export class LearnedRankingPolicy implements Policy {
  id = "learned";
  label = "Learned ranking";
  weights: number[] = new Array(FEATURE_DIMENSION).fill(0);
  private lr = 0.08;

  private prob(x: number[]): number {
    const z = dot(this.weights, x);
    return 1 / (1 + Math.exp(-z));
  }

  pick(ctx: PolicyContext): PolicyPick | null {
    const pool = eligibleTopics(ctx);
    if (!pool.length) return null;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const topic of pool) {
      const score = this.prob(featuresFor(topic, ctx));
      if (score > bestScore) {
        bestScore = score;
        best = topic;
      }
    }
    return { topicId: best.topicId, reason: "learned completion probability", score: bestScore };
  }

  update(topic: TopicState, ctx: PolicyContext, completed: boolean): void {
    const x = featuresFor(topic, ctx);
    const p = this.prob(x);
    const y = completed ? 1 : 0;
    for (let i = 0; i < this.weights.length; i++) this.weights[i] += this.lr * (y - p) * x[i];
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- replay -------------------------------------------------------------------

export interface PolicyOutcome {
  policyId: string;
  label: string;
  decisionPoints: number;
  completionRate: number | null;
  immediateScore: number | null;
  retention7d: number | null;
  /** Deferred until mistake events join the trajectory schema. */
  mistakeClosureRate?: null;
  unseenMarksPerHour: number | null;
  unseenMarksTotal: number | null;
}

export const TOURNAMENT_POLICIES: Policy[] = [
  RANDOM,
  WEAKEST,
  EXAM_WEIGHTING,
  MOST_OVERDUE,
  LOWEST_PREDICTED,
  MISTAKE_FIRST,
  FSRS_ONLY,
  REVISE_HEURISTIC,
];

export interface TournamentOptions {
  seed?: number;
  minDecisionPoints?: number;
}


export interface TournamentOptions {
  seed?: number;
  /** Replay only the first N events: no-leakage probes slice here so mutations beyond the window cannot touch earlier decisions. */
  maxEvents?: number;
  /** Minimum decision points before a policy's percentages are reported. */
  minDecisionPoints?: number;
}

interface Accum {
  decisionPoints: number;
  completed: number;
  scoreSum: number;
  scoreN: number;
  minutesOnTopic: Map<Id, number>;
  retained7d: number;
  delayedTotal: number;
  hours: number;
  lastEventAt: Map<string, number>;
}

function blankAcc(): Accum {
  return {
    decisionPoints: 0,
    completed: 0,
    scoreSum: 0,
    scoreN: 0,
    minutesOnTopic: new Map(),
    retained7d: 0,
    delayedTotal: 0,
    hours: 0,
    lastEventAt: new Map(),
  };
}

/**
 * Replay every participant's trajectory under each policy. At decision
 * point i the context is folded from events[0..i) ONLY; the realised event
 * at i supplies the outcome. Bandit and learned models train online on
 * replay-past steps in fixed participant order - deterministic and
 * future-free by construction.
 */
export function runTournament(
  participants: ParticipantTrajectory[],
  extraPolicies: Policy[] = [],
  options: TournamentOptions = {},
): PolicyOutcome[] {
  const seed = options.seed ?? 20260822;
  const minSteps = options.minDecisionPoints ?? 20;
  const statics: Policy[] = [...TOURNAMENT_POLICIES, ...extraPolicies];
  const bandit = new ContextualBanditPolicy();
  const learned = new LearnedRankingPolicy();

  interface Runner {
    policy: Policy;
    acc: Accum;
    bandit?: ContextualBanditPolicy;
    learned?: LearnedRankingPolicy;
  }
  const runners: Runner[] = [
    ...statics.map((policy) => ({ policy, acc: blankAcc() })),
    { policy: bandit, acc: blankAcc(), bandit },
    { policy: learned, acc: blankAcc(), learned },
  ];

  for (const participant of participants) {
    const events = [...participant.events].sort((a, b) => a.at.localeCompare(b.at)).slice(0, options.maxEvents ?? Infinity);
    for (const runner of runners) {
      const rng = mulberry32(seed + runner.policy.id.length * 131 + participant.anonId.length);
      const past: TrajectoryEvent[] = [];
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const topics = foldTopics(past);
        const ctx: PolicyContext = {
          anonId: participant.anonId,
          now: new Date(event.at).getTime(),
          topics,
          overdueByTopic: foldOverdue(past),
          mistakeByTopic: foldMistakes(past),
          subjectWeightOf: (topicId) =>
            participant.subjectWeights[topicId.split(".")[0]] ?? participant.subjectWeights[topicId] ?? 0.5,
          random: rng,
        };

        const pick = runner.policy.pick(ctx);
        const went = pick != null && pick.topicId === event.topicId;
        if (pick != null) runner.acc.decisionPoints++;
        if (went) {
          runner.acc.completed++;
          if (event.max > 0) {
            runner.acc.scoreSum += event.awarded / event.max;
            runner.acc.scoreN++;
          }
          runner.acc.minutesOnTopic.set(event.topicId, (runner.acc.minutesOnTopic.get(event.topicId) ?? 0) + event.durationMinutes);
          runner.acc.hours += event.durationMinutes / 60;
        }

        // Online learners update from the realised step (now the past).
        const stateForPick = topics.find((t) => t.topicId === (pick?.topicId ?? event.topicId)) ?? emptyTopic(pick?.topicId ?? event.topicId);
        const reward = went && event.max > 0 ? event.awarded / event.max : 0;
        if (runner.bandit && pick != null) {
          runner.bandit.update(stateForPick, ctx, ContextualBanditPolicy.armFor(went ? "practice" : "skip"), went ? reward : 0);
        }
        if (runner.learned && pick != null) {
          runner.learned.update(stateForPick, ctx, went);
        }

        // Delayed retention bookkeeping: this event becomes past context for
        // the next decision and a recall probe once >=7 days have elapsed.
        const key = `${participant.anonId}:${event.topicId}`;
        const prevAt = runner.acc.lastEventAt.get(key);
        const tMs = new Date(event.at).getTime();
        if (prevAt != null && tMs - prevAt >= 7 * 86_400_000) {
          // Only count when the learner was steered here at least once.
          if ((runner.acc.minutesOnTopic.get(event.topicId) ?? 0) > 0 || went) {
            runner.acc.delayedTotal++;
            if (event.max > 0 && event.awarded / event.max >= 0.5) runner.acc.retained7d++;
          }
        }
        runner.acc.lastEventAt.set(key, tMs);

        past.push(event);
      }
    }
  }

  const outcomes = runners.map((runner) => {
    let unseenMarks = 0;
    let unseenMax = 0;
    for (const participant of participants) {
      if (!participant.finalAssessment) continue;
      for (const item of participant.finalAssessment) {
        const minutes = runner.acc.minutesOnTopic.get(item.topicId) ?? 0;
        if (minutes <= 0) continue;
        unseenMarks += item.awarded * (minutes / 60);
        unseenMax += item.max * (minutes / 60);
      }
    }
    const acc = runner.acc;
    const enough = acc.decisionPoints >= minSteps;
    const rate = (num: number, den: number): number | null => (enough && den ? round(num / den) : null);
    return {
      policyId: runner.policy.id,
      label: runner.policy.label,
      decisionPoints: acc.decisionPoints,
      completionRate: rate(acc.completed, acc.decisionPoints),
      immediateScore: rate(acc.scoreSum, acc.scoreN),
      retention7d: rate(acc.retained7d, acc.delayedTotal),
      mistakeClosureRate: null,
      unseenMarksPerHour: unseenMax > 0 ? round((unseenMarks / unseenMax)) : null,
      unseenMarksTotal: unseenMax > 0 ? round(unseenMarks) : null,
      hoursPractised: round(acc.hours * 100) / 100,
    } as PolicyOutcome & { hoursPractised?: number };
  });

  return outcomes.sort(
    (a, b) => (b.unseenMarksPerHour ?? -1) - (a.unseenMarksPerHour ?? -1) || (b.completionRate ?? 0) - (a.completionRate ?? 0),
  );

  function foldTopics(past: TrajectoryEvent[]): TopicState[] {
    const map = new Map<Id, TopicState>();
    for (const e of past) {
      const row = map.get(e.topicId) ?? { topicId: e.topicId, attempts: 0, accuracy: 0, lastStudiedAt: null as string | null, minutesInvested: 0 };
      row.attempts++;
      row.accuracy = row.attempts > 1 ? (row.accuracy * (row.attempts - 1) + (e.max ? e.awarded / e.max : 0)) / row.attempts : (e.max ? e.awarded / e.max : 0);
      row.lastStudiedAt = e.at;
      row.minutesInvested += e.durationMinutes;
      map.set(e.topicId, row);
    }
    return [...map.values()];
  }

  function foldOverdue(past: TrajectoryEvent[]): Map<Id, number> {
    const overdue = new Map<Id, number>();
    const lastSeen = new Map<Id, number>();
    for (const e of past) {
      const t = new Date(e.at).getTime();
      const prev = lastSeen.get(e.topicId);
      if (prev != null && t - prev > 14 * 86_400_000) overdue.set(e.topicId, (overdue.get(e.topicId) ?? 0) + 1);
      lastSeen.set(e.topicId, t);
    }
    return overdue;
  }

  function foldMistakes(past: TrajectoryEvent[]): Map<Id, IsoInstant> {
    const open = new Map<Id, IsoInstant>();
    for (const e of past) {
      if (e.max > 0 && e.awarded < e.max * 0.5) open.set(e.topicId, e.at);
      else open.delete(e.topicId);
    }
    return open;
  }

  function emptyTopic(topicId: Id): TopicState {
    return { topicId, attempts: 0, accuracy: 0, lastStudiedAt: null, minutesInvested: 0 };
  }

  function round(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
}
