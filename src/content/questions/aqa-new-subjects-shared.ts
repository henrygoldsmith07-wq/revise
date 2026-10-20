import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

// Shared shape for the starter banks of the subjects added beyond the four
// sciences and maths. Each part is
// [prompt, marks, scheme, model answer, spec point number in the topic, learning claim, AOs?].
// Original questions; none is copied from a past paper. Unreviewed.

export type NewSubjectPart = [prompt: string, marks: number, scheme: string[], answer: string, point: number, claim: string, aos?: AoCode[]];

export interface NewSubjectItem {
  slug: string;
  topic: string;
  stem: string;
  parts: NewSubjectPart[];
  kind?: QuestionKind;
  options?: string[];
  correctIndex?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  calculator?: boolean;
}

export function buildNewSubjectQuestions(subjectId: string, items: NewSubjectItem[]): Question[] {
  return defineQuestions(
    items.map((item) => ({
      slug: `${subjectId}-${item.slug}`,
      subjectId,
      topics: [item.topic],
      kind: item.kind,
      stem: item.stem,
      options: item.options,
      correctIndex: item.correctIndex,
      difficulty: item.difficulty ?? 2,
      calculator: item.calculator,
      source: "authored",
      verification: "unverified",
      lastChecked: "2026-10-20",
      specVersion: "2024-1.0",
      parts: item.parts.map(([prompt, marks, scheme, answer, point, claim, aos]) => ({
        prompt,
        marks,
        scheme,
        answer,
        aos: aos ?? (marks > 1 ? ["AO1", "AO2"] : ["AO1"]),
        specPointIds: [`${subjectId}.${item.topic}.sp-${String(point).padStart(2, "0")}`],
        learningClaims: [claim],
      })),
    })),
  );
}
