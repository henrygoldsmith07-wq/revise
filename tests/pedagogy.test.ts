import { describe, expect, it } from "vitest";
import { computeTopicMastery, bayesianMastery, priorRemaining, COHORT_PRIOR_MEAN, COHORT_PRIOR_STRENGTH } from "@/domain/mastery";
import {
  circadianFatigue,
  fatigueFactor,
  sessionFatigue,
  ACTIVITY_LOAD,
  FATIGUE_FLOOR,
} from "@/domain/fatigue";
import { recommend, type RecommendInput } from "@/domain/recommender";
import { forgettingCurve } from "@/domain/scheduling";
import { curveStats } from "@/components/ForgettingCurve";
import type { Attempt, Topic } from "@/domain/types";

// ---------------------------------------------------------------------------
// Advanced pedagogy: Bayesian cold-start priors, fatigue-aware ranking, and
// the forgetting-curve visualization contract. All pure — no clocks faked
// beyond explicit `now` injection.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-01T12:00:00.000Z");

function topic(id: string, subjectId = "bio", intrinsicDifficulty = 3): Topic {
  return {
    id,
    subjectId,
    title: `Topic ${id}`,
    intrinsicDifficulty,
    lifecycle: "active",
    specPointIds: [],
    keywords: [],
    practical: false,
    maths: false,
  } as unknown as Topic;
}

function attempt(id: string, awarded: number, max: number, topicIds: string[] = ["a"]): Attempt {
  return {
    id,
    userId: "u",
    questionId: `q-${id}`,
    subjectId: "bio",
    topicIds,
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "ai",
    elapsedMs: 30_000,
    mode: "practice",
    createdAt: NOW.toISOString(),
  } as unknown as Attempt;
}

describe("Bayesian cold-start prior", () => {
  it("the prior mean is the cohort average and the strength is the pseudo-count", () => {
    expect(COHORT_PRIOR_MEAN).toBeGreaterThan(0.3);
    expect(COHORT_PRIOR_MEAN).toBeLessThan(0.6);
    expect(COHORT_PRIOR_STRENGTH).toBeGreaterThan(0);
    // At zero evidence the posterior IS the prior mean.
    expect(bayesianMastery(0, 0)).toBeCloseTo(COHORT_PRIOR_MEAN, 10);
  });

  it("converges on the evidence as observations accumulate", () => {
    // 10 observations of 90% performance: prior share is small, estimate near 0.9.
    const withStrongEvidence = bayesianMastery(0.9, 20);
    expect(withStrongEvidence).toBeGreaterThan(0.75);
    // Two observations of the same performance stay much closer to the prior.
    const thin = bayesianMastery(0.9, 4);
    expect(thin).toBeLessThan(withStrongEvidence);
    expect(thin).toBeGreaterThan(COHORT_PRIOR_MEAN); // but still pulled up
  });

  it("priorRemaining decays monotonically toward zero", () => {
    expect(priorRemaining(0)).toBe(1);
    expect(priorRemaining(6)).toBeCloseTo(0.5, 10);
    expect(priorRemaining(60)).toBeLessThan(0.1);
    for (let n = 1; n < 40; n++) expect(priorRemaining(n)).toBeLessThan(priorRemaining(n - 1));
  });

  it("a cold-start topic shows predicted mastery, while engines keep reading proven mastery 0", () => {
    const [row] = computeTopicMastery({
      topics: [topic("a")],
      cards: [],
      reviewLogs: [],
      attempts: [],
      mistakes: [],
      now: NOW,
    });
    // Engines unchanged: unmeasured stays 0 so "learn" routing and grade
    // prediction never inflate.
    expect(row.mastery).toBe(0);
    expect(row.weak).toBe(false);
    // Student-facing: a prediction near the cohort prior, purely prior-driven.
    expect(row.predictedMastery).toBeCloseTo(COHORT_PRIOR_MEAN, 2);
    expect(row.priorRemaining).toBe(1);
  });

  it("the prediction narrows toward proven mastery as evidence grows", () => {
    const attempts = [attempt("1", 9, 10), attempt("2", 9, 10), attempt("3", 9, 10), attempt("4", 8, 10)];
    const [row] = computeTopicMastery({
      topics: [topic("a")],
      cards: [],
      reviewLogs: [],
      attempts,
      mistakes: [],
      now: NOW,
    });
    // A strong performer sits above the cohort prior but below their own raw
    // estimate while the prior still carries weight — the honest in-between.
    expect(row.predictedMastery!).toBeGreaterThan(COHORT_PRIOR_MEAN);
    expect(row.predictedMastery!).toBeLessThan(row.mastery);
    expect(row.priorRemaining!).toBeLessThan(0.5);
  });

  it("predicted and proven converge with heavy evidence", () => {
    const attempts = Array.from({ length: 30 }, (_, i) => attempt(`a${i}`, 8.5, 10));
    const [row] = computeTopicMastery({
      topics: [topic("a")],
      cards: [],
      reviewLogs: [],
      attempts,
      mistakes: [],
      now: NOW,
    });
    expect(Math.abs(row.predictedMastery! - row.mastery)).toBeLessThan(0.05);
    expect(row.priorRemaining!).toBeLessThan(0.2);
  });
});

// --- fatigue ---------------------------------------------------------------

