import { describe, expect, it } from "vitest";
import type { Attempt, Paper, Question, Subject } from "@/domain/types";
import {
  DEFAULT_SECONDS_PER_MARK,
  buildResponseTimeCalibration,
} from "@/domain/response-time-calibration";

const subject = {
  id: "maths",
  name: "Mathematics",
  papers: [{ id: "maths.p1", name: "Paper 1", weight: 1, durationMinutes: 100, calculatorAllowed: true }],
} as Subject;

const paper = {
  id: "paper-1",
  userId: "local",
  subjectId: "maths",
  title: "Mock paper",
  paperSpecId: "maths.p1",
  totalMarks: 50,
  questionIds: ["q1"],
  status: "practised",
  createdAt: "2026-08-18T09:00:00.000Z",
} as Paper;

const question = {
  id: "q1",
  subjectId: "maths",
  topicIds: ["maths.algebra"],
  stem: "Solve the equation.",
  parts: [],
  totalMarks: 4,
  difficulty: 3,
  kind: "short",
  calculatorAllowed: true,
  origin: "past-paper",
  paperId: paper.id,
  createdAt: "2026-08-18T09:00:00.000Z",
} as Question;

function attempt(id: string, elapsedMs: number, awarded: number, questionId = question.id): Attempt {
  return {
    id,
    userId: "local",
    questionId,
    subjectId: "maths",
    topicIds: ["maths.algebra"],
    answers: {},
    marked: [],
    awarded,
    max: questionId === question.id ? 4 : 2,
    feedback: "",
    markedBy: "rubric",
    elapsedMs,
    mode: "practice",
    createdAt: `2026-08-18T09:0${id.slice(-1)}:00.000Z`,
  };
}

describe("Response-Time Calibration", () => {
  it("uses paper duration and marks to classify pace without changing the attempts", () => {
    const report = buildResponseTimeCalibration({
      subjects: [subject],
      papers: [paper],
      questions: [question],
      attempts: [
        attempt("a1", 120_000, 2),
        attempt("a2", 480_000, 4),
        attempt("a3", 720_000, 3),
      ],
    });

    const row = report.rows[0];
    expect(row.attempts).toBe(3);
    expect(row.targetSecondsPerMark).toBe(120);
    expect(row.actualSecondsPerMark).toBe(110);
    expect(row.medianRatio).toBe(1);
    expect(row.status).toBe("calibrated");
    expect(row.rushedAttempts).toBe(1);
    expect(row.onTargetAttempts).toBe(1);
    expect(row.slowAttempts).toBe(1);
    expect(row.accuracy).toBe(0.75);
    expect(row.topics[0]?.topicId).toBe("maths.algebra");
    expect(report.observations[0]?.timing).toBe("rushed");
  });

  it("falls back to the exam baseline for ordinary practice questions", () => {
    const ordinary = { ...question, id: "q2", paperId: undefined, totalMarks: 2 } as Question;
    const report = buildResponseTimeCalibration({
      subjects: [subject],
      papers: [],
      questions: [ordinary],
      attempts: [attempt("b1", 180_000, 2, ordinary.id)],
    });

    expect(report.observations[0]?.targetSecondsPerMark).toBe(DEFAULT_SECONDS_PER_MARK);
    expect(report.observations[0]?.ratio).toBe(1);
    expect(report.rows[0]?.status).toBe("insufficient-data");
  });

  it("keeps thin or missing timing evidence honest", () => {
    const report = buildResponseTimeCalibration({ subjects: [subject], papers: [], questions: [question], attempts: [] });

    expect(report.totalAttempts).toBe(0);
    expect(report.overall.status).toBe("insufficient-data");
    expect(report.overall.actualSecondsPerMark).toBeNull();
    expect(report.rows[0]?.quality).toBe("insufficient");
    expect(report.rows[0]?.recommendation).toContain("three marked questions");
  });
});
