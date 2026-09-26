// ---------------------------------------------------------------------------
// Multi-step working analysis and authored worked-solution validation.
// ---------------------------------------------------------------------------

import { isNumericPoint, numericEquivalent, perPointThreshold, pointCoverage } from "./marking";
import { findUnbalancedEquations } from "./equation-balance";
import { mathsEquivalent } from "./maths-equivalence";
import { diagnoseWorking } from "./step-diagnosis";
import { contradictoryWorkingStep } from "./calculation-rubric";
import type { AttemptWorkingEvidence, MarkedPart, Question, QuestionPart, WorkingAnalysisConfidence, WorkingAnalysisConsistency, WorkingAnalysisReason, WorkingErrorKind } from "./types";

export interface StudentStep { index: number; text: string }
export interface FirstIncorrect {
  stepIndex: number;
  studentStep: string;
  expected: string;
  similarity: number;
  reason: WorkingAnalysisReason;
  confidence: WorkingAnalysisConfidence;
}
export interface WorkingAnalysis {
  modelSteps: string[];
  steps: StudentStep[];
  firstIncorrect: FirstIncorrect | null;
  /** True when the work matches the model or reaches an equivalent result by another route. */
  consistentWithModel: boolean;
  consistency: WorkingAnalysisConsistency;
  confidence: WorkingAnalysisConfidence;
}
export type WorkedSolutionIssueKind = "missing-model-answer" | "missing-mark-scheme" | "mark-scheme-gap" | "numeric-mismatch" | "unbalanced-equation";
export type WorkedSolutionIssueSeverity = "warning" | "error";
export interface WorkedSolutionIssue { kind: WorkedSolutionIssueKind; severity: WorkedSolutionIssueSeverity; pointIndex?: number; detail: string }
export type WorkedSolutionValidationStatus = "pass" | "review" | "fail";
export interface WorkedSolutionValidation {
  status: WorkedSolutionValidationStatus;
  modelSteps: string[];
  markSchemePoints: number;
  coveredMarkSchemePoints: number;
  markSchemeCoverage: number;
  issues: WorkedSolutionIssue[];
}
export interface WorkedSolutionAuditIssue extends WorkedSolutionIssue { questionId: string; partId: string }
export interface WorkedSolutionAudit {
  status: WorkedSolutionValidationStatus;
  questionCount: number;
  partCount: number;
  passedParts: number;
  errors: number;
  warnings: number;
  issues: WorkedSolutionAuditIssue[];
}

export function splitSteps(text: string): string[] {
  return (text ?? "").split(/\n|=>|;|\b(?:then|therefore|so)\b/i).map((s) => (s ?? "").trim()).filter(Boolean);
}

export function modelStepsForPart(part: QuestionPart): string[] {
  const fromModel = splitSteps(part.modelAnswer);
  if (fromModel.length > 1) return fromModel;
  const claims = (part.learningClaims ?? []).filter((c) => c.trim());
  return claims.length ? claims : fromModel;
}

export function stepSimilarity(studentStep: string, modelStep: string): number {
  const sym = mathsEquivalent(studentStep, modelStep);
  if (sym === "equivalent") return 1;
  if (sym === "not-equivalent") return 0.15;
  if (numericEquivalent(modelStep, studentStep)) return 0.8;
  return pointCoverage(modelStep, studentStep);
}

const STEP_THRESHOLD = 0.6;

function bestWorkedSolutionScore(point: string, modelAnswer: string, modelSteps: string[]): number {
  const threshold = perPointThreshold(point);
  const answerScore = pointCoverage(point, modelAnswer);
  if (answerScore >= threshold) return answerScore;

  let best = answerScore;
  for (const step of modelSteps) {
    best = Math.max(best, stepSimilarity(step, point));
    if (best >= threshold) return best;
  }
  return best;
}

/**
 * Canonicalise exact-form notation only for authored answer-key validation.
 * Student marking deliberately remains strict about requiring π, √, ± and
 * inequality notation when the mark scheme requires it. The content audit has
 * a different job: establish whether two authored numeric results contradict
 * one another, even when one is exact-form and the other decimal-form.
 */
