/** Stable audit API. Shared substance and individual subject checks have separate ownership. */
export { partText, addIssue, isGeneratedDepthDraft, validateSubstantivePart } from "./subject-substantive";
export type { SubstantiveGateFailure, SubjectAssessmentIssue, SubjectAssessmentIssueKind, WjecFlagshipSubjectId } from "./subject-substantive";
export { validateMathsPart } from "./subject-correctness-maths";
export { validateBiologyPart } from "./subject-correctness-biology";
export { validateChemistryPart } from "./subject-correctness-chemistry";
