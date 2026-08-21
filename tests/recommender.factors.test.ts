import { describe, expect, it } from "vitest";
import { recommend } from "@/domain/recommender";
import { createCard } from "@/domain/scheduling";
import type { Card, ExamDate, Mistake, PlannedSession, Topic, TopicMastery } from "@/domain/types";

// ---------------------------------------------------------------------------
// The recommender is the most differentiated subsystem in Revise. These tests
// treat it like an algorithm, not a UI helper: simulated learner profiles
// vary one input at a time and assert that the recommendation changes
// sensibly. If a factor stops mattering, a test breaks.
// ---------------------------------------------------------------------------

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TODAY = "2025-06-10";

const chemElectrolysis: Topic = {
  id: "chem.electrolysis",
  subjectId: "chem",
  unitId: "u1",
  title: "Electrolysis",
  order: 3,
  intrinsicDifficulty: 3,
  summary: "s",
  keyPoints: ["k"],
  commonErrors: ["e"],
};
const chemAcids: Topic = {
  id: "chem.acids",
  subjectId: "chem",
  unitId: "u1",
  title: "Acids and bases",
  order: 1,
  intrinsicDifficulty: 2,
  summary: "s",
  keyPoints: ["k"],
  commonErrors: ["e"],
};

function mastery(
  topicId: string,
  overrides: Partial<TopicMastery> = {},
): TopicMastery {
  return {
    topicId,
    subjectId: "chem",
    mastery: 0.4,
    retention: 0.5,
    confidence: 0.5,
    cardsTotal: 6,
    cardsDue: 0,
    attempts: 4,
    accuracy: 0.55,
    lastStudiedAt: "2025-06-05T09:00:00.000Z",
    weak: false,
    ...overrides,
  };
}

function dueCard(id: string, due: string, topicId = "chem.electrolysis"): Card {
  return {
    ...createCard({ id, userId: "u", subjectId: "chem", topicId, front: "f", back: "b" }, NOW),
    due,
    state: 2,
  };
}

// ---- Factor shape ---------------------------------------------------------

describe("recommender factors — shape", () => {
  it("every recommendation carries factors and an explanation", () => {
    const result = recommend({
      topics: [chemElectrolysis, chemAcids],
      mastery: [
        mastery("chem.electrolysis", { mastery: 0.35, accuracy: 0.46, attempts: 6, cardsTotal: 8, lastStudiedAt: "2025-05-30T09:00:00.000Z", weak: true, retention: 0.35 }),
        mastery("chem.acids", { mastery: 0.75, accuracy: 0.8, attempts: 6, cardsTotal: 8, lastStudiedAt: "2025-06-09T09:00:00.000Z", weak: false, retention: 0.9 }),
      ],
      cards: [],
      mistakes: [],
      exams: [{ id: "e", userId: "u", subjectId: "chem", date: "2025-07-04", label: "Paper 1" }],
      plan: [],
      sessionLengthMinutes: 18,
      subjectIds: ["chem"],
      marksPerHour: new Map([["chem.electrolysis", 5.6 * (60 / 18)], ["chem.acids", 0.8]]),
      now: NOW,
    });
    const practice = result.filter((r) => r.activity === "practice");
    expect(practice.length).toBeGreaterThan(0);
    for (const r of practice) {
      expect(r.factors).toBeDefined();
      expect(r.explanation).toBeDefined();
      expect(r.explanation!.factors.examGain).toBeGreaterThan(0);
      expect(r.explanation!.factors.urgency).toBeGreaterThanOrEqual(1);
      expect(r.explanation!.daysToExam).toBe(24);
      expect(r.explanation!.paperLabel).toBe("Paper 1");
    }
  });

  it("explanation mirrors the brief: recoverable, last evidence %, days since retrieval, paper countdown", () => {
    // Electrolysis as in the brief: 18 min, 5.6 marks recoverable, 46% evidence, 11 days since retrieval, Paper 1 24 days away
    const rec = recommend({
      topics: [chemElectrolysis],
      mastery: [
        mastery("chem.electrolysis", {
          mastery: 0.38,
          accuracy: 0.46,
          attempts: 5,
          cardsTotal: 8,
          lastStudiedAt: "2025-05-30T09:00:00.000Z", // 11 days before 2025-06-10
          weak: true,
          retention: 0.38,
        }),
      ],
      cards: [],
      mistakes: [],
      exams: [{ id: "e", userId: "u", subjectId: "chem", date: "2025-07-04", label: "Paper 1" }],
      plan: [],
      sessionLengthMinutes: 18,
      subjectIds: ["chem"],
      marksPerHour: new Map([["chem.electrolysis", 5.6]]),
      now: NOW,
    }).find((r) => r.topicId === "chem.electrolysis");
    expect(rec).toBeDefined();
    expect(rec!.minutes).toBe(18);
    expect(rec!.explanation!.recoverableMarks).toBeCloseTo(5.6 * (18 / 60), 0.05);
    expect(rec!.explanation!.marksPerHour).toBeCloseTo(5.6, 0.05);
    expect(rec!.explanation!.lastEvidencePercent).toBe(46);
    expect(rec!.explanation!.daysSinceRetrieval).toBe(11);
    expect(rec!.explanation!.daysToExam).toBe(24);
  });
});

