import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getSubject } from "@/domain/curriculum";
import { buildExamReadiness } from "@/domain/exam-readiness";
import { outlookRows } from "@/domain/exam-outlook";
import { predictGrade, REFERENCE_TIER_UNCERTAINTY, type GradePrediction } from "@/domain/grades";
import { isProofCapable } from "@/domain/trust-label";
import { trustedAssessmentContent } from "@/domain/content-trust";
import type { Attempt, Question, Subject } from "@/domain/types";

// Reference-tier subjects pass the permissive trustedAssessmentContent (they
// have no review gate). That is right for practice and supply, but it must not
// turn into an exam-readiness, exam-prediction or proof claim. These tests
// fail on the code before this change.

const REFERENCE = "aqa-alevel-biology";
const FLAGSHIP = "wjec-alevel-chemistry";

function prediction(subjectId: string, overrides: Partial<GradePrediction> = {}): GradePrediction {
  return { subjectId, percent: 74, grade: "A", bestCase: "A", worstCase: "B", confidence: 0.9, trend: 0, headroom: [], ...overrides };
}

function attempt(subjectId: string, i: number): Attempt {
  return {
    id: `a${i}`, userId: "u", questionId: `q${i}`, subjectId, topicIds: ["t"], answers: {}, marked: [],
    awarded: 4, max: 5, feedback: "", markedBy: "rubric", elapsedMs: 60_000, mode: "practice",
    createdAt: "2026-09-01T12:00:00Z",
  };
}

function readiness(subject: Subject) {
  return buildExamReadiness({
    subject,
    prediction: prediction(subject.id, { confidence: 0.75 }),
    targetGrade: "A",
    examDays: 42,
    coverage: { average: 0.82, topics: 10, evidencedTopics: 9 },
    retention: { average: 0.86, cards: 80, reviews: 24 },
    timed: { accuracy: 0.84, attempts: 10, marks: 48 },
    pace: { ratio: 1, attempts: 8 },
    transfer: { passRate: 0.9, completed: 3, due: 0 },
  });
}

describe("reference-tier evidence never reads as exam-ready", () => {
  it("caps a reference subject at nearly-ready on evidence that makes a flagship ready", () => {
    const flagship = readiness(getSubject(FLAGSHIP)!);
    expect(flagship.status).toBe("ready");
    expect(flagship.referenceTier).toBe(false);

    const reference = getSubject(REFERENCE);
    expect(reference).toBeTruthy();
    const row = readiness(reference!);
    expect(row.referenceTier).toBe(true);
    expect(row.status).not.toBe("ready");
    expect(row.status).toBe("nearly-ready");
  });
});

describe("reference-tier outlook is a practice estimate, never an exam prediction", () => {
  it("is always provisional and flagged, however much evidence there is", () => {
    const attempts = Array.from({ length: 12 }, (_, i) => attempt(REFERENCE, i));
    const [row] = outlookRows([prediction(REFERENCE)], attempts);
    expect(row?.independentAttempts).toBe(12);
    expect(row?.referenceTier).toBe(true);
    expect(row?.provisional).toBe(true);
  });

  it("does not flag flagship rows as reference tier", () => {
    const [row] = outlookRows([prediction(FLAGSHIP)], []);
    expect(row?.referenceTier).toBe(false);
  });

  it("Today's outlook, the trajectory and the knowledge map label reference bands honestly", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    expect(read("src/components/ExamOutlook.tsx")).toContain("row.referenceTier");
    expect(read("src/components/ExamOutlook.tsx")).toContain("so this is not an exam prediction");
    expect(read("src/domain/exam-trajectory.ts")).toContain("position.referenceTier");
    expect(read("src/components/KnowledgeMap.tsx")).toContain("outlook.referenceTier");
    expect(read("src/components/ExamReadinessCard.tsx")).toContain("row.referenceTier");
  });
});

describe("reference-tier grade estimates name their weakness", () => {
  it("adds the reference-material uncertainty only for non-flagship subjects", () => {
    const reference = getSubject(REFERENCE)!;
    const flagship = getSubject(FLAGSHIP)!;
    expect(predictGrade(reference, [], [], [], "2026-09-25").uncertaintySources).toContain(REFERENCE_TIER_UNCERTAINTY);
    expect(predictGrade(flagship, [], [], [], "2026-09-25").uncertaintySources).not.toContain(REFERENCE_TIER_UNCERTAINTY);
  });
});

describe("isProofCapable follows learner-evidence trust", () => {
  const question = (subjectId: string): Question => ({
    id: "q", subjectId, topicIds: ["t"], kind: "short", stem: "State it.", totalMarks: 1, calculatorAllowed: false, difficulty: 2,
    origin: "seed", createdAt: "2026-09-01T12:00:00Z",
    parts: [{ id: "q:a", label: "", prompt: "State it.", marks: 1, markScheme: ["a"], modelAnswer: "m" }],
  } as Question);

  it("never calls unseen reference-tier content proof-capable", () => {
    const reference = question("ocr-gcse-maths");
    expect(trustedAssessmentContent(reference)).toBe(true);
    expect(isProofCapable(reference, new Set())).toBe(false);
  });

  it("never calls an unreviewed flagship question proof-capable", () => {
    expect(isProofCapable(question("wjec-alevel-maths"), new Set())).toBe(false);
  });
});
