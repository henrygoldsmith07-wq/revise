import { validateCommandWord, type CommandWordValidation } from "./command-word-validation";
import type { UserSettings } from "./types";

import type { TechniqueDrillId, TechniqueDrillSubmission } from "./types-technique-drills";
export type { TechniqueDrillId, TechniqueDrillSubmission } from "./types-technique-drills";
export interface TechniqueDrill {
  id: TechniqueDrillId;
  title: string;
  prompt: string;
  guidance: string;
  example: string;
}

/** Fictional, generic writing exercises: not an approved science question bank. */
export const TECHNIQUE_CONTEXT = "A fictional library tried a second staffed help desk. Before the trial, the mean wait was 12 minutes; during it, the mean wait was 8 minutes. The trial lasted one day and the visitor numbers differed. Assume two staffed desks can handle two requests at the same time; this is a proposed reason, not something the waiting-time data alone proves.";
export const TECHNIQUE_DRILLS: readonly TechniqueDrill[] = [
  { id: "describe", title: "Describe", prompt: "Describe the change in mean waiting time using the supplied observations.", guidance: "Write what changed, including a comparison and the supplied values. Do not replace the observation with a reason.", example: "The mean wait decreases from 12 minutes to 8 minutes, a decrease of 4 minutes." },
  { id: "explain", title: "Explain", prompt: "Explain how a second staffed desk could reduce the wait, using the supplied assumption. Separate the proposed reason from the observation.", guidance: "Link a reason to its consequence. An observation by itself is not an explanation; the trial alone does not prove the reason.", example: "A second staffed desk could reduce the wait because two requests can be handled at the same time, so the queue could clear faster. The data alone does not prove that this caused the change." },
  { id: "evaluate", title: "Evaluate", prompt: "Evaluate whether the library should keep the second staffed desk. Use the data, a limitation and a reasoned judgement.", guidance: "Weigh evidence and limitations, then state what you would decide and why. Do not merely list advantages.", example: "The mean wait fell from 12 to 8 minutes, a decrease of 4 minutes. However, visitor numbers differed and the trial lasted only one day. Overall, I would extend the trial before deciding because the evidence may not represent a normal week." },
  { id: "six-mark", title: "6-mark structure", prompt: "Evaluate the library trial in a plan for an extended response. Practise a 6-mark-style structure, not six isolated facts.", guidance: "Use the question's command word, connect evidence to reasoning, include a limitation and end with a justified judgement. The real exam question and scheme decide what earns marks; six bullets do not guarantee six marks.", example: "Position: extend the trial before a final decision.\nEvidence: the mean wait fell from 12 to 8 minutes.\nReasoning: two staffed desks could handle requests simultaneously, because more requests can be served at once.\nLimitation: however, visitor numbers differed and only one day was measured.\nJudgement: overall, repeat the trial on comparable days because the present evidence is limited." },
];

export interface TechniqueCheck {
  id: string;
  label: string;
  detected: boolean;
  nextStep: string;
}
export interface TechniqueFeedback {
  command: CommandWordValidation;
  checks: TechniqueCheck[];
  disclaimer: string;
}

/** Reuses the existing response-shape check. Signals are hints, never marks. */
export function checkTechniqueDrill(id: TechniqueDrillId, answer: string): TechniqueFeedback {
  const drill = TECHNIQUE_DRILLS.find((candidate) => candidate.id === id)!;
  const command = validateCommandWord({ stem: drill.prompt }, { prompt: drill.prompt }, answer);
  const checks: TechniqueCheck[] = [];
  const add = (key: string, label: string, detected: boolean, nextStep: string) => checks.push({ id: key, label, detected, nextStep });
  add("response", "A response was written", Boolean(answer.trim()), "Write a response before checking its structure.");
  if (id !== "explain") add("data", "Supplied waiting-time values mentioned", /\b12\b/.test(answer) && /\b8\b/.test(answer), "Refer to the supplied 12-minute and 8-minute means; check the direction yourself.");
  if (id === "describe") {
    add("observation", "Observation wording", command.evidence.includes("observation"), "Say what changes, rather than only giving a reason.");
  } else if (id === "explain" || id === "six-mark") {
    add("reason", "An explicit reason link", /\b(because|therefore|since|due to|so that|as a result)\b/i.test(answer), "Link a proposed reason to the result, not just a statement that the wait changed.");
  }
  if (id === "evaluate" || id === "six-mark") {
    add("balance", "Balance or limitation wording", command.evidence.includes("balance"), "Include a limitation and explain why it affects the decision.");
    add("judgement", "Overall judgement wording", command.evidence.includes("judgement"), "Finish with a decision supported by the evidence and its limits.");
  }
  if (id === "six-mark") {
    const sections = answer.split(/\n+|(?<=[.!?])\s+/).filter((line) => line.trim());
    add("structure", "Several sentences or plan sections", sections.length >= 3, "Separate evidence, reasoning and judgement into a readable sequence; length is not quality.");
  }
  return { command, checks, disclaimer: "Heuristic structure feedback only. Matching a word does not prove the reasoning is correct; different wording may be valid. No mark, mastery or content approval is awarded." };
}

/** Defensive read of an optional addition to the existing settings row. */
export function techniqueDrillHistory(settings: UserSettings): TechniqueDrillSubmission[] {
  const value: unknown = settings.techniqueDrillHistory;
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((entry): entry is TechniqueDrillSubmission => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<TechniqueDrillSubmission>;
    if (typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id) || !TECHNIQUE_DRILLS.some((drill) => drill.id === candidate.drillId) || typeof candidate.submittedAt !== "string" || !Number.isFinite(Date.parse(candidate.submittedAt)) || !Array.isArray(candidate.detectedChecks) || !candidate.detectedChecks.every((signal) => typeof signal === "string")) return false;
    ids.add(candidate.id);
    return true;
  }).slice(-30);
}

/** Local-first settings/outbox persistence; uses existing last-write-wins sync. */
export function techniqueSubmissionPatch(settings: UserSettings, submission: TechniqueDrillSubmission): Partial<UserSettings> {
  return { techniqueDrillHistory: [...techniqueDrillHistory(settings).filter((entry) => entry.id !== submission.id), submission].slice(-30) };
}
