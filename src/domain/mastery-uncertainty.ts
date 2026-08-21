import type { Attempt, Card, Id, Mistake, ReviewLog, Topic } from "./types";
import { retrievability } from "./scheduling";

// ---------------------------------------------------------------------------
// Mastery uncertainty + empirical difficulty
//
// Mastery is an estimate — we should say how uncertain it is. Two sources:
//  1. Evidence thinness: few cards/attempts → wide interval.
//  2. Evidence spread: conflicting signals (e.g. 100% recall but 20% exam
//     accuracy) → wide interval even when n is large.
//
// Difficulty should be *measured*, not just inherited from the author's
// intrinsicDifficulty. We can estimate it from actual success rates.
//
// Both are pure and additive: no storage, no breaking change to TopicMastery.
// ---------------------------------------------------------------------------

export interface MasteryInterval {
  topicId: Id;
  mastery: number; // point estimate 0–1
  /** Wilson 95% lower bound. */
  lower: number;
  /** Wilson 95% upper bound. */
  upper: number;
  /** Width of the interval (uncertainty). */
  width: number;
  /** Qualitative label. */
  uncertainty: "low" | "medium" | "high";
  /** Evidence count that drove the interval. */
  evidence: number;
  /** Whether we should show \"not enough evidence yet\". */
  needsMoreEvidence: boolean;
}

/** Wilson score interval at z≈1.96 (95%). Conservative for small n. */
function wilsonInterval(successes: number, trials: number): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 1 };
  const z = 1.96;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return {
    lower: Math.max(0, (centre - spread) / denom),
    upper: Math.min(1, (centre + spread) / denom),
  };
}

/** Build a per-topic Wilson interval around an accuracy-like signal. */
export function masteryInterval(input: {
  topicId: Id;
  mastery: number;
  cards: Card[];
  attempts: Attempt[];
  mistakes: Mistake[];
  now?: Date;
}): MasteryInterval {
  const trials = input.cards.length + input.attempts.length * 2;
  // Map mastery 0–1 to pseudo-successes so Wilson can be applied.
  const successes = Math.round(input.mastery * trials);
  const { lower, upper } = wilsonInterval(successes, Math.max(1, trials));
  // Inflate for conflicting signals: low retention despite high mastery → wider.
  const now = input.now ?? new Date();
  const avgRet = input.cards.length ? input.cards.reduce((a, c) => a + retrievability(c, now), 0) / input.cards.length : 0.5;
  const conflict = input.cards.length > 2 ? Math.abs(input.mastery - avgRet) : 0;
  const widthRaw = upper - lower + conflict * 0.15;
  const width = Math.min(1, Math.round(widthRaw * 1000) / 1000);
  const lowerC = Math.max(0, Math.round((lower - conflict * 0.05) * 1000) / 1000);
  const upperC = Math.min(1, Math.round((upper + conflict * 0.05) * 1000) / 1000);
  const uncertainty: MasteryInterval["uncertainty"] = width < 0.2 ? "low" : width < 0.5 ? "medium" : "high";
  return {
    topicId: input.topicId,
    mastery: Math.round(input.mastery * 1000) / 1000,
    lower: lowerC,
    upper: upperC,
    width,
    uncertainty,
    evidence: trials,
    needsMoreEvidence: trials < 8,
  };
}

export function masteryIntervals(input: {
  masteryByTopic: Map<Id, number>;
  cardsByTopic: Map<Id, Card[]>;
  attemptsByTopic: Map<Id, Attempt[]>;
  mistakesByTopic?: Map<Id, Mistake[]>;
  now?: Date;
}): MasteryInterval[] {
  const out: MasteryInterval[] = [];
  for (const [topicId, mastery] of input.masteryByTopic) {
    out.push(
      masteryInterval({
        topicId,
        mastery,
        cards: input.cardsByTopic.get(topicId) ?? [],
        attempts: input.attemptsByTopic.get(topicId) ?? [],
        mistakes: input.mistakesByTopic?.get(topicId) ?? [],
        now: input.now,
      }),
    );
  }
  return out.sort((a, b) => b.width - a.width);
}

// --- Empirical difficulty -----------------------------------------------

export interface EmpiricalDifficulty {
  topicId: Id;
  intrinsicDifficulty: number; // 1–5
  empiricalDifficulty: number; // 1–5, measured
  gap: number; // empirical - intrinsic
  attempts: number;
  cards: number;
  successRate: number | null; // 0–1
  retentionAvg: number | null; // 0–1
  reliable: boolean; // enough data to trust the empirical
  narrative: string;
}

function clamp15(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

/** Derive empirical difficulty from success and retention, gated on sample size. */
export function empiricalDifficultyFor(input: {
  topic: Topic;
  attempts: Attempt[];
  cards: Card[];
  now?: Date;
}): EmpiricalDifficulty {
  const { topic, attempts, cards } = input;
  const now = input.now ?? new Date();
  const successRate =
    attempts.length >= 3
      ? attempts.reduce((a, x) => a + (x.max ? x.awarded / x.max : 0), 0) / attempts.length
      : null;
  const retentionAvg = cards.length >= 3 ? cards.reduce((a, c) => a + retrievability(c, now), 0) / cards.length : null;

  let signal: number | null = null;
  if (successRate != null && retentionAvg != null) signal = successRate * 0.6 + retentionAvg * 0.4;
  else if (successRate != null) signal = successRate;
  else if (retentionAvg != null) signal = retentionAvg;

  const reliable = attempts.length >= 5 || (attempts.length >= 3 && cards.length >= 6);
  let empiricalDifficulty: number = topic.intrinsicDifficulty;
  if (signal != null && reliable) {
    // Map signal 0→1 to difficulty 5→1
    empiricalDifficulty = 5 - signal * 4;
    // Blend with intrinsic so early estimates don't swing wildly
    const weight = Math.min(1, (attempts.length + cards.length / 4) / 12);
    empiricalDifficulty = empiricalDifficulty * weight + topic.intrinsicDifficulty * (1 - weight);
  }
  const ed = clamp15(empiricalDifficulty);
  const gap = ed - topic.intrinsicDifficulty;
  const narrative = !reliable
    ? `Not enough attempts yet to measure — using authored difficulty ${topic.intrinsicDifficulty}/5 for now.`
    : gap === 0
      ? `Measured difficulty matches the author's ${topic.intrinsicDifficulty}/5.`
      : gap > 0
        ? `Harder than expected: measured ${ed}/5 vs authored ${topic.intrinsicDifficulty}/5 — front-load revision here.`
        : `Easier than expected: measured ${ed}/5 vs authored ${topic.intrinsicDifficulty}/5.`;
  return {
    topicId: topic.id,
    intrinsicDifficulty: topic.intrinsicDifficulty,
    empiricalDifficulty: ed,
    gap,
    attempts: attempts.length,
    cards: cards.length,
    successRate: successRate != null ? Math.round(successRate * 1000) / 1000 : null,
    retentionAvg: retentionAvg != null ? Math.round(retentionAvg * 1000) / 1000 : null,
    reliable,
    narrative,
  };
}

export function empiricalDifficulties(input: {
  topics: Topic[];
  attemptsByTopic: Map<Id, Attempt[]>;
  cardsByTopic: Map<Id, Card[]>;
  now?: Date;
}): EmpiricalDifficulty[] {
  return input.topics
    .map((t) =>
      empiricalDifficultyFor({
        topic: t,
        attempts: input.attemptsByTopic.get(t.id) ?? [],
        cards: input.cardsByTopic.get(t.id) ?? [],
        now: input.now,
      }),
    )
    .sort((a, b) => b.gap - a.gap);
}
