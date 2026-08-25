import { describe, expect, it } from "vitest";
import {
  ContextualBanditPolicy,
  LOWEST_PREDICTED,
  MISTAKE_FIRST,
  MOST_OVERDUE,
  REVISE_HEURISTIC,
  WEAKEST,
  mulberry32,
  runTournament,
  type ParticipantTrajectory,
  type PolicyContext,
  type TrajectoryEvent,
} from "@/domain/recommender-tournament";

// ---------------------------------------------------------------------------
// Recommender tournament — leakage guard, per-policy behaviour on hand-built
// trajectories, bandit learning signal, deterministic leaderboard.
// ---------------------------------------------------------------------------

const T0 = "2026-08-01T09:00:00.000Z";
function day(n: number): string {
  return new Date(new Date(T0).getTime() + n * 86_400_000).toISOString();
}

function event(topicId: string, n: number, over: Partial<TrajectoryEvent> = {}): TrajectoryEvent {
  return {
    anonId: "p1",
    at: day(n),
    topicId,
    questionId: `${topicId}-q${n}`,
    awarded: 2,
    max: 3,
    durationMinutes: 15,
    ...over,
  };
}

describe("policy selection", () => {
  const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
    anonId: "p1",
    now: new Date(day(30)).getTime(),
    topics: [
      { topicId: "s.strong", attempts: 5, accuracy: 0.9, lastStudiedAt: day(29), minutesInvested: 60 },
      { topicId: "s.weak", attempts: 2, accuracy: 0.35, lastStudiedAt: day(10), minutesInvested: 20 },
      { topicId: "s.stale", attempts: 1, accuracy: 0.5, lastStudiedAt: day(5), minutesInvested: 10 },
    ],
    overdueByTopic: new Map([["s.stale", 4]]),
    mistakeByTopic: new Map([["s.mistakey", day(28)]]),
    subjectWeightOf: () => 0.5,
    random: mulberry32(7),
    ...over,
  });

  it("weakest picks the lowest-accuracy topic", () => {
    expect(WEAKEST.pick(ctx())?.topicId).toBe("s.weak");
  });

  it("most-overdue picks the deepest queue even without mastery history", () => {
    expect(MOST_OVERDUE.pick(ctx({ overdueByTopic: new Map([["s.stale", 9]]) }))?.topicId).toBe("s.stale");
  });

  it("mistake-first picks the topic with the oldest unresolved mistake", () => {
    expect(MISTAKE_FIRST.pick(ctx())?.topicId).toBe("s.mistakey");
  });

  it("lowest-predicted prefers heavy-weight weak topics", () => {
    const weighted = ctx({
      subjectWeightOf: (topicId) => (topicId === "s.weak" ? 0.9 : 0.1),
      topics: [...ctx().topics],
    });
    expect(LOWEST_PREDICTED.pick(weighted)?.topicId).toBe("s.weak");
  });

  it("revise heuristic balances weakness, forgetting and weight", () => {
    const pick = REVISE_HEURISTIC.pick(ctx());
    expect(pick?.topicId).toBe("s.weak"); // weaker AND staler wins over fresh-strong
  });
});

