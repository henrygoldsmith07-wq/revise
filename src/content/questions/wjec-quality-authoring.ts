import type { LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";
import { wjecCapabilityForSpecPoint } from "../wjec-subject-capabilities";

/** Formatting helper only. Prompts, reasoning, rubrics and solutions are authored
 * separately for every item; this helper never produces question variants.
 */
export function qualityItem(subject: "maths" | "biology" | "chemistry", topic: string, point: number,
  slug: string, demand: LearningDemand, family: string, reasoning: string,
  prompt: string, scheme: string[], answer: string): Question {
  const subjectId = `wjec-alevel-${subject}`;
  const specPoint = `${subjectId}.${topic}.sp-${String(point).padStart(2, "0")}`;
  const learning = { familyId: `${subject}:${family}`, contextId: `${subject}:${slug}`, demand, reasoningMoves: [reasoning] };
  return defineQuestion({ slug: `wjec-quality-${subject}-${slug}`, subjectId, topics: [topic], stem: prompt,
    kind: subject === "maths" || demand === "calculation" ? "calculation" : "short",
    source: "generated", verification: "unverified", reviewer: null, lastChecked: null,
    difficulty: demand === "recall" ? 1 : ["transfer", "synoptic"].includes(demand) ? 4 : 3,
    learning: { ...learning, expectedMinutes: Math.max(1, scheme.length * 1.25) },
    parts: [{ prompt, marks: scheme.length, scheme, answer, specPointIds: [specPoint],
      capabilityIds: [wjecCapabilityForSpecPoint(specPoint)!], learning,
      aos: demand === "recall" ? ["AO1"] : ["transfer", "synoptic"].includes(demand) ? ["AO2", "AO3"] : ["AO2"] }],
  });
}
