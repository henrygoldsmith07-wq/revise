import { z } from "zod";
import { depthQuestions } from "./questions/physics-depth-50-common";
import { pipelineQuestion } from "./pipeline";
import { allTopics } from "@/domain/curriculum";
import { reasoningDepthQuestions } from "./questions/physics-reasoning-runtime";
import { subjectCapabilityRegistry } from "./capability-registry";
import type { Question } from "@/domain/types";

const text = z.string().min(1);
export const physicsDepthPartSchema = z.object({
  demand: z.enum(["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"]),
  family: text, context: text, move: text, prompt: text, answer: text,
  marks: z.number().int().positive(), scheme: z.array(text).min(1),
  aos: z.array(z.enum(["AO1", "AO2", "AO3"])).min(1).optional(),
}).strict().refine((row) => row.scheme.length === row.marks, "Each mark needs a scheme point.");
export const physicsDepthSourceSchema = z.object({
  topic: text, point: z.number().int().positive(), parts: z.array(physicsDepthPartSchema).min(1),
}).strict();

export const physicsReasoningSourceSchema = physicsDepthSourceSchema.extend({ capability: text.optional() });

/** Validate educational source and the resulting runtime object. Human trust
 * remains in the separate exact-fingerprint ledger; this cannot approve it. */
export function validateStructuredPhysics(sources: unknown[]) {
  const items = sources.map((source) => physicsDepthSourceSchema.parse(source));
  const questions = depthQuestions(items);
  validatePhysicsQuestions(questions);
  return items;
}

export function validateStructuredReasoning(sources: unknown[]) {
  const items = sources.map(source => physicsReasoningSourceSchema.parse(source));
  validatePhysicsQuestions(reasoningDepthQuestions(items));
  return items;
}

function validatePhysicsQuestions(questions: Question[]) {
  const specPoints = new Set(allTopics(["wjec-alevel-physics"]).flatMap((topic) => (topic.specPoints ?? []).map((point) => point.id)));
  const capabilities = new Set(subjectCapabilityRegistry.resolve("wjec-alevel-physics").map(node => node.id));
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.id)) throw new Error(`Duplicate question id: ${question.id}`);
    seen.add(question.id);
    const result = pipelineQuestion(question);
    if (!result.ok) throw new Error(`${question.id}: ${JSON.stringify(result)}`);
    for (const id of question.parts.flatMap((row) => row.specPointIds ?? [])) {
      if (!specPoints.has(id)) throw new Error(`${question.id}: unknown specification point ${id}`);
    }
    for (const id of question.parts.flatMap(row => row.capabilityIds ?? [])) {
      if (!capabilities.has(id)) throw new Error(`${question.id}: unknown capability ${id}`);
    }
    if (question.verification !== "unverified" || question.reviewer !== null || question.lastChecked !== null) {
      throw new Error("Structured drafts cannot manufacture human verification.");
    }
  }
}