function canonicaliseAuthoredNumericNotation(text: string): string {
  let out = text.replace(/[−–—]/g, "-");
  // A symbolic radical is a formula, not another authored numerical result.
  // Remove common bracketed symbolic radicands before numeric comparison so
  // exponents such as the 2 in √⟨c²⟩ / √(x²+y²) cannot be mistaken for an
  // expected answer. Numeric radicands are intentionally left for evaluation.
  out = out.replace(/(?:√|\bsqrt\s*)\s*([⟨(\[])([^⟩)\]]+)[⟩)\]]/gi, (match, _open: string, radicand: string) =>
    /[a-z]/i.test(radicand) ? " " : match,
  );
  // Handle an explicit coefficient before a numeric radical as multiplication
  // before replacing standalone radicals. Otherwise `2√2` would become
  // `21.414...` and look like a contradiction instead of the value 2.828....
  out = out.replace(/(-?\d+(?:\.\d+)?)\s*(?:√|\bsqrt\s*)\s*\(?\s*(-?\d+(?:\.\d+)?)\s*\)?/gi, (_match, coefficient: string, radicand: string) => {
    const value = Number(coefficient) * Math.sqrt(Number(radicand));
    return Number.isFinite(value) ? String(value) : _match;
  });
  out = out.replace(/(?:√|\bsqrt\s*)\s*\(?\s*(-?\d+(?:\.\d+)?)\s*\)?/gi, (_match, raw: string) => {
    const value = Math.sqrt(Number(raw));
    return Number.isFinite(value) ? String(value) : _match;
  });
  out = out.replace(/(-?\d+(?:\.\d+)?)\s*(?:π|\bpi\b)/gi, (_match, raw: string) => String(Number(raw) * Math.PI));
  out = out.replace(/(?:π|\bpi\b)/gi, String(Math.PI));
  out = out.replace(/±|\+\s*\/\s*-|\bplus\s+or\s+minus\b/gi, " ");
  out = out.replace(/≤|≥|<=|>=|\bless\s+than\s+or\s+equal(?:\s+to)?\b|\bgreater\s+than\s+or\s+equal(?:\s+to)?\b/gi, " = ");
  return out;
}

function authoredNumericEquivalent(expected: string, actual: string): boolean {
  if (numericEquivalent(expected, actual)) return true;
  return numericEquivalent(canonicaliseAuthoredNumericNotation(expected), canonicaliseAuthoredNumericNotation(actual));
}

export function validateWorkedSolution(part: QuestionPart): WorkedSolutionValidation {
  const modelAnswer = (part.modelAnswer ?? "").trim();
  const markScheme = (part.markScheme ?? []).map((point) => point.trim()).filter(Boolean);
  const modelSteps = modelAnswer ? modelStepsForPart(part) : [];
  const issues: WorkedSolutionIssue[] = [];
  if (!modelAnswer) issues.push({ kind: "missing-model-answer", severity: "error", detail: "The part has no authored model answer." });
  if (!markScheme.length) issues.push({ kind: "missing-mark-scheme", severity: "error", detail: "The part has no mark-scheme points to validate against." });

  let coveredMarkSchemePoints = 0;
  for (const [pointIndex, point] of markScheme.entries()) {
    const numericExpected = isNumericPoint(point);
    const numericMatches = !numericExpected || authoredNumericEquivalent(point, modelAnswer);
    const score = modelAnswer ? bestWorkedSolutionScore(point, modelAnswer, modelSteps) : 0;
    for (const bad of findUnbalancedEquations(`${point} ${modelAnswer}`)) {
      issues.push({ kind: "unbalanced-equation", severity: "warning", pointIndex, detail: `Equation does not balance: ${bad}` });
    }
    if (numericExpected && !numericMatches) {
      issues.push({ kind: "numeric-mismatch", severity: "error", pointIndex, detail: `Mark-scheme point ${pointIndex + 1} expects a numerical result that is not present in the model answer: ${point}` });
      continue;
    }
    if (score >= perPointThreshold(point)) { coveredMarkSchemePoints++; continue; }
    issues.push({ kind: "mark-scheme-gap", severity: "warning", pointIndex, detail: `Mark-scheme point ${pointIndex + 1} is not represented clearly in the model answer: ${point}` });
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    status: errors ? "fail" : warnings ? "review" : "pass",
    modelSteps,
    markSchemePoints: markScheme.length,
    coveredMarkSchemePoints,
    markSchemeCoverage: markScheme.length ? Math.round((coveredMarkSchemePoints / markScheme.length) * 100) : 0,
    issues,
  };
}

