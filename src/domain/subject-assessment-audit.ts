import type { CapabilityNode } from "./capability-graph";
import { checkEquationBalance, findUnbalancedEquations } from "./equation-balance";
import { mathsEquivalent } from "./maths-equivalence";
import {
  auditPhysicsAssessmentQuality,
  PHYSICS_ASSESSMENT_DEMANDS,
  type PhysicsAssessmentQualityAudit,
  type PhysicsQualityIssue,
} from "./physics-assessment-quality";
import type { Id, LearningDemand, Question, QuestionPart, Topic } from "./types";

/**
 * The WJEC flagship subjects share one depth contract.  Physics already uses
 * the contract; these ids let authoring and QA report the other three subjects
 * through the same internal surface without creating a second mastery model.
 */
export const WJEC_FLAGSHIP_SUBJECT_IDS = [
  "wjec-alevel-physics",
  "wjec-alevel-maths",
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
] as const;

export type WjecFlagshipSubjectId = (typeof WJEC_FLAGSHIP_SUBJECT_IDS)[number];

export type SubjectAssessmentIssueKind =
  | "maths-equivalence"
  | "maths-domain"
  | "maths-exact-form"
  | "maths-calculus"
  | "biology-terminology"
  | "biology-causal-chain"
  | "biology-practical-design"
  | "biology-data-interpretation"
  | "biology-contradiction"
  | "chemistry-equation-balance"
  | "chemistry-stoichiometry"
  | "chemistry-oxidation-state"
  | "chemistry-unit"
  | "chemistry-equilibrium"
  | "unresolved";

export interface SubjectAssessmentIssue {
  subjectId: WjecFlagshipSubjectId | Id;
  questionId: Id;
  partId: Id;
  kind: SubjectAssessmentIssueKind;
  severity: "error" | "warning";
  detail: string;
}

export interface SubjectCorrectnessSummary {
  issueCount: number;
  errors: number;
  warnings: number;
  /** Warnings remain unresolved until a qualified reviewer closes them. */
  unresolved: number;
  byKind: Partial<Record<SubjectAssessmentIssueKind, number>>;
}

export interface FlagshipSubjectAssessmentAudit extends PhysicsAssessmentQualityAudit {
  subjectIssues: SubjectAssessmentIssue[];
  correctness: SubjectCorrectnessSummary;
  /** Number of independent marking disagreements supplied by the benchmark. */
  markingDisagreements: number;
}

function partText(part: QuestionPart): string {
  return [part.prompt, ...(part.markScheme ?? []), part.modelAnswer].filter(Boolean).join("\n");
}

function addIssue(
  issues: SubjectAssessmentIssue[],
  question: Question,
  part: QuestionPart,
  kind: SubjectAssessmentIssueKind,
  severity: "error" | "warning",
  detail: string,
): void {
  issues.push({ subjectId: question.subjectId, questionId: question.id, partId: part.id, kind, severity, detail });
}

function variableNames(expression: string): string[] {
  return [...new Set((expression.match(/[a-z]/gi) ?? []).map((name) => name.toLowerCase()))].sort();
}

function looksLikeIdentity(left: string, right: string): boolean {
  const leftVars = variableNames(left);
  const rightVars = variableNames(right);
  if (!leftVars.length || leftVars.join(",") !== rightVars.join(",")) return false;
  // Assignments such as y = 2x + 1 are definitions, not identities.  An
  // identity has a non-trivial expression on both sides with the same symbols.
  const nonTrivial = (value: string): boolean => /[+*/^()]/.test(value) || /\d/.test(value);
  return nonTrivial(left) && nonTrivial(right) && !/^\s*[a-z]\s*$/i.test(left);
}

/** Equality relations whose two sides are intended to be algebraically equal. */
function equalityCandidates(text: string): Array<[string, string]> {
  const candidates: Array<[string, string]> = [];
  const relation = /(?:^|[\n.;])\s*([^=\n.;]{1,100})=([^=\n.;]{1,100})(?=$|[\n.;])/g;
  for (const match of text.replace(/[−–—]/g, "-").matchAll(relation)) {
    const left = (match[1] ?? "").replace(/^.*:\s*/, "").trim();
    const right = (match[2] ?? "").replace(/[,:].*$/, "").trim();
    if (left && right && looksLikeIdentity(left, right)) candidates.push([left, right]);
  }
  return candidates;
}

function validateMathsPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  for (const [left, right] of equalityCandidates(text)) {
    const comparison = mathsEquivalent(left, right);
    if (comparison === "not-equivalent") {
      addIssue(issues, question, part, "maths-equivalence", "error", `Algebraic identity is not equivalent: ${left} = ${right}.`);
    }
  }

  if (/\b(?:ln|log|sqrt)\b|√/.test(text) && !/(?:domain|positive|x\s*[>≥]|argument|defined)/i.test(text)) {
    addIssue(issues, question, part, "maths-domain", "warning", "A logarithm or square root is used without an explicit domain condition.");
  }
  if (/\bexact(?:ly|\s+form)?\b/i.test(part.prompt) && /\b\d+\.\d+\b/.test(part.modelAnswer) && !/[√π]|fraction|surd/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-exact-form", "warning", "The prompt requests an exact result but the worked answer appears decimal-only.");
  }
  if (/\b(?:differentiat|derivative|integrat|antiderivative|gradient)\w*\b/i.test(text) &&
      /\b(?:therefore|hence|so)\b/i.test(part.prompt) && !/[=→]/.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-calculus", "warning", "A calculus conclusion has no explicit symbolic result to check.");
  }
}

function validateBiologyPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const suspiciousContradiction = text.split(/[.!?;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .some((sentence) => {
      const hasIncrease = /\bincreas(?:e|es|ed|ing)\b/i.test(sentence);
      const hasDecrease = /\bdecreas(?:e|es|ed|ing)\b/i.test(sentence);
      // A causal or conditional chain can legitimately move up and then down
      // (feedback, denaturation, dose-response).  Treat a bare same-sentence
      // contradiction as an error and leave nuanced cases to the reviewer.
      const contrasted = /\b(?:whereas|while|respectively|depending|at\s+(?:high|low)|before|after|versus|vs\.?|but|then|because|therefore|so|reducing|towards|above|below|more|fewer|from|to)\b/i.test(sentence);
      return hasIncrease && hasDecrease && !contrasted;
    });
  if (suspiciousContradiction) {
    addIssue(issues, question, part, "biology-contradiction", "error", "The same biological claim contains both an increase and a decrease without a condition or comparison.");
  }

  const causalPrompt = /\b(?:explain|why|predict|evaluate|cause|mechanism|effect)\w*\b/i.test(part.prompt);
  const causalAnswer = /\b(?:because|therefore|so|leads?|caus|result|due to|which means|allows?)\w*\b/i.test(part.modelAnswer);
  if (causalPrompt && !causalAnswer) {
    addIssue(issues, question, part, "biology-causal-chain", "warning", "The answer describes an outcome without an explicit biological causal link.");
  }

  const practicalPrompt = /\b(?:investigat|experiment|practical|control variable|repeated|data|graph|rate)\w*\b/i.test(part.prompt);
  const practicalEvidence = /\b(?:control|independent|dependent|variable|repeat|replicat|mean|uncertaint|error bar|axis|sample size|valid)\w*\b/i.test(part.modelAnswer);
  if (practicalPrompt && !practicalEvidence) {
    addIssue(issues, question, part, "biology-practical-design", "warning", "A practical or data claim has no visible control, measurement or uncertainty evidence.");
  }
  if (/\b(?:data|table|graph|percentage|rate|concentration|mass change)\b/i.test(part.prompt) && !/\d|trend|correlat|compar|mean|uncertaint|significant/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "biology-data-interpretation", "warning", "The answer does not cite a measurable trend or comparison for the supplied data demand.");
  }

  // Flag only an explicit terminology collision; ordinary synonyms remain
  // valid because the human reviewer owns final terminology approval.
  if (/\b(?:peptide|glycosidic|phosphodiester|hydrogen) bond\b/i.test(text) &&
      /\b(?:between|formed|joins?)\b/i.test(text) && /\bwrong|incorrect|confus/i.test(text)) {
    addIssue(issues, question, part, "biology-terminology", "warning", "Terminology is called out as a possible bond/structure confusion and needs subject review.");
  }
}

function equationCandidates(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/([A-Za-z0-9][A-Za-z0-9()+\s]*?(?:->|→|⟶|==>)[A-Za-z0-9()+\s]+[A-Za-z0-9)])(?=$|[.,;)])/g)) {
    const value = match[1]?.trim();
    if (value) out.push(value);
  }
  return out;
}

function validateChemistryPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const equations = [...new Set([...equationCandidates(text), ...findUnbalancedEquations(text)])];
  for (const equation of equations) {
    const result = checkEquationBalance(equation);
    if (result && !result.ok) {
      addIssue(issues, question, part, "chemistry-equation-balance", "error", `Equation is not atom-balanced: ${equation}.`);
    }
  }
  if (/\b(?:stoichiometr|mole ratio|coefficient)\w*\b/i.test(part.prompt) &&
      !/\b(?:ratio|coefficient|mole|mol|balanced|electron)\w*\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-stoichiometry", "warning", "The stoichiometric conclusion is not supported by a visible mole ratio or balanced relationship.");
  }
  if (/\b(?:oxidation state|oxidation number|redox|electron transfer)\b/i.test(part.prompt) &&
      !/\b(?:oxid|reduc|electron|charge|state|half-equation)\w*\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-oxidation-state", "warning", "The answer does not show an oxidation-state or electron-balance justification.");
  }
  if (/\b(?:calculate|concentration|amount|energy|volume|pressure|rate)\w*\b/i.test(part.prompt) &&
      /\b(?:mol|dm|cm|kJ|J|Pa|K|g|s|m)\b/i.test(part.prompt) &&
      !/\b(?:mol|dm|cm|kJ|J|Pa|K|g|s|m)\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-unit", "warning", "A numerical chemistry answer has no visible unit.");
  }
  if (/\bK[cp]\b|equilibrium/i.test(part.prompt) && !/(?:\[|partial pressure|concentration|equilibrium|Q[cp])/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-equilibrium", "warning", "The equilibrium answer does not expose the concentration or partial-pressure relationship.");
  }
}

