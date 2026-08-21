import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildAssessmentInsight } from "@/domain/assessment";
import type { Mistake } from "@/domain/types";

function mistake(id: string, category: Mistake["category"], overrides: Partial<Mistake> = {}): Mistake {
  return {
    id,
    userId: "local",
    subjectId: "physics",
    topicId: "physics.fields",
    marksLost: 2,
    description: "Lost marks",
    category,
    resolved: false,
    createdAt: "2026-08-18T09:00:00.000Z",
    ...overrides,
  };
}

describe("exam technique vs knowledge separation", () => {
  it("publishes the split on the central assessment insight", () => {
    const mistakes = Array.from({ length: 8 }, (_, i) =>
      mistake(`m-${i}`, "communication", {
        ao: "AO2",
        command: "explain",
        misconception: "misread-command",
        timing: "rushed",
      }),
    );
    const insight = buildAssessmentInsight({
      attempts: [],
      mistakes,
      mastery: [],
      questionsById: new Map(),
    });

    expect(insight.techniqueVsKnowledge).toMatchObject({
      techniqueLost: 16,
      knowledgeLost: 0,
      techniqueShare: 1,
      knowledgeShare: 0,
      reliable: true,
    });
    expect(insight.techniqueVsKnowledge.drivers).toEqual(expect.arrayContaining(["exam-technique", "rushing"]));
  });

  it("publishes an actionable Progress card instead of leaving the metric domain-only", () => {
    const progress = readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");
    const panels = readFileSync(join(process.cwd(), "src/components/AssessmentPanels.tsx"), "utf8");

    expect(progress).toContain("TechniqueVsKnowledgeCard");
    expect(panels).toContain("Exam technique vs knowledge");
    expect(panels).toContain("techniqueVsKnowledge");
  });
});