export function validateWorkedSolutions(questions: readonly Question[]): WorkedSolutionAudit {
  const issues: WorkedSolutionAuditIssue[] = [];
  let partCount = 0;
  let passedParts = 0;
  for (const question of questions) for (const part of question.parts ?? []) {
    partCount++;
    const validation = validateWorkedSolution(part);
    if (validation.status === "pass") passedParts++;
    for (const issue of validation.issues) issues.push({ ...issue, questionId: question.id, partId: part.id });
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return { status: errors ? "fail" : warnings ? "review" : "pass", questionCount: questions.length, partCount, passedParts, errors, warnings, issues };
}

function finalResultMatches(modelSteps: string[], steps: StudentStep[]): boolean {
  const expected = modelSteps[modelSteps.length - 1];
  const actual = steps[steps.length - 1]?.text;
  if (!expected || !actual) return false;
  const normalise = (text: string) => text.replace(/^\s*=+\s*/, "").replace(/\s+/g, "").toLowerCase();
  if (normalise(actual) === normalise(expected)) return true;
  const symbolic = mathsEquivalent(actual, expected);
  if (symbolic === "equivalent") return true;
  if (symbolic === "not-equivalent") return false;
  // Numeric fallback is only safe for scalar answers. Comparing extracted
  // digits in symbolic expressions can mistake different algebra for equality.
  if (/[a-z]/i.test(actual) || /[a-z]/i.test(expected)) return false;
  return numericEquivalent(expected, actual);
}

function workingResult(
  modelSteps: string[],
  steps: StudentStep[],
  firstIncorrect: FirstIncorrect | null,
  consistency: WorkingAnalysisConsistency,
  confidence: WorkingAnalysisConfidence,
): WorkingAnalysis {
  return {
    modelSteps,
    steps,
    firstIncorrect,
    consistentWithModel: consistency === "model-match" || consistency === "alternative-valid",
    consistency,
    confidence,
  };
}

/**
 * Compare student work with the authored route without treating that route as
 * the only valid one. A proven equivalent final result with a different path
 * is reported as alternative-valid; an unrecognised path stays uncertain.
 */
export function firstIncorrectStep(part: QuestionPart, answer: string): WorkingAnalysis {
  const modelSteps = modelStepsForPart(part);
  const steps = splitSteps(answer).map((text, index) => ({ index, text }));
  const contradiction = contradictoryWorkingStep(answer);

  if (!modelSteps.length) return workingResult(modelSteps, steps, null, "uncertain", "low");
  if (!steps.length) {
    return workingResult(
      modelSteps,
      steps,
      {
        stepIndex: 0,
        studentStep: "",
        expected: modelSteps[0]!,
        similarity: 0,
        reason: "working-runs-out",
        confidence: "low",
      },
      "uncertain",
      "low",
    );
  }

  if (contradiction !== null) {
    return workingResult(
      modelSteps,
      steps,
      {
        stepIndex: contradiction,
        studentStep: steps[contradiction]?.text ?? answer,
        expected: modelSteps[contradiction] ?? "Keep numerical statements consistent; identify any corrected or abandoned working.",
        similarity: 0,
        reason: "contradictory-working",
        confidence: "high",
      },
      "inconsistent",
      "high",
    );
  }

  const covered = new Array<boolean>(modelSteps.length).fill(false);
  let cursor = 0;
  let firstUnmatched: { step: StudentStep; expected: string; similarity: number } | null = null;
  let firstMissing: { stepIndex: number; modelIndex: number } | null = null;

  for (const step of steps) {
    let bestIndex = -1;
    let bestSimilarity = 0;
    for (let index = cursor; index < modelSteps.length; index++) {
      const similarity = stepSimilarity(step.text, modelSteps[index]!);
      if (similarity > bestSimilarity) {
        bestIndex = index;
        bestSimilarity = similarity;
      }
    }

    if (bestIndex >= 0 && bestSimilarity >= STEP_THRESHOLD) {
      if (bestIndex > cursor && firstMissing === null) {
        firstMissing = { stepIndex: step.index, modelIndex: cursor };
      }
      covered[bestIndex] = true;
      cursor = bestIndex + 1;
      continue;
    }

    if (firstUnmatched === null) {
      firstUnmatched = {
        step,
        expected: modelSteps[cursor] ?? modelSteps[modelSteps.length - 1]!,
        similarity: bestSimilarity,
      };
    }
  }

  if (covered.every(Boolean) && firstUnmatched === null) {
    return workingResult(modelSteps, steps, null, "model-match", "high");
  }

  // If the worked route differs but its final expression/result is equivalent,
  // do not label the route as an error merely because the model used another path.
  if (finalResultMatches(modelSteps, steps)) {
    return workingResult(modelSteps, steps, null, "alternative-valid", "medium");
  }

  if (firstUnmatched !== null) {
    const relation = mathsEquivalent(firstUnmatched.step.text, firstUnmatched.expected);
    const reason: WorkingAnalysisReason = relation === "not-equivalent" ? "content-mismatch" : "unrecognised-step";
    const confidence: WorkingAnalysisConfidence = relation === "not-equivalent" ? "medium" : "low";
    return workingResult(
      modelSteps,
      steps,
      {
        stepIndex: firstUnmatched.step.index,
        studentStep: firstUnmatched.step.text,
        expected: firstUnmatched.expected,
        similarity: firstUnmatched.similarity,
        reason,
        confidence,
      },
      "uncertain",
      confidence,
    );
  }

  const missingIndex = covered.findIndex((value) => !value);
  if (missingIndex >= 0) {
    const stepIndex = firstMissing?.stepIndex ?? steps.length;
    const modelIndex = firstMissing?.modelIndex ?? missingIndex;
    return workingResult(
      modelSteps,
      steps,
      {
        stepIndex,
        studentStep: steps[stepIndex]?.text ?? "",
        expected: modelSteps[modelIndex]!,
        similarity: 0,
        reason: "missing-expected-step",
        confidence: "low",
      },
      "uncertain",
      "low",
    );
  }

  return workingResult(modelSteps, steps, null, "uncertain", "low");
}

export function consistentWithModel(part: QuestionPart, answer: string): boolean {
  return firstIncorrectStep(part, answer).consistentWithModel;
}

function markKindCounts(part: QuestionPart, marked: MarkedPart): Pick<AttemptWorkingEvidence, "methodMarksAwarded" | "accuracyMarksAwarded" | "followThroughMarksAwarded" | "unitMarksAwarded" | "precisionMarksAwarded"> {
  const rules = part.calculationRules ?? [];
  const credited = new Set(marked.creditedPoints);
  const count = (kind: string) =>
    rules.reduce((total, rule, index) => total + (rule.kind === kind && credited.has(part.markScheme[index] ?? "") ? 1 : 0), 0);
  return {
    methodMarksAwarded: count("method"),
    accuracyMarksAwarded: count("accuracy"),
    followThroughMarksAwarded: count("follow-through"),
    unitMarksAwarded: count("unit"),
    precisionMarksAwarded: count("precision"),
  };
}

export function buildWorkingEvidence(part: QuestionPart, marked: MarkedPart, answer: string): AttemptWorkingEvidence {
  const analysis = firstIncorrectStep(part, answer);
  const diagnosis = diagnoseWorking({ modelSteps: analysis.modelSteps, answer, similarityFn: stepSimilarity });
  const contradiction = contradictoryWorkingStep(answer);
  const specificDiagnosis =
    diagnosis.kind !== "none" &&
    diagnosis.kind !== "method-error" &&
    analysis.consistency !== "alternative-valid";
  const firstErrorKind: WorkingErrorKind =
    contradiction !== null
      ? "contradictory-working"
      : specificDiagnosis
        ? diagnosis.kind
        : "none";
  const consistency: WorkingAnalysisConsistency =
    contradiction !== null || specificDiagnosis ? "inconsistent" : analysis.consistency;
  const confidence: WorkingAnalysisConfidence =
    contradiction !== null ? "high" : specificDiagnosis ? "high" : analysis.confidence;
  const diagnosedStep = diagnosis.firstErrorIndex === null ? null : diagnosis.steps[diagnosis.firstErrorIndex] ?? null;
  const firstIncorrectStepIndex =
    contradiction ??
    (specificDiagnosis ? diagnosis.firstErrorIndex : null);
  const firstIncorrectReason =
    contradiction !== null
      ? "contradictory-working"
      : specificDiagnosis
        ? "diagnosed-working-error"
        : analysis.firstIncorrect?.reason ?? null;
  const firstIncorrectExpected =
    diagnosedStep?.matchedModelStep ?? analysis.firstIncorrect?.expected ?? null;
  const counts = markKindCounts(part, marked);

  return {
    partId: part.id,
    firstIncorrectStep: firstIncorrectStepIndex,
    firstErrorKind,
    consistentWithModel: consistency === "model-match" || consistency === "alternative-valid",
    consistency,
    confidence,
    firstIncorrectReason,
    firstIncorrectExpected,
    ...(specificDiagnosis && diagnosedStep?.note ? { diagnosisNote: diagnosedStep.note } : {}),
    ...counts,
    errorCarriedForward: counts.followThroughMarksAwarded > 0 && counts.accuracyMarksAwarded === 0,
  };
}

export function analyseAttemptWorking(question: Question, answers: Record<string, string>, marked: MarkedPart[]): AttemptWorkingEvidence[] {
  return question.parts.flatMap((part) => {
    const mark = marked.find((row) => row.partId === part.id);
    const answer = answers[part.id] ?? "";
    if (!mark || (!answer.trim() && !part.calculationRules?.length)) return [];
    return [buildWorkingEvidence(part, mark, answer)];
  });
}