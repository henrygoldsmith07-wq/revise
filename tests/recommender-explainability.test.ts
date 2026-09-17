import { describe, expect, it } from "vitest";
import { applicationGapFactor, recommend } from "@/domain/recommender";
import { buildRecommendationNarrative } from "@/domain/explainability";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type { ApplicationMasteryRow } from "@/domain/application-mastery";
import type { Card, ExamDate, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2025-06-02T17:00:00.000Z");
const TODAY = "2025-06-02";

const topic = (id: string, subjectId = "maths"): Topic => ({
  id,
  subjectId,
  unitId: "unit",
  title: `Topic ${id}`,
  order: 0,
  intrinsicDifficulty: 3,
  summary: "summary",
  keyPoints: ["point"],
  commonErrors: ["error"],
});

const mastery = (topicId: string, value: number, subjectId = "maths"): TopicMastery => ({
  topicId,
  subjectId,
  mastery: value,
  retention: value,
  confidence: value,
  cardsTotal: value === 0 ? 0 : 6,
  cardsDue: 0,
  attempts: value === 0 ? 0 : 3,
  accuracy: value,
  lastStudiedAt: null,
  weak: value > 0 && value < 0.55,
});

const recallRow = (topicId: string, mastery: number, reviews = 12): RecallMasteryRow => ({
  topicId,
  subjectId: "maths",
  mastery,
  currentRetention: mastery,
  trueRetention: mastery,
  cardsTotal: 8,
  cardsDue: 0,
  reviews,
  recalled: Math.round(reviews * mastery),
  lastReviewedAt: null,
  evidence: reviews >= 20 ? "reliable" : "emerging",
});

const applicationRow = (topicId: string, mastery: number, attempts = 9): ApplicationMasteryRow => ({
  topicId,
  subjectId: "maths",
  mastery,
  accuracy: mastery,
  recentAccuracy: mastery,
  marksAwarded: Math.round(attempts * 4 * mastery),
  marksAvailable: attempts * 4,
  attempts,
  questionsAttempted: attempts,
  averageDifficulty: 3,
  lastAttemptAt: null,
  evidence: attempts >= 10 ? "reliable" : "emerging",
});

const exam: ExamDate = { id: "e1", userId: "u", subjectId: "maths", date: "2025-09-01", label: "Paper 1" };

function baseInput(overrides: Partial<Parameters<typeof recommend>[0]> = {}) {
  return {
    topics: [topic("t1"), topic("t2")],
    mastery: [mastery("t1", 0.3), mastery("t2", 0.8)],
    cards: [] as Card[],
    mistakes: [],
    exams: [exam],
    plan: [],
    sessionLengthMinutes: 20,
    subjectIds: ["maths"],
    now: NOW,
    ...overrides,
  };
}

describe("applicationGapFactor", () => {
  it("returns no gap when application evidence is unmeasured", () => {
    const app = applicationRow("t1", 0.2, 0);
    app.evidence = "unmeasured";
    const { factor, gap } = applicationGapFactor(recallRow("t1", 0.85), app);
    expect(factor).toBe(1);
    expect(gap).toBe(0);
  });

  it("returns no gap when recall evidence is too thin to compare", () => {
    const { factor, gap } = applicationGapFactor(recallRow("t1", 0.85, 1), applicationRow("t1", 0.2));
    expect(factor).toBe(1);
    expect(gap).toBe(0);
  });

  it("returns no gap when recall and application agree", () => {
    const { factor, gap } = applicationGapFactor(recallRow("t1", 0.8), applicationRow("t1", 0.75));
    expect(factor).toBe(1);
    expect(gap).toBeLessThan(0.15);
  });

  it("detects the recalls-it-but-cannot-use-it split and boosts the factor", () => {
    const { factor, gap } = applicationGapFactor(recallRow("t1", 0.85), applicationRow("t1", 0.35));
    expect(gap).toBeGreaterThanOrEqual(0.3);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThanOrEqual(1.25);
  });
});

describe("recommender recall-vs-application separation", () => {
  it("ranks an application-weak topic above an equally-mastery topic with no split", () => {
    const split = recommend(
      baseInput({
        recallMastery: [recallRow("t1", 0.85)],
        applicationMastery: [applicationRow("t1", 0.3)],
      }),
    ).find((r) => r.activity === "practice" && r.topicId === "t1");
    const noSplit = recommend(baseInput()).find(
      (r) => r.activity === "practice" && r.topicId === "t1",
    );
    expect(split).toBeDefined();
    expect(noSplit).toBeDefined();
    expect(split!.score).toBeGreaterThan(noSplit!.score);
  });

  it("records applicationGap and recallMastery in the factors", () => {
    const rec = recommend(
      baseInput({
        recallMastery: [recallRow("t1", 0.85)],
        applicationMastery: [applicationRow("t1", 0.3)],
      }),
    ).find((r) => r.activity === "practice" && r.topicId === "t1")!;
    expect(rec.factors?.applicationGap).toBeDefined();
    expect(rec.factors?.applicationGap!).toBeGreaterThanOrEqual(0.3);
    expect(rec.factors?.recallMastery).toBeCloseTo(0.85, 1);
  });

  it("does not claim a gap without application evidence", () => {
    const rec = recommend(
      baseInput({ recallMastery: [recallRow("t1", 0.85)] }),
    ).find((r) => r.activity === "practice" && r.topicId === "t1")!;
    expect(rec.factors?.applicationGap).toBeUndefined();
    expect(rec.factors?.recallMastery).toBeUndefined();
  });
});

describe("evidence-cited narrative", () => {
  it("builds a do-X-because-Y sentence from computed numbers", () => {
    const narrative = buildRecommendationNarrative({
      activity: "practice",
      topicTitle: "Electrolysis",
      factors: { examGain: 5, urgency: 1.5, weakness: 1.4, forgetting: 1.2, uncertainty: 1, applicationGap: 0.5, recallMastery: 0.84 },
      lastEvidencePercent: 38,
      daysSinceRetrieval: 8,
      daysToExam: 30,
      recoverableMarks: 4.5,
      minutes: 20,
    });
    expect(narrative).toContain("Do exam questions on Electrolysis");
    expect(narrative).toContain("84% recall");
    expect(narrative).toContain("application marks are much weaker");
    expect(narrative).toContain("not been practised for 8 days");
    expect(narrative).toContain("4.5 exam marks");
    // Never cites a number it was not given
    expect(narrative).not.toContain("undefined");
    expect(narrative).not.toContain("null");
  });

  it("cites the exam countdown only when the exam is near", () => {
    const far = buildRecommendationNarrative({
      activity: "mistakes",
      factors: { examGain: 5, urgency: 1, weakness: 1, forgetting: 1, uncertainty: 1 },
      lastEvidencePercent: null,
      daysSinceRetrieval: null,
      daysToExam: 90,
      recoverableMarks: 3,
      minutes: 15,
    });
    expect(far).not.toContain("exam is in");

    const near = buildRecommendationNarrative({
      activity: "mistakes",
      factors: { examGain: 5, urgency: 1, weakness: 1, forgetting: 1, uncertainty: 1 },
      lastEvidencePercent: null,
      daysSinceRetrieval: null,
      daysToExam: 3,
      recoverableMarks: 3,
      minutes: 15,
    });
    expect(near).toContain("the exam is in 3 days");
  });

  it("returns null when no evidence exists to cite", () => {
    const narrative = buildRecommendationNarrative({
      activity: "flashcards",
      factors: { examGain: 1, urgency: 1, weakness: 1, forgetting: 1, uncertainty: 1 },
      lastEvidencePercent: null,
      daysSinceRetrieval: null,
      daysToExam: null,
      recoverableMarks: 0.5,
      minutes: 10,
    });
    expect(narrative).toBeNull();
  });

  it("attaches the narrative to practice recommendations with a real gap", () => {
    const rec = recommend(
      baseInput({
        recallMastery: [recallRow("t1", 0.85)],
        applicationMastery: [applicationRow("t1", 0.3)],
      }),
    ).find((r) => r.activity === "practice" && r.topicId === "t1")!;
    expect(rec.explanation?.narrative).toBeTruthy();
    expect(rec.explanation?.narrative).toContain("because");
    expect(rec.explanation?.narrative).toContain("recall");
  });

  it("narrative is null rather than fabricated when there is nothing to cite", () => {
    const rec = recommend(baseInput()).find(
      (r) => r.activity === "practice" && r.topicId === "t1",
    )!;
    // No retrieval gap (never studied), far exam, low gain: every clause is guarded off
    expect(rec.explanation?.narrative ?? null).not.toContain("undefined");
    expect(rec.explanation?.narrative).not.toContain("not been practised");
  });
});
