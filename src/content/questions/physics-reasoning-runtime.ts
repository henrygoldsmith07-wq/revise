import type { AoCode, LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

const S = "wjec-alevel-physics";

/**
 * Reasoning-depth pack: closes the highest-value WJEC Physics capability×demand
 * cells left in the authoring queue. Every part is an original, self-contained
 * exam-style item mapped to exactly one capability and one demand, with an
 * authored family, context and reasoning move, and — for calculation parts — a
 * distinct solution method, so two parts of the same demand are genuinely
 * different ways of examining the skill rather than number swaps.
 *
 * Worked solutions state numerical steps and units; nothing here is
 * copied from a live paper. Content remains `unverified` until a reviewer signs
 * the six-check attestation — this pack adds authoring, never approvals.
 */

export type DepthPart = {
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

export type DepthItem = { topic: string; point: number; capability?: string; parts: DepthPart[] };

const point = (n: number) => `sp-${String(n).padStart(2, "0")}`;

export function reasoningDepthQuestions(items: DepthItem[]): Question[] {
  return items.flatMap((item) =>
  item.parts.map((part, index) =>
    defineQuestion({
      slug: `physics-depth-${item.topic}-${point(item.point)}-${part.family.split(":").pop()}-${index}`,
      subjectId: S,
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
        aos: part.aos ?? (part.demand === "recall" ? ["AO1"] : ["AO2"] as const),
        specPointIds: [`${S}.${item.topic}.${point(item.point)}`],
        capabilityIds: [item.capability ?? `phys.${item.topic}.${point(item.point)}`],
        learningClaims: [part.move],
        learning: { familyId: part.family, contextId: part.context, demand: part.demand, reasoningMoves: [part.move] },
      }],
      learning: { familyId: part.family, contextId: part.context, demand: part.demand, expectedMinutes: Math.max(1, part.marks), reasoningMoves: [part.move] },
    }),
  ),
);

}
