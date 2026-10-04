import { classifyMistake, type MarkRecovery } from "./mark-recovery";
import type { Attempt, Mistake, Question } from "./types";
import { trustedAssessmentMistake } from "./learning-evidence";

/** One evidence calculation supplies the wording; no second marking algorithm. */
export function recoveryClaim(input: { mistake: Mistake; attempts: readonly Attempt[]; questions: readonly Question[]; now: Date }) {
  const result = classifyMistake(input.mistake, input.attempts, new Map(input.questions.map(q => [q.id, q])), input.now);
  const proven = result.state === "proven" && trustedAssessmentMistake(input.mistake, input.questions, input.attempts);
  return { label: proven ? "Proven" : result.state === "provisional" || result.state === "awaiting-proof" || result.state === "proven" ? "Improving" : "Needs work",
    provenMarksRecovered: proven ? result.marks : 0, reason: result.reason };
}
export const headlineRecoveredMarks = (recovery: MarkRecovery) => recovery.totals.proven;
export { BLOCKED_PROOF_COPY } from "./proof-copy";
export function productLearningClaimAllowed(evidence: { design: "synthetic" | "observational" | "controlled"; genuineLearners: number; requiredLearners: number; preregistered: boolean; independentEvaluation: boolean; effectLowerBound: number | null }): boolean {
  return evidence.design === "controlled" && evidence.preregistered && evidence.independentEvaluation &&
    Number.isInteger(evidence.requiredLearners) && evidence.requiredLearners > 0 && evidence.genuineLearners >= evidence.requiredLearners &&
    evidence.effectLowerBound !== null && Number.isFinite(evidence.effectLowerBound) && evidence.effectLowerBound > 0;
}
