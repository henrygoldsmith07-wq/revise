// Versioned post-marking error taxonomy for classifier.dev error diagnosis.
// Never overrides marking: awarded/max are fixed before this is consulted.
// Versioning is additive within a major — labels are added, never renamed.

export const ERROR_TAXONOMY_VERSION = "error-v1" as const;
export type ErrorTaxonomyVersion = typeof ERROR_TAXONOMY_VERSION;

export const ERROR_TAXONOMY = [
  "knowledge-gap",
  "misconception",
  "formula-selection",
  "calculation",
  "unit-error",
  "terminology",
  "insufficient-detail",
  "command-word",
  "application",
  "reasoning",
  "careless-error",
  "other",
] as const;

export type ErrorCategory = (typeof ERROR_TAXONOMY)[number];

export const ERROR_CATEGORY_MEANING: Record<ErrorCategory, string> = {
  "knowledge-gap": "Required fact not known or not written.",
  misconception: "Wrong idea applied confidently.",
  "formula-selection": "Wrong equation chosen for the situation.",
  calculation: "Lost in arithmetic, rearrangement or working.",
  "unit-error": "Missing/wrong units or significant figures.",
  terminology: "Talked around the required term.",
  "insufficient-detail": "Idea present but too vague to earn the point.",
  "command-word": "Did not do what the command verb demanded.",
  application: "Fact known but not transferred to the context.",
  reasoning: "Logical link or justification missing/invalid.",
  "careless-error": "Slip on an otherwise strong answer.",
  other: "Below threshold or genuinely ambiguous.",
};

export const ERROR_CONFIDENCE_THRESHOLD = 0.7;
export const ERROR_CONFIDENCE_FLOOR = 0.35;

export function isErrorCategory(value: string): value is ErrorCategory {
  return (ERROR_TAXONOMY as readonly string[]).includes(value);
}
