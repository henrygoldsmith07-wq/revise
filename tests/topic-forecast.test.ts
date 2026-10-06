import { describe, expect, it } from "vitest";
import {
  FORECAST_CONFIDENT_PAPERS,
  forecastNextPaper,
} from "@/domain/topic-forecast";
import { generateMockPaper } from "@/domain/mock-generator";
import type { Mistake, Paper, Question, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2026-10-06T09:00:00.000Z");
const SUBJECT = "forecast-subject";
const TOPIC_A = `${SUBJECT}.algebra`;
const TOPIC_B = `${SUBJECT}.geometry`;

function topic(id: string, title: string, order: number, specPoints = 4): Topic {
  return {
    id,
    subjectId: SUBJECT,
    unitId: `${SUBJECT}.unit-1`,
    title,
    order,
    intrinsicDifficulty: 2,
    summary: "Test topic.",
    keyPoints: [],
    commonErrors: [],
    specPoints: Array.from({ length: specPoints }, (_, i) => ({
      id: `${id}.sp${i}`,
      ref: `1.${i}`,
      text: `Statement ${i}`,
      aos: ["AO1"] as const,
    })),
  };
}

function question(id: string, topicIds: string[], totalMarks = 2): Question {
  return {
    id,
    subjectId: SUBJECT,
    topicIds,
    kind: "structured",
    stem: `Question ${id}.`,
    parts: [],
    totalMarks,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "past-paper",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function paper(id: string, questionIds: string[], subjectId = SUBJECT): Paper {
  return {
    id,
    userId: "local",
    subjectId,
    title: `Paper ${id}`,
    totalMarks: questionIds.length * 2,
    questionIds,
    status: "extracted",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function mastery(topicId: string, value: number): TopicMastery {
  return {
    topicId,
    subjectId: SUBJECT,
    mastery: value,
    retention: value,
    confidence: 1,
    cardsTotal: 10,
    cardsDue: 0,
    attempts: 5,
    accuracy: value,
    lastStudiedAt: "2026-10-05T00:00:00.000Z",
    weak: value < 0.6,
  };
}

describe("forecastNextPaper", () => {
  it("leans the expected mix toward topics the papers in hand sample most", () => {
    const questions = [
      ...Array.from({ length: 6 }, (_, i) => question(`a${i}`, [TOPIC_A])),
      ...Array.from({ length: 2 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    const papers = [
      paper("p1", questions.slice(0, 4).map((q) => q.id)),
      paper("p2", questions.slice(4, 8).map((q) => q.id)),
    ];
    const forecast = forecastNextPaper({
      subjectId: SUBJECT,
      papers,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [],
      attempts: [],
      now: NOW,
    });

    const algebra = forecast.rows.find((row) => row.topicId === TOPIC_A)!;
    const geometry = forecast.rows.find((row) => row.topicId === TOPIC_B)!;
    expect(algebra.sampleShare).not.toBeNull();
    expect(algebra.sampleShare!).toBeGreaterThan(geometry.sampleShare!);
    // Both still appear: blending keeps the spec prior in the mix.
    expect(algebra.expectedShare).toBeGreaterThan(0);
    expect(geometry.expectedShare).toBeGreaterThan(0);
    expect(forecast.papersCount).toBe(2);
    expect(forecast.headline).toContain("2 papers");
  });

  it("is prior-only and honest when no papers are held", () => {
    const questions = [question("a0", [TOPIC_A]), question("b0", [TOPIC_B])];
    const forecast = forecastNextPaper({
      subjectId: SUBJECT,
      papers: [],
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [],
      attempts: [],
      now: NOW,
    });

    expect(forecast.papersCount).toBe(0);
    expect(forecast.provisional).toBe(true);
    expect(forecast.confidence).toBe(0);
    for (const row of forecast.rows) {
      expect(row.evidence).toBe("spec-only");
      expect(row.sampleShare).toBeNull();
      expect(row.evidenceNote).toContain("spec weight only");
    }
    expect(forecast.headline).toContain("spec weighting only");
  });

  it("stops being provisional once enough distinct papers are held", () => {
    const questions = [
      question("a0", [TOPIC_A]),
      question("a1", [TOPIC_A]),
      question("a2", [TOPIC_A]),
      question("a3", [TOPIC_A]),
      question("a4", [TOPIC_A]),
      question("a5", [TOPIC_A]),
    ];
    const papers = Array.from({ length: FORECAST_CONFIDENT_PAPERS }, (_, i) =>
      paper(`p${i}`, questions.slice(i * 2, i * 2 + 2).map((q) => q.id)),
    );
    const forecast = forecastNextPaper({
      subjectId: SUBJECT,
      papers,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1)],
      mastery: [],
      attempts: [],
      now: NOW,
    });

    expect(forecast.papersCount).toBe(FORECAST_CONFIDENT_PAPERS);
    expect(forecast.provisional).toBe(false);
    expect(forecast.confidence).toBeGreaterThan(0);
  });

  it("marks a weak, heavily-sampled topic as the top revision risk", () => {
    const questions = [
      ...Array.from({ length: 4 }, (_, i) => question(`a${i}`, [TOPIC_A])),
      ...Array.from({ length: 2 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    const papers = [
      paper("p1", ["a0", "a1", "a2", "a3"]),
      paper("p2", ["a0", "a1", "b0", "b1"]),
    ];
    const forecast = forecastNextPaper({
      subjectId: SUBJECT,
      papers,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.2), mastery(TOPIC_B, 0.95)],
      attempts: [],
      mistakes: [mistake("m1", TOPIC_A)],
      now: NOW,
    });

    const algebra = forecast.rows.find((row) => row.topicId === TOPIC_A)!;
    expect(algebra.riskLabel).toBe("at-risk");
    expect(algebra.rationale).toContain("open mistake");
    // A likely-but-risky topic sorts above a secure one.
    expect(forecast.rows[0]!.topicId).toBe(TOPIC_A);
  });

  it("lifts risk when the topic has not been studied for weeks (forgetting)", () => {
    const questions = [question("a0", [TOPIC_A])];
    const stale = { ...mastery(TOPIC_A, 0.9), lastStudiedAt: "2026-08-01T00:00:00.000Z" };
    const fresh = forecastNextPaper({
      subjectId: SUBJECT,
      papers: [paper("p1", ["a0"])],
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1)],
      mastery: [mastery(TOPIC_A, 0.9)],
      attempts: [],
      now: NOW,
    });
    const staleForecast = forecastNextPaper({
      subjectId: SUBJECT,
      papers: [paper("p1", ["a0"])],
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1)],
      mastery: [stale],
      attempts: [],
      now: NOW,
    });

    const freshRow = fresh.rows.find((row) => row.topicId === TOPIC_A)!;
    const staleRow = staleForecast.rows.find((row) => row.topicId === TOPIC_A)!;
    expect(staleRow.risk).toBeGreaterThan(freshRow.risk);
  });
});

describe("forecast-composed mock generation", () => {
  it("shifts bespoke-mock marks toward the forecast mix when asked", () => {
    // 1-mark questions keep budget granularity from masking the tilt.
    const questions = [
      ...Array.from({ length: 10 }, (_, i) => question(`a${i}`, [TOPIC_A], 1)),
      ...Array.from({ length: 10 }, (_, i) => question(`b${i}`, [TOPIC_B], 1)),
    ];
    const forecast = new Map([
      [TOPIC_A, 0.8],
      [TOPIC_B, 0.2],
    ]);

    const neutral = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.5), mastery(TOPIC_B, 0.5)],
      attempts: [],
      targetMarks: 10,
      now: NOW,
    });
    const tilted = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.5), mastery(TOPIC_B, 0.5)],
      attempts: [],
      targetMarks: 10,
      forecastShares: forecast,
      forecastWeight: 0.8,
      now: NOW,
    });

    const marksFor = (mock: ReturnType<typeof generateMockPaper>, topicId: string) =>
      mock.topics.find((row) => row.topicId === topicId)?.marks ?? 0;
    expect(marksFor(tilted, TOPIC_A)).toBeGreaterThan(marksFor(neutral, TOPIC_A));
    expect(marksFor(tilted, TOPIC_B)).toBeLessThan(marksFor(neutral, TOPIC_B));
    // Total still lands on target even with the tilt.
    expect(tilted.totalMarks).toBe(10);
  });
});

function mistake(id: string, topicId: string): Mistake {
  return {
    id,
    userId: "local",
    subjectId: SUBJECT,
    topicId,
    marksLost: 2,
    resolved: false,
    description: "Lost marks.",
    category: "recall",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}
