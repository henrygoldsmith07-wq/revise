import { describe, expect, it } from "vitest";
import { recommend } from "@/domain/recommender";
import {
  coldStartSignals,
  coldStartRemaining,
  detectTiedRecommendations,
  epsilonFor,
  ucbBonus,
  learningGainFromOutcomes,
  adaptiveOffsetFromGain,
  baselineOrder,
  evaluateVsBaseline,
  evaluateAllBaselines,
} from "@/domain/recommender-enhancements";
import { createCard } from "@/domain/scheduling";
import type { Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2025-06-10T09:00:00.000Z");

function topic(id: string, diff: 1 | 2 | 3 | 4 | 5 = 3, order = 0): Topic {
  return { id, subjectId: "chem", unitId: "u1", title: `T ${id}`, order, intrinsicDifficulty: diff, summary: "s", keyPoints: ["k"], commonErrors: ["e"] };
}
function mastery(topicId: string, masteryVal: number, evidence = 6): TopicMastery {
  const attempts = Math.floor(evidence / 2);
  const cardsTotal = evidence - attempts * 2;
  return {
    topicId,
    subjectId: "chem",
    mastery: masteryVal,
    retention: masteryVal,
    confidence: masteryVal,
    cardsTotal: Math.max(0, cardsTotal),
    cardsDue: 0,
    attempts,
    accuracy: masteryVal,
    lastStudiedAt: "2025-06-05T09:00:00.000Z",
    weak: masteryVal < 0.55 && evidence > 0,
  } as unknown as TopicMastery;
}

// ── Cold-start ───────────────────────────────────────────────────────────

describe("cold-start signals", () => {
  it("surfaces untouched then thin-evidence topics, harder first", () => {
    const topics = [topic("a", 4, 0), topic("b", 1, 5), topic("c", 3, 0)];
    const m = [mastery("a", 0, 0), mastery("b", 0.4, 4)];
    // c has no row → untouched
    const signals = coldStartSignals({ topics, mastery: m });
    expect(signals.some((s) => s.topicId === "a")).toBe(true);
    expect(signals.some((s) => s.topicId === "c")).toBe(true);
    expect(signals[0].reason).toBeDefined();
  });

  it("coldStartRemaining counts untouched topics", () => {
    const m = [mastery("a", 0, 0), mastery("b", 0.5, 6), mastery("c", 0, 0)];
    expect(coldStartRemaining(m)).toBe(2);
  });
});

// ── Tie detection ────────────────────────────────────────────────────────

describe("tie detection", () => {
  it("detects two scores within 7% as tied", () => {
    const g = detectTiedRecommendations([
      { topicId: "a", score: 20 },
      { topicId: "b", score: 19.2 },
      { topicId: "c", score: 5 },
    ]);
    expect(g).not.toBeNull();
    expect(g!.topicIds).toContain("a");
    expect(g!.topicIds).toContain("b");
    expect(g!.topicIds).not.toContain("c");
  });

  it("returns null when no tie", () => {
    expect(detectTiedRecommendations([{ topicId: "a", score: 20 }, { topicId: "b", score: 8 }])).toBeNull();
  });

  it("requires at least two topic candidates", () => {
    expect(detectTiedRecommendations([{ topicId: "a", score: 10 }])).toBeNull();
  });
});

// ── Exploration helpers ──────────────────────────────────────────────────

describe("exploration helpers", () => {
  it("epsilon decays with total recommendations", () => {
    expect(epsilonFor(0)).toBeGreaterThan(epsilonFor(200));
    expect(epsilonFor(9999)).toBeCloseTo(0.04, 2);
  });

  it("UCB bonus larger for thin evidence", () => {
    expect(ucbBonus(1, 50)).toBeGreaterThan(ucbBonus(12, 50));
  });

  it("recommend with enableExploration does not crash and still ranks", () => {
    const topics = [topic("weak", 3, 0), topic("also-weak", 3, 1)];
    const m = [mastery("weak", 0.3, 2), mastery("also-weak", 0.32, 2)];
    const rng = (() => {
      let s = 0x9e3779b9;
      return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return ((s >>> 0) / 0xffffffff);
      };
    })();
    const recs = recommend({
      topics,
      mastery: m,
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
      enableExploration: true,
      rng,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].score).toBeGreaterThan(0);
  });
});

// ── Historical learning gain ─────────────────────────────────────────────

