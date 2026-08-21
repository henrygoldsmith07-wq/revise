import { describe, expect, it } from "vitest";
import { ocrAuthoredQuestions, seedQuestions } from "@/content";
import { getTopic } from "@/domain/curriculum";

const OCR_A_LEVEL_SUBJECTS = [
  "ocr-alevel-biology",
  "ocr-alevel-chemistry",
  "ocr-alevel-maths",
  "ocr-alevel-physics",
] as const;

describe("OCR authored content", () => {
  it("adds four mapped questions to each OCR A-Level subject", () => {
    expect(ocrAuthoredQuestions).toHaveLength(16);
    expect(seedQuestions.filter((question) => question.id.includes("ocr-authored-")).length).toBe(16);
    for (const subjectId of OCR_A_LEVEL_SUBJECTS) {
      expect(ocrAuthoredQuestions.filter((question) => question.subjectId === subjectId), subjectId).toHaveLength(4);
    }
  });

  it("keeps every OCR question markable and provenance-linked", () => {
    const ids = new Set<string>();
    for (const question of ocrAuthoredQuestions) {
      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id);
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.reviewer).toBe("authored/ocr-expansion-review");
      expect(question.lastChecked).toBe("2026-08-18");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.stem.length).toBeGreaterThan(20);
      for (const part of question.parts) {
        expect(part.markScheme.length).toBeGreaterThan(0);
        expect(part.modelAnswer.length).toBeGreaterThan(10);
        expect(part.specPointIds?.length).toBeGreaterThan(0);
        expect(part.learningClaims?.length).toBeGreaterThan(0);
        for (const specPointId of part.specPointIds ?? []) {
          const topic = getTopic(question.topicIds[0]);
          expect(topic?.specPoints?.some((point) => point.id === specPointId), `${question.id} → ${specPointId}`).toBe(true);
        }
      }
    }
  });

  it("includes OCR recall, calculation and extended-response formats", () => {
    expect(ocrAuthoredQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(ocrAuthoredQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(ocrAuthoredQuestions.some((question) => question.kind === "extended")).toBe(true);
  });
});
