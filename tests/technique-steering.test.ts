import { describe, expect, it } from "vitest";
import { hrefForRecommendation, recommend } from "@/domain/recommender";
import type { Card, ExamDate, Mistake, PlannedSession, Topic, TopicMastery } from "@/domain/types";
import type { KnowledgeAnsweringReport } from "@/domain/exam-technique";

const NOW = new Date("2025-06-02T17:00:00.000Z");
const SUBJECT = "bio";

const topic = (id: string, subjectId = SUBJECT): Topic => ({
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

const mastery = (topicId: string, value: number): TopicMastery => ({
  topicId,
  subjectId: SUBJECT,
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

function report(overrides: Partial<KnowledgeAnsweringReport> = {}): KnowledgeAnsweringReport {
  return {
    subjectId: SUBJECT,
    topicId: null,
    knowledgeMarks: 3,
    answeringMarks: 1,
    totalMarks: 4,
    knowledgeShare: 0.75,
    answeringShare: 0.25,
    mistakes: 8,
    classifiedFromAnswers: 6,
    mappedFromLegacy: 2,
    reliable: true,
    verdict: "knowledge",
    narrative: "",
    drivers: [],
    ...overrides,
  };
}

const base = {
  topics: [topic("t1", SUBJECT), topic("t2", SUBJECT), topic("t3", SUBJECT)],
  mastery: [mastery("t1", 0.3), mastery("t2", 0.2), mastery("t3", 0)], // t3 untouched → learn rec exists
  cards: [] as Card[],
  mistakes: [] as Mistake[],
  exams: [] as ExamDate[],
  plan: [] as PlannedSession[],
  sessionLengthMinutes: 25,
  subjectIds: [SUBJECT],
  now: NOW,
};

describe("technique steering — learn-first when knowledge-heavy", () => {
  it("promotes learn/flashcards/mistakes and demotes practice when knowledge is the leak", () => {
    const withoutSteer = recommend({ ...base });
    const withSteer = recommend({
      ...base,
      techniqueSplit: new Map([[SUBJECT, report({ verdict: "knowledge", knowledgeShare: 0.8 })]]),
      techniqueByTopic: new Map([
        ["t1", report({ verdict: "knowledge", knowledgeShare: 0.8 })],
        ["t2", report({ verdict: "knowledge", knowledgeShare: 0.8 })],
        ["t3", report({ verdict: "knowledge", knowledgeShare: 0.8 })],
      ]),
    });

    const learn = withSteer.find((r) => r.activity === "learn");
    const practice = withSteer.find((r) => r.activity === "practice" && !r.techniqueQuickMinutes);
    expect(learn).toBeDefined();
    expect(learn?.factors?.techniqueSteer).toBeGreaterThan(1);
    expect(learn?.techniqueKnowledgeShare).toBeCloseTo(0.8, 2);
    if (practice) {
      expect(practice.factors?.techniqueSteer).toBeLessThan(1);
    }

    // Steering moves learn up relative to practice, never reordering history.
    const learnRankWithout = withoutSteer.findIndex((r) => r.activity === "learn");
    const learnRankWith = withSteer.findIndex((r) => r.activity === "learn");
    const practiceRankWithout = withoutSteer.findIndex((r) => r.activity === "practice");
    const practiceRankWith = withSteer.findIndex((r) => r.activity === "practice");
    if (learnRankWithout >= 0 && practiceRankWithout >= 0) {
      expect(learnRankWith - practiceRankWith).toBeLessThanOrEqual(learnRankWithout - practiceRankWithout);
    }
  });

  it("keeps unsteered subjects untouched when no report exists for them", () => {
    const other = "chem";
    const withSteer = recommend({
      ...base,
      techniqueSplit: new Map([
        [other, report({ verdict: "answering", answeringShare: 0.8 })],
      ]),
    });
    for (const r of withSteer) {
      expect(r.factors?.techniqueSteer).toBeUndefined();
      expect(r.techniqueQuickMinutes).toBeUndefined();
    }
  });

  it("steers nothing when the split is mixed or unreliable", () => {
    const withMixed = recommend({
      ...base,
      techniqueSplit: new Map([[SUBJECT, report({ verdict: "mixed" })]]),
      techniqueByTopic: new Map([["t1", report({ verdict: "mixed" })]]),
    });
    const withUnreliable = recommend({
      ...base,
      techniqueSplit: new Map([[SUBJECT, report({ verdict: "knowledge", reliable: false })]]),
      techniqueByTopic: new Map([["t1", report({ verdict: "knowledge", reliable: false })]]),
    });
    for (const r of [...withMixed, ...withUnreliable]) {
      expect(r.factors?.techniqueSteer).toBeUndefined();
    }
  });
});

describe("technique steering — timed practice when answering-heavy", () => {
  it("converts the practice rec into a named timed run and demotes learn", () => {
    const withSteer = recommend({
      ...base,
      techniqueSplit: new Map([[SUBJECT, report({ verdict: "answering", knowledgeShare: 0.2, answeringShare: 0.8 })]]),
      techniqueByTopic: new Map([
        ["t1", report({ verdict: "answering", knowledgeShare: 0.2, answeringShare: 0.8 })],
        ["t2", report({ verdict: "answering", knowledgeShare: 0.2, answeringShare: 0.8 })],
        ["t3", report({ verdict: "answering", knowledgeShare: 0.2, answeringShare: 0.8 })],
      ]),
    });

    const timedRun = withSteer.find((r) => r.techniqueQuickMinutes != null);
    expect(timedRun).toBeDefined();
    expect(timedRun?.activity).toBe("practice");
    expect([5, 10]).toContain(timedRun?.techniqueQuickMinutes);
    expect(timedRun?.reason).toContain("Timed run");
    expect(timedRun?.factors?.techniqueSteer).toBeGreaterThan(1); // practice promoted on answering

    const learn = withSteer.find((r) => r.activity === "learn");
    if (learn) expect(learn.factors?.techniqueSteer).toBeLessThan(1);

    // The Today hero must be able to route it to the clocked quick session.
    expect(hrefForRecommendation(timedRun!)).toBe(
      `/practice?quick=${timedRun!.techniqueQuickMinutes}&subject=${SUBJECT}`,
    );
  });

  it("keeps plain practice recs on the topic href when steering did not apply", () => {
    expect(hrefForRecommendation({ activity: "practice", subjectId: SUBJECT, topicId: "t1" })).toBe(
      "/practice?topic=t1",
    );
  });
});
