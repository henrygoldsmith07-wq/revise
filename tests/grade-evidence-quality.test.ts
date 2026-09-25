import { describe, expect, it } from "vitest";
import { predictGrade } from "@/domain/grades";
import type { Attempt, Question, Subject, TopicMastery } from "@/domain/types";

const subject: Subject = {
  id: "science", qualificationId: "gcse", name: "Science",
  papers: [{ id: "p1", name: "Paper 1", weight: 1, durationMinutes: 90, calculatorAllowed: true }],
  gradeBoundaries: [{ grade: "A", percent: 80 }, { grade: "B", percent: 70 },
    { grade: "C", percent: 60 }, { grade: "D", percent: 50 }, { grade: "U", percent: 0 }],
};
const mastery: TopicMastery[] = [{
  topicId: "t", subjectId: subject.id, mastery: 0.5, retention: 0.5, confidence: 0.5,
  cardsTotal: 0, cardsDue: 0, attempts: 0, accuracy: 0, lastStudiedAt: null, weak: false,
}];
const attempt = (id: string, overrides: Partial<Attempt> = {}): Attempt => ({
  id, userId: "u", questionId: id, subjectId: subject.id, topicIds: ["t"],
  answers: {}, marked: [], awarded: 9, max: 10, feedback: "", markedBy: "rubric",
  elapsedMs: 60_000, mode: "practice", createdAt: "2026-09-01T12:00:00.000Z", ...overrides,
});
const question = (id: string, familyId: string): Question => ({
  id, subjectId: subject.id, topicIds: ["t"], kind: "short", stem: id, parts: [],
  totalMarks: 10, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-09-01T12:00:00.000Z",
  learning: { familyId, contextId: id, demand: "application", expectedMinutes: 5 },
});

describe("grade forecast evidence quality", () => {
  it("keeps mastery-only estimates provisional and names their uncertainty", () => {
    const prediction = predictGrade(subject, [{ ...mastery[0], mastery: 0.9 }], [], [], "2026-09-25");
    expect(prediction.evidenceLevel).toBe("limited");
    expect(prediction.percent).toBeLessThan(75);
    expect(prediction.uncertaintySources).toContain("No timed paper evidence yet.");
    expect(prediction.bestCase).not.toBe(prediction.worstCase);
  });

  it("weights a recorded timed paper more than one practice question", () => {
    const practice = predictGrade(subject, mastery, [attempt("practice")], [], "2026-09-25");
    const timed = predictGrade(subject, mastery,
      [attempt("timed", { mode: "paper", paperRunId: "run-1" })], [], "2026-09-25");
    expect(timed.percent).toBeGreaterThan(practice.percent);
    expect(timed.assessmentEvidence?.timedPapers).toBe(1);
    expect(practice.assessmentEvidence?.timedPapers).toBe(0);
  });

  it("limits copied and repeated-family success as predictive evidence", () => {
    const independent = predictGrade(subject, mastery, [attempt("a")], [], "2026-09-25");
    const copied = predictGrade(subject, mastery,
      [attempt("a", { copiedAnswer: true, hintTier: "worked-solution" })], [], "2026-09-25");
    expect(copied.percent).toBeLessThan(independent.percent);

    const sameFamily = predictGrade(subject, mastery,
      [attempt("a"), attempt("b")], [], "2026-09-25",
      [question("a", "family-1"), question("b", "family-1")]);
    const differentFamilies = predictGrade(subject, mastery,
      [attempt("a"), attempt("b")], [], "2026-09-25",
      [question("a", "family-1"), question("b", "family-2")]);
    expect(sameFamily.assessmentEvidence!.effectiveSamples)
      .toBeLessThan(differentFamilies.assessmentEvidence!.effectiveSamples);
  });
});