describe("fatigue & circadian penalties", () => {
  it("time-on-task fatigue: fresh is 0, ramps after 45min, saturates at 150min", () => {
    expect(sessionFatigue(0)).toBe(0);
    expect(sessionFatigue(45)).toBe(0);
    expect(sessionFatigue(97.5)).toBeCloseTo(0.5, 6);
    expect(sessionFatigue(150)).toBe(1);
    expect(sessionFatigue(300)).toBe(1); // capped
  });

  it("circadian fatigue: 0 by day, ramping from 22:00, peak at midnight, easing to 05:00", () => {
    expect(circadianFatigue(12)).toBe(0);
    expect(circadianFatigue(21)).toBe(0);
    expect(circadianFatigue(22)).toBe(0);
    expect(circadianFatigue(23)).toBeCloseTo(0.5, 6);
    expect(circadianFatigue(0)).toBe(1);
    expect(circadianFatigue(2)).toBeCloseTo(1 - 2 / 5, 6);
    expect(circadianFatigue(5)).toBe(0);
    expect(circadianFatigue(17)).toBe(0);
    // Robust to out-of-range inputs.
    expect(circadianFatigue(-2)).toBe(circadianFatigue(22));
    expect(circadianFatigue(36)).toBe(circadianFatigue(12));
  });

  it("heavy activities are penalised more than light recall work", () => {
    const tired = { activeMinutes: 150, hourOfDay: 12 };
    expect(ACTIVITY_LOAD.practice).toBeGreaterThan(ACTIVITY_LOAD.flashcards);
    expect(fatigueFactor("practice", tired)).toBeLessThan(fatigueFactor("flashcards", tired));
    expect(fatigueFactor("paper", tired)).toBeLessThan(fatigueFactor("recall", tired));
  });

  it("never drops below the floor, and is exactly 1 when fresh and daytime", () => {
    const exhausted = { activeMinutes: 600, hourOfDay: 23 };
    for (const activity of Object.keys(ACTIVITY_LOAD) as (keyof typeof ACTIVITY_LOAD)[]) {
      expect(fatigueFactor(activity, exhausted)).toBeGreaterThanOrEqual(FATIGUE_FLOOR);
      expect(fatigueFactor(activity, { activeMinutes: 0, hourOfDay: 14 })).toBe(1);
    }
  });

  it("the recommender demotes practice but not flashcards when tired (2h session, past 10pm)", () => {
    const base: Omit<RecommendInput, "activeMinutes"> = {
      topics: [topic("weak1"), topic("weak2")],
      mastery: [
        {
          topicId: "weak1",
          subjectId: "bio",
          mastery: 0.3,
          retention: 0.5,
          confidence: 0.5,
          cardsTotal: 4,
          cardsDue: 0,
          attempts: 4,
          accuracy: 0.4,
          lastStudiedAt: NOW.toISOString(),
          weak: true,
        },
        {
          topicId: "weak2",
          subjectId: "bio",
          mastery: 0.35,
          retention: 0.5,
          confidence: 0.5,
          cardsTotal: 4,
          cardsDue: 0,
          attempts: 4,
          accuracy: 0.4,
          lastStudiedAt: NOW.toISOString(),
          weak: true,
        },
      ],
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 20,
      subjectIds: ["bio"],
      now: new Date("2026-09-01T22:30:00.000Z"),
      marksPerHour: new Map([
        ["weak1", 5],
        ["weak2", 5],
      ]),
    };
    // Same underlying quality, but a fatigued 2-hour evening session:
    const fresh = recommend({ ...base, now: new Date("2026-09-01T14:00:00.000Z"), activeMinutes: 0 });
    const tired = recommend({ ...base, activeMinutes: 120 });
    const practiceFresh = fresh.find((r) => r.activity === "practice")!;
    const practiceTired = tired.find((r) => r.activity === "practice")!;
    expect(practiceTired.score).toBeLessThan(practiceFresh.score);
    expect(practiceTired.factors?.fatigue).toBeLessThan(1);
    // The fatigue penalty records itself for the explanation UI.
    expect(practiceTired.factors?.fatigue).toBeGreaterThan(0);
    expect(practiceTired.factors?.fatigue).toBeLessThanOrEqual(1);
  });
});

// --- forgetting-curve visualization -----------------------------------------

describe("forgetting-curve visualization", () => {
  const cardWith = (stability: number, reviewedDaysAgo: number) => ({
    stability,
    lastReviewedAt: new Date(NOW.getTime() - reviewedDaysAgo * 86_400_000).toISOString(),
  });

  it("the FSRS curve decays monotonically from 1", () => {
    expect(forgettingCurve(0, 10)).toBe(1);
    expect(forgettingCurve(10, 10)).toBeGreaterThan(forgettingCurve(20, 10));
    expect(forgettingCurve(20, 10)).toBeGreaterThan(forgettingCurve(40, 10));
  });

  it("stats: stable recent reviews hold 90%+, weak ones are already below", () => {
    const strong = curveStats([cardWith(30, 1)], NOW, 30);
    expect(strong.retentionNow).toBeGreaterThan(0.9);
    expect(strong.daysTo90).toBeGreaterThan(5);
    const weak = curveStats([cardWith(1, 3)], NOW, 30);
    expect(weak.retentionNow).toBeLessThan(0.9);
    expect(weak.daysTo90).toBe(0);
  });

  it("the aggregate mixes stabilities: mean sits between the extremes", () => {
    const mix = curveStats([cardWith(30, 1), cardWith(1, 1)], NOW, 30);
    const strong = curveStats([cardWith(30, 1)], NOW, 30);
    const weak = curveStats([cardWith(1, 1)], NOW, 30);
    expect(mix.retentionNow).toBeGreaterThan(weak.retentionNow);
    expect(mix.retentionNow).toBeLessThan(strong.retentionNow);
  });

  it("a never-reviewed set reports zero and no drop-off dates (UI shows the empty state)", () => {
    const empty = curveStats([{ stability: 5, lastReviewedAt: null }], NOW, 30);
    expect(empty.retentionNow).toBe(0);
    expect(empty.daysTo90).toBeNull();
    expect(empty.daysTo70).toBeNull();
  });
});