describe("historical learning gain", () => {
  it("aggregates deltas into marks per hour per topic", () => {
    const gains = learningGainFromOutcomes([
      { subjectId: "chem", topicId: "a", predicted: 30, actual: 40, date: "2025-06-01" },
      { subjectId: "chem", topicId: "a", predicted: 28, actual: 36, date: "2025-06-02" },
      { subjectId: "chem", topicId: "a", predicted: 32, actual: 34, date: "2025-06-03" },
      { subjectId: "chem", topicId: "b", predicted: 40, actual: 41, date: "2025-06-03" },
    ]);
    const ga = gains.find((g) => g.topicId === "a")!;
    expect(ga.sampleSize).toBe(3);
    expect(ga.marksPerHour).toBeGreaterThan(0);
    expect(gains[0].topicId).toBe("a"); // sorted highest first
  });

  it("unknown reliability until n>=4", () => {
    const gains = learningGainFromOutcomes([
      { subjectId: "chem", topicId: "a", predicted: 30, actual: 35, date: "2025-06-01" },
    ]);
    expect(gains[0].reliable).toBe(false);
    expect(adaptiveOffsetFromGain(gains[0])).toBe(0);
  });

  it("recommend with historicalGain overrides mph when both present", () => {
    const topics = [topic("a", 3, 0), topic("b", 3, 1)];
    const m = [mastery("a", 0.3, 6), mastery("b", 0.3, 6)];
    const hist = new Map([["a", 6.0], ["b", 0.2]]);
    const recs = recommend({
      topics,
      mastery: m,
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
      marksPerHour: new Map([["a", 0.5], ["b", 0.5]]),
      historicalGain: hist,
    });
    const ra = recs.find((r) => r.topicId === "a")!;
    expect(ra.explanation!.marksPerHour).toBeCloseTo(6, 1e-9);
  });
});

// ── Causal / baseline evaluation ─────────────────────────────────────────

describe("causal vs baselines", () => {
  it("baselineOrder sorts deterministically per baseline", () => {
    const topics = [topic("a", 3, 2), topic("b", 3, 0), topic("c", 3, 1)];
    const m = [
      { topicId: "a", subjectId: "chem", mastery: 0.6, retention: 0.6, confidence: 0.6, cardsTotal: 4, cardsDue: 0, attempts: 4, accuracy: 0.6, lastStudiedAt: "2025-06-09T00:00:00.000Z", weak: false } as unknown as TopicMastery,
      { topicId: "b", subjectId: "chem", mastery: 0.2, retention: 0.2, confidence: 0.2, cardsTotal: 4, cardsDue: 0, attempts: 4, accuracy: 0.2, lastStudiedAt: "2025-06-01T00:00:00.000Z", weak: true } as unknown as TopicMastery,
      { topicId: "c", subjectId: "chem", mastery: 0.4, retention: 0.4, confidence: 0.4, cardsTotal: 4, cardsDue: 0, attempts: 4, accuracy: 0.4, lastStudiedAt: "2025-06-05T00:00:00.000Z", weak: true } as unknown as TopicMastery,
    ];
    expect(baselineOrder("weakest-first", topics, m)[0]).toBe("b");
    expect(baselineOrder("oldest-first", topics, m)[0]).toBe("b");
    const byMarks = baselineOrder("most-marks-lost", topics, m, new Map([["c", 9], ["b", 2]]));
    expect(byMarks[0]).toBe("c");
  });

  it("evaluateVsBaseline needs n>=10, otherwise narrative says so", () => {
    const topics = [topic("a")];
    const m = [mastery("a", 0.4)];
    const small = [{ subjectId: "chem", topicId: "a", predicted: 30, actual: 32, date: "2025-06-01" }];
    const r = evaluateVsBaseline({ pairs: small, topics, mastery: m, baseline: "weakest-first" });
    expect(r.n).toBe(1);
    expect(r.narrative).toMatch(/Not enough outcomes/);
  });

  it("evaluateAllBaselines returns 4 results", () => {
    const topics = [topic("a"), topic("b")];
    const m = [mastery("a", 0.3), mastery("b", 0.4)];
    const pairs = Array.from({ length: 12 }, (_, i) => ({
      subjectId: "chem",
      topicId: i % 2 ? "a" : "b",
      predicted: 30 + i,
      actual: 31 + i + (i % 3 === 0 ? 1 : 0),
      date: `2025-06-${String(i + 1).padStart(2, "0")}`,
    }));
    const all = evaluateAllBaselines({ pairs, topics, mastery: m });
    expect(all).toHaveLength(4);
    expect(all.every((r) => r.n === 12)).toBe(true);
  });
});
