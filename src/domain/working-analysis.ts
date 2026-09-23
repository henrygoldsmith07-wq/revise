// ---------------------------------------------------------------------------
// Multi-step working analysis and authored worked-solution validation.
// ---------------------------------------------------------------------------

import { isNumericPoint, numericEquivalent, perPointThreshold, pointCoverage } from "./marking";
import { findUnbalancedEquations } from "./equation-balance";
import { mathsEquivalent } from "./maths-equivalence";
import { diagnoseWorking } from "./step-diagnosis";
import { contradictoryWorkingStep } from "./calculation-rubric";
import type { AttemptWorkingEvidence, MarkedPart, Question, QuestionPart } from "./types";

export interface StudentStep { index: number; text: string }
export interface FirstIncorrect {
  stepIndex: number;
  studentStep: string;
  expected: string;
  similarity: number;
  reason: "content-mismatch" | "missing-expected-step" | "unrecognised-step" | "contradictory-working" | "working-runs-out";
}
export interface WorkingAnalysis {
  modelSteps: string[];
  steps: StudentStep[];
  firstIncorrect: FirstIncorrect | null;
  consistentWithModel: boolean;
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
  return Math.max(pointCoverage(point, modelAnswer), ...modelSteps.map((step) => stepSimilarity(step, point)));
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
  // A symbolic radical such as √⟨c²⟩ is a formula, not another authored
  // numerical result. Remove the whole symbolic radicand before numeric
  // comparison so its exponent cannot be mistaken for a required value.
  out = out.replace(/(?:√|\bsqrt\s*)\s*⟨[^⟩]+⟩/gi, " ");
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

export function firstIncorrectStep(part: QuestionPart, answer: string): WorkingAnalysis {
  const modelSteps = modelStepsForPart(part);
  const steps = splitSteps(answer).map((text, index) => ({ index, text }));
  const contradiction = contradictoryWorkingStep(answer);
  if (!steps.length) return {
    modelSteps, steps,
    firstIncorrect: modelSteps.length ? { stepIndex: 0, studentStep: "", expected: modelSteps[modelSteps.length - 1]!, similarity: 0, reason: "working-runs-out" } : null,
    consistentWithModel: false,
  };

  const covered = new Array<boolean>(modelSteps.length).fill(false);
  let nextModel = 0;
  for (const step of steps) {
    if (nextModel >= modelSteps.length) {
      if (contradiction !== null) return {
        modelSteps, steps, consistentWithModel: false,
        firstIncorrect: { stepIndex: contradiction, studentStep: steps[contradiction]?.text ?? answer, expected: "Keep numerical statements consistent; identify any corrected or abandoned working.", similarity: 0, reason: "contradictory-working" },
      };
      continue;
    }
    const forward = stepSimilarity(step.text, modelSteps[nextModel]!);
    if (forward >= STEP_THRESHOLD) { covered[nextModel] = true; nextModel++; continue; }
    let laterIndex = -1;
    let laterScore = 0;
    for (let mi = nextModel + 1; mi < modelSteps.length; mi++) {
      const score = stepSimilarity(step.text, modelSteps[mi]!);
      if (score > laterScore) { laterScore = score; laterIndex = mi; }
    }
    if (laterIndex >= 0 && laterScore >= STEP_THRESHOLD) return {
      modelSteps, steps, consistentWithModel: false,
      firstIncorrect: { stepIndex: step.index, studentStep: step.text, expected: modelSteps[nextModel]!, similarity: 0, reason: "missing-expected-step" },
    };
    return {
      modelSteps, steps, consistentWithModel: false,
      firstIncorrect: { stepIndex: step.index, studentStep: step.text, expected: modelSteps[nextModel]!, similarity: forward, reason: "content-mismatch" },
    };
  }
  const skipped = covered.findIndex((coveredStep) => !coveredStep);
  if (skipped >= 0) return {
    modelSteps, steps, consistentWithModel: false,
    firstIncorrect: { stepIndex: steps[steps.length - 1]?.index ?? 0, studentStep: steps[steps.length - 1]?.text ?? "", expected: modelSteps[skipped]!, similarity: 0, reason: "missing-expected-step" },
  };
  return { modelSteps, steps, firstIncorrect: null, consistentWithModel: true };
}

export function consistentWithModel(part: QuestionPart, answer: string): boolean {
  return firstIncorrectStep(part, answer).consistentWithModel;
}

export function analyseAttemptWorking(question: Question, answers: Record<string, string>, marked: readonly MarkedPart[]): AttemptWorkingEvidence[] {
  if (question.kind !== "calculation" && !question.parts.some((part) => (part.calculationRules?.length ?? 0) > 0)) return [];
  return question.parts.flatMap((part) => {
    if (question.kind !== "calculation" && !(part.calculationRules?.length ?? 0)) return [];
    const answer = answers[part.id] ?? "";
    const analysis = firstIncorrectStep(part, answer);
    const diagnosis = diagnoseWorking({ modelSteps: analysis.modelSteps, answer, similarityFn: stepSimilarity });
    const firstIncorrectIndex = analysis.firstIncorrect?.stepIndex ?? (diagnosis.firstErrorIndex ?? null);
    const firstErrorKind = analysis.firstIncorrect?.reason === "contradictory-working" ? "contradictory-working" : diagnosis.firstErrorIndex != null ? diagnosis.kind : analysis.firstIncorrect ? "method-error" : "none";
    const result = marked.find((candidate) => candidate.partId === part.id);
    const evidence = result?.evidence ?? [];
    const count = (kind: NonNullable<QuestionPart["calculationRules"]>[number]["kind"]): number => {
      const rules = part.calculationRules?.filter((rule) => rule.kind === kind) ?? [];
      return rules.filter((rule) => evidence.find((point) => point.point === part.markScheme[part.calculationRules?.indexOf(rule) ?? -1])?.status === "credited").length;
    };
    const carriedForward = evidence.some((point) => point.status === "credited" && /error carried forward/i.test(point.explanation));
    return [{
      partId: part.id,
      firstIncorrectStep: firstIncorrectIndex,
      firstErrorKind,
      consistentWithModel: analysis.consistentWithModel,
      methodMarksAwarded: count("method"),
      accuracyMarksAwarded: count("accuracy"),
      followThroughMarksAwarded: count("follow-through"),
      ...(carriedForward ? { errorCarriedForward: true } : {}),
      unitMarksAwarded: count("unit"),
      precisionMarksAwarded: count("precision"),
    }];
  });
}
