import { describe, expect, it } from "vitest";
import { traceQuestion } from "@/domain/knowledge-tracing";
import {
  adaptiveDifficultyCalibration,
  buildPredictionOutcomePairs,
  calibrationCurve,
  predictionOutcomeReport,
  sparseEvidenceConfidence,
} from "@/domain/learning-controls";
import { questionExposureReport, rankQuestionsForExposure } from "@/domain/question-exposure";
import { rootPrerequisitePaths, rootPrerequisiteRemediation, type PrerequisiteEdge } from "@/domain/prerequisites";
import type { Attempt, Card, Question, Topic, TopicMastery } from "@/domain/types";

const DATE = "2026-01-01T00:00:00.000Z";

function topic(id: string): Topic {
  return {
    id,
    subjectId: "subject-1",
    unitId: "unit-1",
    title: id,
    order: 0,
    intrinsicDifficulty: 3,
    summary: "summary",
    keyPoints: ["point"],
    commonErrors: ["error"],
  };
}

function mastery(topicId: string, value: number, attempts = 0): TopicMastery {
  return {
    topicId,
    subjectId: "subject-1",
    mastery: value,
    retention: value,
    confidence: value,
    cardsTotal: 0,
    cardsDue: 0,
    attempts,
    accuracy: value,
    lastStudiedAt: attempts ? DATE : null,
    weak: value < 0.55 && attempts > 0,
  };
}

function question(id: string, difficulty: 1 | 2 | 3 | 4 | 5 = 3, topicIds = ["t1"]): Question {
  return {
    id,
    subjectId: "subject-1",
    topicIds,
    kind: "structured",
    stem: id,
    parts: [],
    totalMarks: 10,
    calculatorAllowed: true,
    difficulty,
    origin: "seed",
    createdAt: DATE,
  };
}

function attempt(
  id: string,
  questionId: string,
  awarded: number,
  index: number,
  mode: Attempt["mode"] = "practice",
  paperRunId?: string,
): Attempt {
  return {
    id,
    userId: "user-1",
    questionId,
    subjectId: "subject-1",
    topicIds: ["t1"],
    answers: {},
    marked: [],
    awarded,
    max: 10,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode,
    paperRunId,
    createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
  };
}

describe("learning controls", () => {
  it("keeps sparse evidence provisional", () => {
    const attempts = Array.from({ length: 4 }, (_, i) => attempt(`a${i}`, "q1", 10, i));
    const report = sparseEvidenceConfidence({
      topics: [topic("t1"), topic("t2")],
      mastery: [mastery("t1", 0.8, 4), mastery("t2", 0)],
      cards: [] as Card[],
      attempts: attempts.map((a) => ({ ...a, topicIds: ["t1"] })),
      mistakes: [],
    });

    expect(report.status).toBe("mixed");
    expect(report.reliableTopics).toBe(1);
    expect(report.needsMoreEvidence).toBe(1);
    expect(report.intervals.find((row) => row.topicId === "t2")?.needsMoreEvidence).toBe(true);
  });

  it("builds out-of-sample paper predictions and calibration curves", () => {
    const questions = [question("q1"), question("q2")];
    const attempts = [
      attempt("a1", "q1", 6, 1, "paper", "paper-1"),
      attempt("a2", "q2", 8, 2, "paper", "paper-1"),
      attempt("a3", "q1", 8, 3, "paper", "paper-2"),
      attempt("a4", "q2", 9, 4, "paper", "paper-2"),
      attempt("a5", "q1", 2, 5, "paper", "paper-3"),
    ];
    const pairs = buildPredictionOutcomePairs({ questions, attempts });
    const report = predictionOutcomeReport(pairs);

    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toMatchObject({ predictedMarks: 11.8, actualMarks: 14, marksAvailable: 20 });
    expect(pairs[1].predictedMarks).toBeGreaterThan(pairs[0].predictedMarks);
    expect(report.n).toBe(3);
    expect(report.reliable).toBe(true);
    expect(report.curve.length).toBeGreaterThan(0);
    expect(calibrationCurve(pairs, 2).every((bin) => bin.count > 0)).toBe(true);
  });

  it("adapts difficulty only after reliable item evidence", () => {
    const questions = [question("stretch", 3), question("consolidate", 3), question("hold", 3), question("thin", 3)];
    const traces = questions.map((q) => traceQuestion({
      question: q,
      attempts: Array.from({ length: q.id === "thin" ? 2 : 5 }, (_, i) => attempt(`${q.id}-${i}`, q.id, q.id === "stretch" ? 10 : q.id === "consolidate" ? 2 : 6, i)),
    }));
    const report = adaptiveDifficultyCalibration({ questions, traces });

    expect(report.stretch).toBe(1);
    expect(report.consolidate).toBe(1);
    expect(report.rows.find((row) => row.questionId === "stretch")?.targetDifficulty).toBe(4);
    expect(report.rows.find((row) => row.questionId === "consolidate")?.targetDifficulty).toBe(2);
    expect(report.rows.find((row) => row.questionId === "thin")?.action).toBe("insufficient");
  });

  it("ranks unseen questions before secure overpractice and reports exposure", () => {
    const questions = [question("seen"), question("new"), question("light")];
    const attempts = [
      ...Array.from({ length: 4 }, (_, i) => attempt(`seen-${i}`, "seen", 10, i)),
      attempt("light-1", "light", 5, 5),
    ];
    const report = questionExposureReport({ questions, attempts });
    const ranked = rankQuestionsForExposure({ questions, attempts, masteryByTopic: new Map([["t1", 0.5]]) });

    expect(report.unseen).toBe(1);
    expect(report.overpractised).toBe(1);
    expect(report.rows.find((row) => row.questionId === "seen")?.status).toBe("overpractised");
    expect(ranked.map((row) => row.id)).toEqual(["new", "light", "seen"]);
  });

  it("finds transitive root prerequisites and aggregates remediation impact", () => {
    const edges: PrerequisiteEdge[] = [
      { topicId: "t3", prerequisiteId: "t2" },
      { topicId: "t2", prerequisiteId: "t1" },
    ];
    const paths = rootPrerequisitePaths("t3", edges);
    const remediation = rootPrerequisiteRemediation({
      topics: [topic("t1"), topic("t2"), topic("t3")],
      mastery: [mastery("t1", 0.2, 5), mastery("t2", 0.3, 5), mastery("t3", 0.4, 5)],
      edges,
    });

    expect(paths).toEqual([{ rootTopicId: "t1", path: ["t3", "t2", "t1"] }]);
    expect(remediation[0]).toMatchObject({ rootTopicId: "t1", affectedTopicIds: ["t2", "t3"] });
  });
});
