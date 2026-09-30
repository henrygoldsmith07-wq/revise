import { z } from "zod";
import { depthQuestions } from "./questions/physics-depth-50-common";
import { pipelineQuestion } from "./pipeline";
import { allTopics } from "@/domain/curriculum";

const text = z.string().min(1);
const part = z.object({
  demand: z.enum(["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"]),
  family: text, context: text, move: text, prompt: text, answer: text,
  marks: z.number().int().positive(), scheme: z.array(text).min(1),
  aos: z.array(z.enum(["AO1", "AO2", "AO3"])).min(1).optional(),
}).strict().refine((row) => row.scheme.length === row.marks, "Each mark needs a scheme point.");
export const physicsDepthSourceSchema = z.object({
  topic: text, point: z.number().int().positive(), parts: z.array(part).min(1),
}).strict();

/** Validate educational source and the resulting runtime object. Human trust
 * remains in the separate exact-fingerprint ledger; this cannot approve it. */
export function validateStructuredPhysics(sources: unknown[]) {
  const items = sources.map((source) => physicsDepthSourceSchema.parse(source));
  const questions = depthQuestions(items);
  const specPoints = new Set(allTopics(["wjec-alevel-physics"]).flatMap((topic) => (topic.specPoints ?? []).map((point) => point.id)));
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.id)) throw new Error(`Duplicate question id: ${question.id}`);
    seen.add(question.id);
    const result = pipelineQuestion(question);
    if (!result.ok) throw new Error(`${question.id}: ${JSON.stringify(result)}`);
    for (const id of question.parts.flatMap((row) => row.specPointIds ?? [])) {
      if (!specPoints.has(id)) throw new Error(`${question.id}: unknown specification point ${id}`);
    }
    if (question.verification !== "unverified" || question.reviewer !== null || question.lastChecked !== null) {
      throw new Error("Structured drafts cannot manufacture human verification.");
    }
  }
  return items;
}