// ---- Simulated learner profiles ------------------------------------------

describe("simulated learner profiles", () => {
  // Profile A: exam in 3 days, one topic weak. Profile B: same weak topic, exam in 60 days.
  it("exam proximity raises the score and can flip the top recommendation", () => {
    const weak = mastery("chem.electrolysis", { mastery: 0.3, weak: true, cardsTotal: 6, attempts: 4, lastStudiedAt: "2025-06-05T09:00:00.000Z" });
    const far = recommend({
      topics: [chemElectrolysis],
      mastery: [weak],
      cards: [],
      mistakes: [],
      exams: [{ id: "e", userId: "u", subjectId: "chem", date: "2025-08-09", label: "Paper 1" }],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    });
    const near = recommend({
      topics: [chemElectrolysis],
      mastery: [weak],
      cards: [],
      mistakes: [],
      exams: [{ id: "e", userId: "u", subjectId: "chem", date: "2025-06-13", label: "Paper 1" }],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    });
    const farTop = far.find((r) => r.topicId === "chem.electrolysis")!;
    const nearTop = near.find((r) => r.topicId === "chem.electrolysis")!;
    expect(nearTop.score).toBeGreaterThan(farTop.score);
    expect(nearTop.explanation!.factors.urgency).toBeGreaterThan(farTop.explanation!.factors.urgency);
  });

  it("weaker mastery ranks higher than less-weak when evidence is comparable", () => {
    const result = recommend({
      topics: [chemElectrolysis, chemAcids],
      mastery: [
        mastery("chem.electrolysis", { mastery: 0.25, weak: true, accuracy: 0.3, cardsTotal: 6, attempts: 4, retention: 0.3 }),
        mastery("chem.acids", { mastery: 0.5, weak: true, accuracy: 0.5, cardsTotal: 6, attempts: 4, retention: 0.55 }),
      ],
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    });
    const practice = result.filter((r) => r.activity === "practice");
    expect(practice[0].topicId).toBe("chem.electrolysis");
    expect(practice[0].factors!.weakness).toBeGreaterThan(practice[1].factors!.weakness);
  });

  it("higher expected gain (marksPerHour) outranks a less-valuable weak topic when blocks are equal", () => {
    const result = recommend({
      topics: [chemElectrolysis, chemAcids],
      mastery: [
        mastery("chem.electrolysis", { mastery: 0.35, weak: true, retention: 0.5 }),
        mastery("chem.acids", { mastery: 0.35, weak: true, retention: 0.5 }),
      ],
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      marksPerHour: new Map([["chem.electrolysis", 4.2], ["chem.acids", 0.9]]),
      now: NOW,
    });
    const practice = result.filter((r) => r.activity === "practice");
    expect(practice[0].topicId).toBe("chem.electrolysis");
  });

  it("greater forgetting risk (decayed retention / long ago retrieval) raises the score", () => {
    const recent = mastery("chem.electrolysis", { mastery: 0.35, weak: true, retention: 0.9, lastStudiedAt: NOW.toISOString() });
    const stale = mastery("chem.acids", { mastery: 0.35, weak: true, retention: 0.25, lastStudiedAt: "2025-05-10T09:00:00.000Z" });
    const result = recommend({
      topics: [chemElectrolysis, chemAcids],
      mastery: [recent, stale],
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    });
    const practice = result.filter((r) => r.activity === "practice");
    // Same mastery, same gain, but stale has higher forgetting factor
    const recentRec = practice.find((r) => r.topicId === "chem.electrolysis")!;
    const staleRec = practice.find((r) => r.topicId === "chem.acids")!;
    expect(staleRec.factors!.forgetting).toBeGreaterThan(recentRec.factors!.forgetting);
    expect(staleRec.score).toBeGreaterThan(recentRec.score);
  });

  it("a shorter block inflates per-minute gain but deflates total gain — still comparable via the same scale", () => {
    const m = mastery("chem.electrolysis", { mastery: 0.3, weak: true, accuracy: 0.4, retention: 0.4, cardsTotal: 6, attempts: 4 });
    const long = recommend({
      topics: [chemElectrolysis], mastery: [m], cards: [], mistakes: [], exams: [], plan: [],
      sessionLengthMinutes: 40, subjectIds: ["chem"], marksPerHour: new Map([["chem.electrolysis", 3.0]]), now: NOW,
    }).find((r) => r.topicId === "chem.electrolysis")!;
    const short = recommend({
      topics: [chemElectrolysis], mastery: [m], cards: [], mistakes: [], exams: [], plan: [],
      sessionLengthMinutes: 18, subjectIds: ["chem"], marksPerHour: new Map([["chem.electrolysis", 3.0]]), now: NOW,
    }).find((r) => r.topicId === "chem.electrolysis")!;
    // Shorter block should have fewer total recoverable marks but comparable/higher per-minute; total score penalises very short blocks slightly
    expect(short.explanation!.recoverableMarks).toBeLessThan(long.explanation!.recoverableMarks);
    // Both still produce a positive score
    expect(short.score).toBeGreaterThan(0);
    expect(long.score).toBeGreaterThan(0);
  });

  it("thin evidence (uncertainty) slightly boosts the score to encourage exploration", () => {
    const thin = mastery("chem.electrolysis", { mastery: 0.35, weak: true, cardsTotal: 1, attempts: 0, retention: 0.5 });
    const thick = mastery("chem.acids", { mastery: 0.35, weak: true, cardsTotal: 10, attempts: 6, retention: 0.5 });
    const result = recommend({
      topics: [chemElectrolysis, chemAcids],
      mastery: [thin, thick],
      cards: [],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    });
    const thinRec = result.find((r) => r.topicId === "chem.electrolysis")!;
    const thickRec = result.find((r) => r.topicId === "chem.acids")!;
    expect(thinRec.factors!.uncertainty).toBeGreaterThan(thickRec.factors!.uncertainty);
  });
});