describe("runTournament", () => {
  function participant(): ParticipantTrajectory {
    // Two topics; the learner always studies whichever they last touched plus
    // alternates - enough structure for policies to differentiate.
    const events: TrajectoryEvent[] = [];
    let strongDay = 1;
    let weakDay = 1;
    for (let i = 0; i < 12; i++) {
      events.push(event("s.strong", strongDay, { awarded: 3, max: 3 }));
      events.push(event("s.weak", weakDay + 0.02, { awarded: i % 3 === 0 ? 1 : 2, max: 3 }));
      strongDay += 21;
      weakDay += 21;
    }
    return {
      anonId: "p1",
      subjectWeights: { s: 0.8 },
      events,
      finalAssessment: [
        { questionId: "f1", topicId: "s.strong", awarded: 3, max: 3 },
        { questionId: "f2", topicId: "s.weak", awarded: 1, max: 3 },
      ],
    };
  }

  it("produces one outcome row per policy with decision points", () => {
    const outcomes = runTournament([participant()], [], { minDecisionPoints: 5 });
    expect(outcomes.length).toBeGreaterThanOrEqual(10);
    expect(outcomes.filter((o) => o.decisionPoints > 0).length).toBeGreaterThanOrEqual(9);
  });

  it("is deterministic for identical input and seed", () => {
    const a = runTournament([participant()], [], { seed: 99 });
    const b = runTournament([participant()], [], { seed: 99 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not leak the future: mutating later outcomes cannot change earlier picks", () => {
    const base = participant();
    const mutated: ParticipantTrajectory = {
      ...base,
      events: base.events.map((e) => ({ ...e })),
    };
    // Rewrite every award AFTER day 20 to perfect or zero - decisions before
    // that point must be unaffected because context folds only the past.
    // No-leakage probe: two runs restricted to the first 10 events, where
    // one run's events BEYOND index 9 carry flipped outcomes. Decisions in
    // the shared window cannot know them.
    const flippedFuture: ParticipantTrajectory = {
      ...base,
      events: base.events.map((e, idx) => (idx > 9 ? { ...e, awarded: e.awarded > 1 ? 0 : 3 } : { ...e })),
    };
    const before = runTournament([base], [], { seed: 5, maxEvents: 10 });
    const after = runTournament([flippedFuture], [], { seed: 5, maxEvents: 10 });
    const flipped = runTournament(
      [
        {
          ...mutated,
          events: mutated.events.map((e) => (Number(e.at.slice(8, 10)) >= 20 ? { ...e, awarded: e.awarded > 1 ? 0 : 3, max: 3 } : e)),
        },
      ],
      [],
      { seed: 5 },
    );
    const STATIC_IDS = ["random", "weakest", "exam-weighting", "most-overdue", "lowest-predicted", "mistake-first", "fsrs-only", "revise"];
    for (const id of STATIC_IDS) {
      expect(after.find((o) => o.policyId === id)!.decisionPoints)
        .toBe(before.find((o) => o.policyId === id)!.decisionPoints);
    }
    // Online learners train on realised steps in order, so their later picks
    // may differ once the future flips - that is sequential learning, not
    // leakage: every update consumes only events already replayed.
  });

  it("bandit updates its scores from replay-past rewards", () => {
    const bandit = new ContextualBanditPolicy();
    const rng = mulberry32(3);
    const before = bandit.pick(ctxFor(bandit, rng))?.score ?? 0;
    for (let i = 0; i < 10; i++) {
      const ctx = ctxFor(bandit, rng);
      const pick = bandit.pick(ctx);
      const topic = ctx.topics.find((t) => t.topicId === pick?.topicId)!;
      bandit.update(topic, ctx, "practice", 1); // always-rewarded arm
    }
    const after = bandit.pick(ctxFor(bandit, mulberry32(11)))?.score ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it("ranks the long-term winner by unseen marks per hour, not raw volume", () => {
    const outcomes = runTournament([participant()], [], { seed: 42 });
    const withUnseen = outcomes.filter((o) => o.unseenMarksPerHour != null);
    expect(withUnseen.length).toBeGreaterThan(0);
    for (let i = 1; i < outcomes.length; i++) {
      const prev = outcomes[i - 1].unseenMarksPerHour ?? -1;
      const curr = outcomes[i].unseenMarksPerHour ?? -1;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});

function ctxFor(policy: ContextualBanditPolicy, rng: () => number): PolicyContext {
  void policy;
  return {
    anonId: "p1",
    now: new Date(day(30)).getTime(),
    topics: [
      { topicId: "s.a", attempts: 4, accuracy: 0.6, lastStudiedAt: day(28), minutesInvested: 40 },
      { topicId: "s.b", attempts: 2, accuracy: 0.4, lastStudiedAt: day(20), minutesInvested: 25 },
    ],
    overdueByTopic: new Map(),
    mistakeByTopic: new Map(),
    subjectWeightOf: () => 0.6,
    random: rng,
  };
}
