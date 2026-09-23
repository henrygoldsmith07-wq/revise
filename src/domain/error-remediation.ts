// Remediation + scheduling signals for the error taxonomy.
// The point of diagnosis is what happens AFTER the mistake.

import type { ErrorCategory } from "./error-taxonomy";

export type RemediationKind =
  | "targeted-explanation"
  | "worked-scaffold"
  | "definition-recall"
  | "exam-technique"
  | "content-retrieval"
  | "focused-practice"
  | "review";

export interface RemediationMapping {
  kind: RemediationKind;
  action: string;
  minutes: number;
}

export const ERROR_TO_REMEDIATION: Record<ErrorCategory, RemediationMapping> = {
  misconception: { kind: "targeted-explanation", action: "Confront the wrong idea, then answer one targeted question.", minutes: 5 },
  calculation: { kind: "worked-scaffold", action: "Work the calculation step-by-step with scaffolding, then repeat unaided.", minutes: 5 },
  terminology: { kind: "definition-recall", action: "Retrieve the exact term with flashcards until automatic.", minutes: 3 },
  "command-word": { kind: "exam-technique", action: "Practise what the command verb demands on the same stem.", minutes: 4 },
  "knowledge-gap": { kind: "content-retrieval", action: "Re-learn the missing fact with retrieval cards, then re-attempt.", minutes: 5 },
  "formula-selection": { kind: "worked-scaffold", action: "Practise choosing the right relationship first, then work it through.", minutes: 5 },
  "unit-error": { kind: "exam-technique", action: "Re-work the final line checking units and sig figs explicitly.", minutes: 3 },
  "insufficient-detail": { kind: "exam-technique", action: "Expand until every mark-scheme point is stated explicitly.", minutes: 4 },
  application: { kind: "focused-practice", action: "Apply the same fact to a fresh context without help.", minutes: 5 },
  reasoning: { kind: "targeted-explanation", action: "Rebuild the logical chain link by link, then justify in writing.", minutes: 5 },
  "careless-error": { kind: "review", action: "Re-read and check the final line — the method is sound.", minutes: 2 },
  other: { kind: "review", action: "Re-attempt the part, then review the mark scheme.", minutes: 3 },
};

export function remediationFor(category: ErrorCategory): RemediationMapping {
  return ERROR_TO_REMEDIATION[category];
}

export const ERROR_MASTERY_PENALTY: Record<ErrorCategory, number> = {
  misconception: 0.09,
  "knowledge-gap": 0.08,
  "formula-selection": 0.07,
  application: 0.06,
  reasoning: 0.06,
  calculation: 0.05,
  terminology: 0.05,
  "insufficient-detail": 0.05,
  "command-word": 0.04,
  "unit-error": 0.03,
  "careless-error": 0.015,
  other: 0.02,
};

export const ERROR_RETEST_URGENCY: Record<ErrorCategory, number> = {
  misconception: 1,
  "knowledge-gap": 0.9,
  "formula-selection": 0.85,
  application: 0.8,
  reasoning: 0.8,
  calculation: 0.7,
  terminology: 0.65,
  "insufficient-detail": 0.6,
  "command-word": 0.6,
  "unit-error": 0.5,
  other: 0.4,
  "careless-error": 0.25,
};