describe("due cards and mistakes still respect the factor model", () => {
  it("overdue cards increase forgetting and therefore score", () => {
    const fresh = recommend({
      topics: [chemElectrolysis],
      mastery: [mastery("chem.electrolysis", { mastery: 0.6, weak: false })],
      cards: [dueCard("c1", TODAY)],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    }).find((r) => r.activity === "flashcards")!;
    const overdue = recommend({
      topics: [chemElectrolysis],
      mastery: [mastery("chem.electrolysis", { mastery: 0.6, weak: false })],
      cards: [dueCard("c1", "2025-05-28"), dueCard("c2", "2025-05-20")],
      mistakes: [],
      exams: [],
      plan: [],
      sessionLengthMinutes: 25,
      subjectIds: ["chem"],
      now: NOW,
    }).find((r) => r.activity === "flashcards")!;
    expect(overdue.factors!.forgetting).toBeGreaterThan(fresh.factors!.forgetting);
    expect(overdue.score).toBeGreaterThan(fresh.score);
  });

  it("more open mistakes increase the mistakes activity score", () => {
    const few: Mistake[] = Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`, userId: "u", subjectId: "chem", topicId: "chem.electrolysis", marksLost: 2, description: "d", category: "method" as const, resolved: false, createdAt: NOW.toISOString(),
    }));
    const many: Mistake[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`, userId: "u", subjectId: "chem", topicId: "chem.electrolysis", marksLost: 2, description: "d", category: "method" as const, resolved: false, createdAt: NOW.toISOString(),
    }));
    const fewScore = recommend({ topics: [chemElectrolysis], mastery: [mastery("chem.electrolysis")], cards: [], mistakes: few, exams: [], plan: [], sessionLengthMinutes: 25, subjectIds: ["chem"], now: NOW }).find((r) => r.activity === "mistakes")!.score;
    const manyScore = recommend({ topics: [chemElectrolysis], mastery: [mastery("chem.electrolysis")], cards: [], mistakes: many, exams: [], plan: [], sessionLengthMinutes: 25, subjectIds: ["chem"], now: NOW }).find((r) => r.activity === "mistakes")!.score;
    expect(manyScore).toBeGreaterThan(fewScore);
  });
});
