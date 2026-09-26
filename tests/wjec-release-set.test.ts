import { describe, expect, it } from "vitest";
import {
  isSeedWjecReleaseQuestion,
  seedQuestions,
  seedWjecReleaseQuestionIds,
  seedWjecReleaseSetIssues,
} from "@/content";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { resolveWjecReleaseSet } from "@/domain/wjec-release-set";

describe("WJEC release-set manifest", () => {
  it("contains a valid explicit initial candidate set without implying approval", () => {
    expect(seedWjecReleaseSetIssues.filter((issue) => issue.blocking)).toEqual([]);
    expect(seedWjecReleaseQuestionIds.size).toBe(40);
    for (const flagship of FLAGSHIP_SUBJECTS) {
      const rows = seedQuestions.filter((question) =>
        question.subjectId === flagship.subjectId && isSeedWjecReleaseQuestion(question));
      expect(rows).toHaveLength(10);
      expect(rows.every((question) => question.verification !== "verified")).toBe(true);
    }
  });

  it("fails closed on unknown, duplicate and cross-subject ids", () => {
    const maths = seedQuestions.find((question) => question.subjectId === "wjec-alevel-maths")!;
    const result = resolveWjecReleaseSet(seedQuestions, {
      formatVersion: 1,
      subjects: {
        "wjec-alevel-physics": [maths.id, maths.id, "missing-question"],
      },
    });
    expect(result.issues.filter((issue) => issue.blocking).map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["subject-mismatch", "duplicate-question", "unknown-question"]),
    );
  });
});