function summariseCorrectness(issues: readonly SubjectAssessmentIssue[]): SubjectCorrectnessSummary {
  const byKind: Partial<Record<SubjectAssessmentIssueKind, number>> = {};
  for (const issue of issues) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return { issueCount: issues.length, errors, warnings, unresolved: warnings, byKind };
}

/** Run the shared seven-demand audit plus conservative subject checks. */
export function auditFlagshipSubject(input: {
  subjectId: WjecFlagshipSubjectId | Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  trustedQuestion?: (question: Question) => boolean;
  markingDisagreements?: number;
}): FlagshipSubjectAssessmentAudit {
  const depth = auditPhysicsAssessmentQuality(input);
  const subjectIssues: SubjectAssessmentIssue[] = [];
  for (const question of input.questions.filter((row) => row.subjectId === input.subjectId)) {
    for (const part of question.parts) {
      if (input.subjectId === "wjec-alevel-maths") validateMathsPart(question, part, subjectIssues);
      else if (input.subjectId === "wjec-alevel-biology") validateBiologyPart(question, part, subjectIssues);
      else if (input.subjectId === "wjec-alevel-chemistry") validateChemistryPart(question, part, subjectIssues);
    }
  }
  return {
    ...depth,
    subjectIssues,
    correctness: summariseCorrectness(subjectIssues),
    markingDisagreements: Math.max(0, input.markingDisagreements ?? 0),
  };
}

export interface FlagshipDepthDashboardRow {
  subjectId: WjecFlagshipSubjectId | Id;
  statements: number;
  deepComplete: number;
  incomplete: number;
  questions: number;
  questionsPerStatement: number;
  demandCompletion: Record<LearningDemand, number>;
  approvedQuestions: number;
  draftQuestions: number;
  structuralIssues: number;
  subjectCorrectness: SubjectCorrectnessSummary;
  markingDisagreements: number;
  releaseReady: boolean;
}

export interface FlagshipDepthDashboard {
  subjects: FlagshipDepthDashboardRow[];
  balancedAtTwenty: boolean;
  /** No student-facing data: this is an authoring/release QA surface. */
  generatedQuestionCount: number;
  totalQuestions: number;
}

export interface FlagshipDepthDashboardInput {
  curricula: ReadonlyArray<{ subject: { id: Id }; topics: readonly Topic[] }>;
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  trustedQuestion?: (question: Question) => boolean;
  markingDisagreementsBySubject?: Partial<Record<Id, number>>;
}

/** Build one compact internal row per WJEC subject for balanced authoring. */
export function buildFlagshipDepthDashboard(input: FlagshipDepthDashboardInput): FlagshipDepthDashboard {
  const rows = input.curricula.map(({ subject, topics }): FlagshipDepthDashboardRow => {
    const subjectQuestions = input.questions.filter((question) => question.subjectId === subject.id);
    const audit = auditFlagshipSubject({
      subjectId: subject.id,
      topics,
      questions: subjectQuestions,
      nodes: input.nodes,
      trustedQuestion: input.trustedQuestion,
      markingDisagreements: input.markingDisagreementsBySubject?.[subject.id],
    });
    const demandCompletion = Object.fromEntries(
      PHYSICS_ASSESSMENT_DEMANDS.map((demand) => [demand, 0]),
    ) as Record<LearningDemand, number>;
    for (const demand of audit.capabilityCoverage.flatMap((coverage) => coverage.demands)) {
      if (demand.complete && demand.distinct) demandCompletion[demand.demand] = (demandCompletion[demand.demand] ?? 0) + 1;
    }
    return {
      subjectId: subject.id,
      statements: audit.statements,
      deepComplete: audit.completeStatements,
      incomplete: Math.max(0, audit.statements - audit.completeStatements),
      questions: subjectQuestions.length,
      questionsPerStatement: audit.statements ? Number((subjectQuestions.length / audit.statements).toFixed(2)) : 0,
      demandCompletion,
      approvedQuestions: audit.approvedQuestions,
      draftQuestions: audit.unreviewedQuestions,
      structuralIssues: audit.issues.filter((issue: PhysicsQualityIssue) => issue.kind !== "unreviewed").length,
      subjectCorrectness: audit.correctness,
      markingDisagreements: audit.markingDisagreements,
      releaseReady: audit.releaseReady && audit.correctness.errors === 0,
    };
  });
  return {
    subjects: rows,
    balancedAtTwenty: rows.filter((row) => WJEC_FLAGSHIP_SUBJECT_IDS.includes(row.subjectId as WjecFlagshipSubjectId)).every((row) => row.deepComplete >= 20),
    generatedQuestionCount: input.questions.filter((question) => question.source === "generated").length,
    totalQuestions: input.questions.length,
  };
}

/** Descriptive aliases for callers that do not need to know the legacy Physics audit name. */
export const auditWjecSubjectAssessment = auditFlagshipSubject;
export const buildWjecFlagshipDepthDashboard = buildFlagshipDepthDashboard;
