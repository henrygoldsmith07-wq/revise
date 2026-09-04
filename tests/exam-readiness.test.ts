import { describe, expect, it } from "vitest";
import { getSubject } from "@/domain/curriculum";
import { buildExamReadiness, summariseExamReadiness } from "@/domain/exam-readiness";
import type { GradePrediction } from "@/domain/grades";

const SUBJECT = getSubject("wjec-alevel-chemistry")!;

function prediction(overrides: Partial<GradePrediction> = {}): GradePrediction {
  return {
    subjectId: SUBJECT.id,
    percent: 74,
    grade: "A",
    bestCase: "A",
    worstCase: "C",
    confidence: 0.75,
    trend: 0,
    headroom: [],
    ...overrides,
  };
}

function readiness(overrides: Partial<Parameters<typeof buildExamReadiness>[0]> = {}) {
  return buildExamReadiness({
    subject: SUBJECT,
    prediction: prediction(),
    targetGrade: "A",
    examDays: 42,
    coverage: { average: 0.82, topics: 10, evidencedTopics: 9 },
    retention: { average: 0.86, cards: 80, reviews: 24 },
    timed: { accuracy: 0.84, attempts: 10, marks: 48 },
    pace: { ratio: 1, attempts: 8 },
    transfer: { passRate: 0.9, completed: 3, due: 0 },
    ...overrides,
  });
}

describe("Exam Readiness Passport", () => {
  it("is ready only when broad evidence agrees with the forecast", () => {
    const row = readiness();

    expect(row.status).toBe("ready");
    expect(row.score).toBeGreaterThanOrEqual(0.78);
    expect(row.confidence).toBeGreaterThanOrEqual(0.65);
    expect(row.blockers.filter((blocker) => blocker.severity === "high")).toHaveLength(0);
    expect(row.signals.every((signal) => signal.status === "strong" || signal.status === "watch")).toBe(true);
  });

  it("keeps low-evidence subjects honest instead of calling them ready", () => {
    const row = readiness({
      prediction: prediction({ percent: 74, grade: "A" }),
      coverage: { average: 0, topics: 10, evidencedTopics: 0 },
      retention: { average: null, cards: 0, reviews: 0 },
      timed: { accuracy: null, attempts: 0, marks: 0 },
      pace: { ratio: null, attempts: 0 },
      transfer: { passRate: null, completed: 0, due: 2 },
    });

    expect(row.status).toBe("building-evidence");
    expect(row.confidence).toBeLessThan(0.35);
    expect(row.signals.filter((signal) => signal.status === "missing").length).toBeGreaterThanOrEqual(4);
    expect(row.blockers.some((blocker) => blocker.key === "evidence")).toBe(true);
  });

  it("surfaces the exact proof blockers behind a grade gap", () => {
    const row = readiness({
      prediction: prediction({ percent: 54, grade: "C", confidence: 0.6 }),
      coverage: { average: 0.48, topics: 10, evidencedTopics: 3 },
      retention: { average: 0.58, cards: 12, reviews: 6 },
      timed: { accuracy: 0.52, attempts: 4, marks: 20 },
      pace: { ratio: 1.7, attempts: 4 },
      transfer: { passRate: 0.4, completed: 2, due: 1 },
    });

    expect(row.gapPercent).toBeGreaterThan(0);
    expect(row.blockers.map((blocker) => blocker.key)).toEqual(expect.arrayContaining([
      "target",
      "coverage",
      "accuracy",
      "retention",
      "pace",
      "transfer",
    ]));
    expect(row.nextAction.action).toBe("practice");
  });

  it("summarises the weakest subject without hiding an at-risk passport", () => {
    const strong = readiness();
    const weak = readiness({
      prediction: prediction({ subjectId: "wjec-alevel-chemistry", percent: 45, grade: "D", confidence: 0.7 }),
      coverage: { average: 0.4, topics: 10, evidencedTopics: 4 },
      retention: { average: 0.5, cards: 20, reviews: 10 },
      timed: { accuracy: 0.45, attempts: 8, marks: 30 },
      pace: { ratio: 1.5, attempts: 8 },
      transfer: { passRate: 0.4, completed: 3, due: 0 },
    });

    const summary = summariseExamReadiness([strong, weak]);

    expect(summary.subjectCount).toBe(2);
    expect(summary.atRiskCount).toBe(1);
    expect(summary.weakestSubjectId).toBe(weak.subjectId);
    expect(summary.status).toBe("at-risk");
    expect(summary.blockerCount).toBeGreaterThan(0);
  });
});

