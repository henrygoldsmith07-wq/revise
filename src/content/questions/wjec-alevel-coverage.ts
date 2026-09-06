import { topicsFor } from "@/domain/curriculum";
import type { Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

const WJEC_ALEVEL_SUBJECTS = [
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
  "wjec-alevel-physics",
  "wjec-alevel-maths",
] as const;

type CoverageFamily = {
  id: "data" | "source" | "transfer";
  prefix: "Data:" | "Source extract:" | "Unfamiliar context:";
  reviewer: string;
  kind: QuestionKind;
};

/**
 * The four flagship packs have a deliberately broad set of generated-style
 * question families. When a new WJEC topic is added, it must receive one
 * member of each family too; otherwise topic-level practice silently falls
 * behind the curriculum. These are short authored coverage prompts, while the
 * deeper four-part questions live in wjec-alevel-expansion.ts.
 */
export function wjecAlevelCoverageQuestions(family: CoverageFamily): Question[] {
  const topics = WJEC_ALEVEL_SUBJECTS.flatMap((subjectId) =>
    topicsFor(subjectId).filter((topic) =>
      topic.unitId.includes(".unit") ||
      topic.unitId.includes("extension") ||
      topic.unitId.includes("modelling-mechanics") ||
      topic.unitId.includes("probability-context"),
    ),
  );

  return defineQuestions(
    topics.map((topic) => {
      const topicSlug = topic.id.slice(topic.subjectId.length + 1);
      const point = topic.specPoints?.[0];
      const keyPoint = topic.keyPoints[0] ?? point?.text ?? topic.summary;
      return {
        slug: `wjec-alevel-${family.id}-coverage-${topicSlug}`,
        subjectId: topic.subjectId,
        topics: [topicSlug],
        kind: family.kind,
        stem: `${family.prefix} ${topic.title}: ${topic.summary}`,
        difficulty: topic.intrinsicDifficulty,
        calculator: true,
        source: "authored" as const,
        verification: "checked" as const,
        reviewer: family.reviewer,
        lastChecked: "2026-09-06",
        specVersion: "2024-1.0",
        parts: [
          {
            prompt: `Use the ${topic.title.toLowerCase()} evidence to explain the first examinable requirement.`,
            marks: 2,
            scheme: [
              point?.text ?? `Accurately explains ${topic.title.toLowerCase()}`,
              "Links the idea to the context rather than listing an unsupported fact",
            ],
            answer: keyPoint,
            aos: ["AO2"],
            specPointIds: [point?.id ?? `${topic.id}.sp-01`],
            learningClaims: [point?.text ?? keyPoint],
          },
        ],
      };
    }),
  );
}
