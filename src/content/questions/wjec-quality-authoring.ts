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
  // Keep the convenience helper honest: if an author accidentally passes one
  // of the old shared-template cues, the cell is a scaffold until it is
  // rewritten with a concrete target and worked evidence. Real quality-pack
  // rows contain their own values, structures and reasoning and therefore
  // remain substantive.
  const authoredText = `${prompt}\n${scheme.join("\n")}\n${answer}`;
  const hasConcreteValues = /\d|[=→⟶]|\b(?:cm|mm|m|s|kg|g|mol|dm|Pa|J|K|°C|%|probability|concentration|mass|volume|rate|data|sample)\b/i.test(prompt);
  const hasConcreteTarget = /(?:\b[A-Za-z]\s*\([^)]*\)\s*=|\b[A-Za-z](?:['′]\s*)?\s*=|\b[A-Za-z]\s*\([^)]*\)|\bP\s*\([^)]*\)|\b(?:probability|gradient|derivative|integral|root|concentration|amount|ratio|percentage|rate|mass|volume|force|energy|yield|purity|uncertainty|titre|titration)\b)/i.test(prompt);
  const hasAuthoredOperation = /\b(?:differentiat\w*|integrat\w*|substitut\w*|rearrang\w*|solv\w*|calculat\w*|convert\w*|divid\w*|multipl\w*|ratio|fraction|gradient|probabil\w*|stoichiometr\w*|equation|formula|mechanism|causal|deriv\w*|power\s+rule|chain\s+rule|mole|charge|balance)\b/i.test(authoredText);
  const fallbackMatch = /appropriate method|stated (?:value|context|constraint|conditions?)|requested (?:value|quantity|result)|target (?:value|quantity|result)|trace\b[^.\n]{0,80}\bto\s+(?:the\s+)?target|cross-check\b[^.\n]{0,80}\binvariant|complete (?:answer|response) must|according to (?:the|your) (?:brief|metadata|mapping)|\bcombine\s+(?:this|the)\s+(?:idea|concept|result)\b[^.\n]{0,80}\b(?:another|a second|an additional)\s+(?:idea|concept|result)\b|(?:the|a|an)\s+(?:relationship|method|concept|invariant)\s+(?:above|given|stated)|(?:the|a|an)\s+(?:diagram|figure|apparatus|spectrum|micrograph|circuit)\s+(?:above|below|shown|provided)|(?:from|in|per)\s+(?:the\s+)?(?:author(?:ing)?\s+)?(?:metadata|brief|mapping|notes?|record)|\b(?:reasoning\s+move|family\s+id|context\s+id|capability\s+mapping|spec(?:ification)?\s+mapping)\b|\{\{[^}]+\}\}|<\s*(?:value|quantity|target|data|variable|compound|organism)\s*>|\[(?:value|quantity|target|data|variable|compound|organism)\]/i.test(authoredText);
  // A generic cue is scaffold only while it remains uninstantiated. If a
  // concrete operation, data and target surround it, the author has supplied
  // enough evidence for the substantive gate to judge the cell itself.
  const genericInstantiated = hasConcreteValues && hasConcreteTarget && hasAuthoredOperation &&
    !/according to (?:the|your) (?:brief|metadata|mapping)/i.test(authoredText) &&
    !/\bcombine\s+(?:this|the)\s+(?:idea|concept|result)\b[^.\n]{0,80}\b(?:another|a second)\s+(?:idea|concept|result)\b/i.test(authoredText);
  const likelyScaffold = fallbackMatch && !genericInstantiated;
  const learning = { familyId: `${subject}:${family}`, contextId: `${subject}:${slug}`, demand, reasoningMoves: [reasoning], quality: likelyScaffold ? "scaffold" as const : "substantive" as const };
  return defineQuestion({ slug: `wjec-quality-${subject}-${slug}`, subjectId, topics: [topic], stem: prompt,
    kind: subject === "maths" || demand === "calculation" ? "calculation" : "short",
    source: "generated", verification: "unverified", reviewer: null, lastChecked: null,
    difficulty: demand === "recall" ? 1 : ["transfer", "synoptic"].includes(demand) ? 4 : 3,
    learning: { ...learning, expectedMinutes: Math.max(1, scheme.length * 1.25) },
    parts: [{ prompt, marks: scheme.length, scheme, answer, specPointIds: [specPoint],
      capabilityIds: [wjecCapabilityForSpecPoint(specPoint)!], learning,
      learningClaims: demand === "synoptic" ? [prompt, `${family} dependency`] : undefined,
      aos: demand === "recall" ? ["AO1"] : ["transfer", "synoptic"].includes(demand) ? ["AO2", "AO3"] : ["AO2"] }],
  });
}
