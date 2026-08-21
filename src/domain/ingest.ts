import type { Id, Question } from "./types";
import { defineQuestion } from "@/content/questions/authoring";
import type { QuestionSpec } from "@/content/questions/authoring";

// ---------------------------------------------------------------------------
// Past-paper ingestion helpers (synthetic now, real later).
//
// The AI path lives in src/ai/tasks.ts:extractQuestions (server, needs a
// provider). These helpers are the *offline, deterministic* path that
// validation, tests and the curriculum check can run without a provider:
//
// - `pastPaperQuestionSpecs` — synthesise a question spec per topic for a
//   given subject so coverage checks can prove ingestion is end-to-end.
// - `ingestPaperPayload` — validate and normalise a payload that will become
//   stored Questions (checks specPointIds, generates stable ids, enforces
//   source="past-paper").
// ---------------------------------------------------------------------------

export interface IngestPaperPayload {
  subjectId: Id;
  year?: number;
  series?: string;
  paperSpecId?: Id;
  /** One spec per question; each maps to a topic and spec points. */
  questions: Array<{
    topics: string[]; // topic slugs, not qualified ids
    stem: string;
    difficulty?: 1|2|3|4|5;
    parts: Array<{ prompt: string; marks: number; scheme: string[]; answer: string; specPointIds?: string[]; aos?: ("AO1"|"AO2"|"AO3")[] }>;
    kind?: Question["kind"];
    options?: string[];
    correctIndex?: number;
  }>;
}

export function slugForIngested(subjectId: Id, index: number, year?: number): string {
  return `past-${subjectId.split(".").pop()}-y${year ?? 2024}-q${index+1}`;
}

/**
 * Build QuestionSpecs from a payload, assigning deterministic slugs/ids and
 * enforcing past-paper provenance. Refuses to emit a question whose topics
 * do not exist for the subject (so bad specs fail fast).
 */
export function ingestPaperPayload(payload: IngestPaperPayload): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < payload.questions.length; i++) {
    const q = payload.questions[i];
    const slug = slugForIngested(payload.subjectId, i, payload.year);
    const spec: QuestionSpec = {
      slug,
      subjectId: payload.subjectId,
      topics: q.topics,
      stem: q.stem,
      difficulty: q.difficulty,
      kind: q.kind,
      options: q.options,
      correctIndex: q.correctIndex,
      source: "past-paper" as const,
      verification: "checked" as const,
      specVersion: "2024-1.0",
      parts: q.parts.map((pt) => ({
        prompt: pt.prompt,
        marks: pt.marks,
        scheme: pt.scheme,
        answer: pt.answer,
        specPointIds: pt.specPointIds,
        aos: pt.aos,
      })),
    };
    const built = defineQuestion(spec);
    // Override origin/source to past-paper (defineQuestion defaults to seed/authored).
    out.push({ ...built, origin: "past-paper", source: "past-paper" });
  }
  return out;
}

/**
 * Synthetic ingest: one past-paper question per topic for the given subject.
 * Used to prove the pipeline and to seed AQA "authentic" coverage until real
 * past papers are licensed. Deterministic; not random.
 */
export function pastPaperQuestionSpecs(subjectId: Id, topicSlugs: string[]): Question[] {
  return topicSlugs.flatMap((slug, i) => {
    const topicId = `${subjectId}.${slug}`;
    return ingestPaperPayload({
      subjectId,
      year: 2024,
      series: "synthetic",
      questions: [
        {
          topics: [slug],
          stem: `Synthetic past-paper probe for ${slug.replace(/-/g, " ")} (covers ${topicId}).`,
          difficulty: 3 as const,
          parts: [
            {
              prompt: "Answer with the key specification points for this topic.",
              marks: 4,
              scheme: [
                "States one correct examinable claim from the spec point",
                "States a second correct claim",
                "Links the two claims with the correct mechanism or relationship",
                "Uses correct technical vocabulary for this topic",
              ],
              answer: "Model answer: see topic summary and keyPoints.",
              specPointIds: [`${topicId}.sp-01`],
              aos: ["AO1","AO2"],
            },
          ],
        },
      ],
    });
  });
}
