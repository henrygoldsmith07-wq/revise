// ---------------------------------------------------------------------------
// Question-level quality gates that must hold before a flagship question can
// be put in front of a human reviewer, and again before it can be promoted.
// Pure and deterministic. A "block" gate means the question must be revised
// (not approved); a "warn" gate is shown to the reviewer.
// ---------------------------------------------------------------------------

import { isDataAnalysis } from "./supply-audit";
import type { Id, Question } from "./types";

export type GateCode =
  | "no-mark-scheme"
  | "mark-total-mismatch"
  | "mark-scheme-thin"
  | "mcq-mismatch"
  | "empty-prompt"
  | "no-model-answer"
  | "no-spec-link"
  | "unknown-spec-point"
  | "unknown-topic"
  | "stale-spec-version"
  | "transfer-label-without-transfer"
  | "data-label-without-data"
  | "insufficient-provenance"
  | "blocked-validation-stage";

export interface GateIssue {
  code: GateCode;
  severity: "block" | "warn";
  detail: string;
}

export interface GateContext {
  topicIds: ReadonlySet<Id>;
  specPointIds: ReadonlySet<Id>;
  /** Current spec version per subject, when known. */
  specVersionOf?: (subjectId: Id) => string | undefined;
}

const BLOCKED_STAGES = new Set(["retired", "rejected", "needs_changes"]);
const TABLE_ROW = /\|[^|\n]+\|/;
const NUMBER = /(?:^|[^\w.])[+\-−]?\d+(?:\.\d+)?/g;

function questionText(question: Question): string {
  return `${question.stem} ${question.parts.map((part) => part.prompt).join(" ")}`;
}

/** Data is actually on the page: a table, or several quantities to work with. */
export function hasDataRepresentation(question: Question): boolean {
  const text = questionText(question);
  return TABLE_ROW.test(text) || (text.match(NUMBER)?.length ?? 0) >= 4;
}

function transferLabelled(question: Question): boolean {
  const demands = [question.learning?.demand, ...question.parts.map((part) => part.learning?.demand)];
  return demands.some((demand) => demand === "transfer");
}

/** Structural transfer: an explicit baseline link whose setup differs from the transfer setup. */
export function hasActualTransfer(question: Question): boolean {
  const links = [question.learning?.transferLink, ...question.parts.map((part) => part.learning?.transferLink)];
  return links.some((link) => Boolean(link) &&
    JSON.stringify(link!.baselineSetupFingerprint) !== JSON.stringify(link!.transferSetupFingerprint));
}

export function questionGateIssues(question: Question, context: GateContext): GateIssue[] {
  const issues: GateIssue[] = [];
  const add = (code: GateCode, severity: GateIssue["severity"], detail: string) => issues.push({ code, severity, detail });

  const partMarks = question.parts.reduce((sum, part) => sum + part.marks, 0);
  if (!question.parts.length) add("no-mark-scheme", "block", "The question has no parts.");
  if (partMarks !== question.totalMarks) add("mark-total-mismatch", "block", `Parts add up to ${partMarks} marks but the question says ${question.totalMarks}.`);
  for (const part of question.parts) {
    const label = part.label || part.id;
    if (!part.markScheme.some((point) => point.trim())) add("no-mark-scheme", "block", `Part ${label} has no mark scheme.`);
    else if (part.marks > 2 && part.markScheme.length === 1) add("mark-scheme-thin", "warn", `Part ${label} is worth ${part.marks} marks but has one mark-scheme point.`);
    if (!part.modelAnswer.trim()) add("no-model-answer", "block", `Part ${label} has no worked or model answer.`);
    if (!part.prompt.trim()) add("empty-prompt", "block", `Part ${label} has no prompt.`);
  }
  if (question.kind === "mcq") {
    const count = question.options?.length ?? 0;
    if (count < 2 || question.correctIndex === undefined || question.correctIndex < 0 || question.correctIndex >= count) {
      add("mcq-mismatch", "block", "The multiple-choice key does not point at one of the options.");
    }
  }

  const specIds = [...new Set([...(question.specPointIds ?? []), ...question.parts.flatMap((part) => part.specPointIds ?? [])])];
  if (!specIds.length) add("no-spec-link", "block", "No specification point is linked.");
  for (const id of specIds) if (!context.specPointIds.has(id)) add("unknown-spec-point", "block", `Specification point ${id} does not exist.`);
  if (!question.topicIds.length) add("unknown-topic", "block", "The question is not linked to a topic.");
  for (const id of question.topicIds) if (!context.topicIds.has(id)) add("unknown-topic", "block", `Topic ${id} does not exist.`);

  const current = context.specVersionOf?.(question.subjectId);
  if (!question.specVersion) add("stale-spec-version", "warn", "No specification version is recorded.");
  else if (current && question.specVersion !== current) add("stale-spec-version", "block", `Written against specification ${question.specVersion}; current is ${current}.`);

  if (transferLabelled(question) && !hasActualTransfer(question)) {
    add("transfer-label-without-transfer", "block", "Labelled as transfer, but no baseline link shows a different setup.");
  }
  if (isDataAnalysis(question) && !hasDataRepresentation(question)) {
    add("data-label-without-data", "block", "Labelled as data analysis, but the prompt contains no table or data values.");
  }

  const source = question.source;
  if (!source || source === "unreviewed" || source === "import" || question.origin === "ai") {
    add("insufficient-provenance", "block", `Source ${source ?? "unknown"} is not an accepted provenance for trusted content.`);
  } else if (source === "licensed" && !question.licensedSource?.citation) {
    add("insufficient-provenance", "block", "Licensed content needs a citation.");
  } else if (source === "generated") {
    add("insufficient-provenance", "warn", "Generated content: the reviewer must confirm it is correct, original and exam-realistic.");
  }
  const stage = question.validation?.stage;
  if (stage && BLOCKED_STAGES.has(stage)) add("blocked-validation-stage", "block", `Validation stage is ${stage}.`);
  return issues;
}

export const blockingGates = (issues: readonly GateIssue[]): GateIssue[] => issues.filter((issue) => issue.severity === "block");
