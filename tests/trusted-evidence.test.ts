import { describe, expect, it } from "vitest";
import { trustedSnapshotAttempt, trustedSnapshotMistake } from "@/state/trusted-evidence";
import type { Attempt, Mistake } from "@/domain/types";

const WJEC_SUBJECTS = [
  "wjec-alevel-physics",
  "wjec-alevel-maths",
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
] as const;

function attempt(subjectId: string): Attempt {
  return {
    id: `attempt-${subjectId}`,
    userId: "learner",
    questionId: `missing-${subjectId}`,
    subjectId,
    topicIds: [`${subjectId}.topic`],
    mode: "practice",
    answers: {},
    marked: [],
    awarded: 1,
    max: 1,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 30_000,
    createdAt: "2026-09-26T12:00:00Z",
  };
}

function mistake(subjectId: string, source: Attempt): Mistake {
  return {
    id: `mistake-${subjectId}`,
    userId: "learner",
    subjectId,
    topicId: `${subjectId}.topic`,
    questionId: source.questionId,
    attemptId: source.id,
    marksLost: 1,
    description: "Test mistake",
    category: "method",
    resolved: false,
    createdAt: "2026-09-26T12:01:00Z",
  };
}

describe("snapshot trust boundary", () => {
  it.each(WJEC_SUBJECTS)("fails closed for missing %s questions", (subjectId) => {
    const row = attempt(subjectId);
    expect(trustedSnapshotAttempt(row, [], [row])).toBe(false);
    expect(trustedSnapshotMistake(mistake(subjectId, row), [], [row])).toBe(false);
  });

  it("preserves legacy evidence for subjects outside the WJEC review gate", () => {
    const row = attempt("aqa-gcse-biology");
    expect(trustedSnapshotAttempt(row, [], [row])).toBe(true);
    expect(trustedSnapshotMistake(mistake(row.subjectId, row), [], [row])).toBe(true);
  });

  it("does not let a mistake borrow trust from a different question's attempt", () => {
    const row = attempt("wjec-alevel-maths");
    const wrong = mistake(row.subjectId, row);
    wrong.questionId = "another-question";
    expect(trustedSnapshotMistake(wrong, [], [row])).toBe(false);
  });
});
