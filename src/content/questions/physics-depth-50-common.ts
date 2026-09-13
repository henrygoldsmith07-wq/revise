import type { AoCode, LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

export const PHYSICS_SUBJECT = "wjec-alevel-physics" as const;

export type PhysicsDepthPart = {
  demand: LearningDemand;
  family: string;
  context: string;
  move: string;
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  aos?: AoCode[];
};

export type PhysicsDepthItem = {
  topic: string;
  point: number;
  parts: PhysicsDepthPart[];
};

/**
 * Build a question for one diagnosable capability and one specification point.
 * The content in the depth-50 packs is deliberately generated/unverified: it
 * expands the authoring queue but cannot create trusted mastery evidence until
 * a subject reviewer approves the exact fingerprint.
 */
export function depthQuestions(items: readonly PhysicsDepthItem[]): Question[] {
  return items.flatMap((item) => item.parts.map((part, index) => {
    const slug = `physics-depth50-${item.topic}-sp-${String(item.point).padStart(2, "0")}-${part.family.split(":").pop()}-${index}`;
    const specPoint = `${PHYSICS_SUBJECT}.${item.topic}.sp-${String(item.point).padStart(2, "0")}`;
    return defineQuestion({
      slug,
      subjectId: PHYSICS_SUBJECT,
      topics: [item.topic],
      kind: part.demand === "calculation" ? "calculation" : "short",
      stem: part.prompt,
      difficulty: part.demand === "recall" ? 1 : part.demand === "transfer" || part.demand === "synoptic" ? 4 : 3,
      calculator: part.demand === "calculation" || part.demand === "application",
      source: "generated",
      verification: "unverified",
      reviewer: null,
      lastChecked: null,
      specVersion: "2024-1.0",
      parts: [{
        prompt: part.prompt,
        marks: part.marks,
        scheme: part.scheme,
        answer: part.answer,
        aos: part.aos ?? (part.demand === "recall" ? ["AO1"] : ["AO2"]),
        specPointIds: [specPoint],
        capabilityIds: [`phys.${item.topic}.sp-${String(item.point).padStart(2, "0")}`],
        learningClaims: [part.move],
        learning: { familyId: part.family, contextId: part.context, demand: part.demand, reasoningMoves: [part.move] },
      }],
      learning: { familyId: part.family, contextId: part.context, demand: part.demand, expectedMinutes: Math.max(1, part.marks), reasoningMoves: [part.move] },
    });
  }));
}
