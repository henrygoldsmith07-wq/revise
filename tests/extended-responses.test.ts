import { describe, expect, it } from "vitest";
import { extendedResponseQuestions, seedQuestions } from "@/content";
import { getTopic } from "@/domain/curriculum";

const AUTHORED_A_LEVEL_SUBJECTS = [
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
  "wjec-alevel-maths",
  "wjec-alevel-physics",
  "aqa-alevel-biology",
  "aqa-alevel-chemistry",
  "aqa-alevel-maths",
  "aqa-alevel-physics",
  "ocr-alevel-biology",
  "ocr-alevel-chemistry",
  "ocr-alevel-maths",
  "ocr-alevel-physics",
] as const;

describe("extended-response content", () => {
  it("adds two new extended responses to every authored A-Level subject", () => {
    expect(extendedResponseQuestions).toHaveLength(24);
    expect(seedQuestions.filter((question) => question.id.includes("extended-response-")).length).toBe(24);
    for (const subjectId of AUTHORED_A_LEVEL_SUBJECTS) {
      expect(extendedResponseQuestions.filter((question) => question.subjectId === subjectId), subjectId).toHaveLength(2);
    }
  });

  it("keeps each response extended, markable and provenance-linked", () => {
    const ids = new Set<string>();
    for (const question of extendedResponseQuestions) {
      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id);
      expect(question.kind).toBe("extended");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.reviewer).toBe("authored/extended-response-review");
      expect(question.lastChecked).toBe("2026-08-18");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.totalMarks).toBeGreaterThanOrEqual(5);
      expect(question.parts.length).toBeGreaterThan(0);
      for (const part of question.parts) {
        expect(part.marks).toBeGreaterThanOrEqual(3);
        expect(part.markScheme.length).toBeGreaterThanOrEqual(3);
        expect(part.modelAnswer.length).toBeGreaterThan(20);
        expect(part.learningClaims?.length).toBeGreaterThan(0);
        for (const specPointId of part.specPointIds ?? []) {
          const topic = getTopic(question.topicIds[0]);
          expect(topic?.specPoints?.some((point) => point.id === specPointId), `${question.id} → ${specPointId}`).toBe(true);
        }
      }
    }
  });

  it("covers every discipline and includes multi-part extended responses", () => {
    for (const discipline of ["biology", "chemistry", "maths", "physics"]) {
      expect(extendedResponseQuestions.filter((question) => question.subjectId.endsWith(`-${discipline}`))).toHaveLength(6);
    }
    expect(extendedResponseQuestions.some((question) => question.parts.length > 1)).toBe(true);
  });
});
