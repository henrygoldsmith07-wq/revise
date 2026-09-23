// ---------------------------------------------------------------------------
// Multi-step working analysis and authored worked-solution validation.
// ---------------------------------------------------------------------------

import { isNumericPoint, numericEquivalent, perPointThreshold, pointCoverage } from "./marking";
import { findUnbalancedEquations } from "./equation-balance";
import { mathsEquivalent } from "./maths-equivalence";
import { diagnoseWorking } from "./step-diagnosis";
import { contradictoryWorkingStep } from "./calculation-rubric";
import type { AttemptWorkingEvidence, MarkedPart, Question, QuestionPart, WorkingErrorKind } from "./types";

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

function canonicaliseAuthoredNumericNotation(text: string): string {
  let out = text.replace(/[−–—]/g, "-");
  out = out.replace(/(?:√|\bsqrt\s*)\s*([⟨(\[])([^⟩)\]]+)[⟩)\]]/gi, (match, _open: string, radicand: string) =>
    /[a-z]/i.test(radicand) ? " " : match,
  );
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
    const futureIndex = modelSteps.slice(nextModel + 1).findIndex((m) => stepSimilarity(step.text, m) >= STEP_THRESHOLD);
    if (futureIndex >= 0) {
      return { modelSteps, steps, consistentWithModel: false, firstIncorrect: { stepIndex: step.index, studentStep: step.text, expected: modelSteps[nextModel]!, similarity: forward, reason: "missing-expected-step" } };
    }
    if (contradiction !== null && contradiction === step.index) {
      return { modelSteps, steps, consistentWithModel: false, firstIncorrect: { stepIndex: step.index, studentStep: step.text, expected: modelSteps[nextModel]!, similarity: 0, reason: "contradictory-working" } };
    }
    return { modelSteps, steps, consistentWithModel: false, firstIncorrect: { stepIndex: step.index, studentStep: step.text, expected: modelSteps[nextModel]!, similarity: forward, reason: "content-mismatch" } };
  }

  const missingIndex = covered.findIndex((value) => !value);
  if (missingIndex >= 0) return {
    modelSteps,
    steps,
    consistentWithModel: false,
    firstIncorrect: {
      stepIndex: steps.length,
      studentStep: "",
      expected: modelSteps[missingIndex]!,
      similarity: 0,
      reason: "missing-expected-step",
    },
  };
  return { modelSteps, steps, firstIncorrect: null, consistentWithModel: true };
}

export function consistentWithModel(part: QuestionPart, answer: string): boolean {
  return firstIncorrectStep(part, answer).consistentWithModel;
}

function markKindCounts(part: QuestionPart, marked: MarkedPart): Pick<AttemptWorkingEvidence, "methodMarksAwarded" | "accuracyMarksAwarded" | "followThroughMarksAwarded" | "unitMarksAwarded" | "precisionMarksAwarded"> {
  const rules = part.calculationRules ?? [];
  const credited = new Set(marked.creditedPoints);
  const count = (kind: string) => rules.reduce((total, rule, index) => total + (rule.kind === kind && credited.has(part.markScheme[index] ?? "") ? 1 : 0), 0);
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
  const diagnosedKind: WorkingErrorKind = diagnosis.kind === "none" && !analysis.consistentWithModel
    ? "method-error"
    : diagnosis.kind;
  const firstErrorKind: WorkingErrorKind = contradiction !== null ? "contradictory-working" : diagnosedKind;
  const counts = markKindCounts(part, marked);
  return {
    partId: part.id,
    firstIncorrectStep: contradiction ?? analysis.firstIncorrect?.stepIndex ?? diagnosis.firstErrorIndex,
    firstErrorKind,
    consistentWithModel: analysis.consistentWithModel && contradiction === null,
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
