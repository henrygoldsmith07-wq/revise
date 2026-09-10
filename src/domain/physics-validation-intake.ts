// ---------------------------------------------------------------------------
// Physics evidence intake
//
// The product already has the trust gates needed to keep draft content and
// weak evidence out of learning decisions. This module is the operator-facing
// seam that turns real work by subject experts, markers and learners into the
// records those gates consume. It is deliberately pure: files are parsed,
// checked against the current bank, and returned for a caller to persist.
//
// Nothing in this file creates an approval, invents a mark, or drops an
// incomplete chain. A reviewer can export a packet, fill it in outside the
// app, then import it and receive exact row-level errors for stale content,
// unknown ids, missing attestations or malformed measurements.
// ---------------------------------------------------------------------------

import type {
  AnswerCorpusRecord,
  AnswerCorpusProvenance,
} from "./answer-corpus";
import { parseAnswerCorpusJson } from "./answer-corpus";
import {
  evaluatePhysicsAnswerCorpus,
  REQUIRED_PHYSICS_BENCHMARK_CASES,
  type PhysicsBenchmarkCaseTag,
  type PhysicsMarkingBenchmarkReport,
} from "./physics-marking-benchmark";
import {
  applyHumanVerification,
  buildPhysicsReviewQueue,
  humanVerifiedPhysicsQuestion,
  physicsContentFingerprint,
  REQUIRED_HUMAN_CHECKS,
  type PhysicsReviewQueueRow,
} from "./physics-content-review";
import {
  capabilityEdgeFingerprint,
  type CapabilityDependencyReview,
  type CapabilityNode,
} from "./capability-graph";
import {
  calibratedGain,
  durableOutcomeScore,
} from "./intervention-calibration";
import {
  analyseExperiment,
  EXPERIMENT_ARMS,
  type AnalyseExperimentInput,
  type ExperimentAnalysis,
  type ExperimentAssignment,
  type ExperimentEvent,
  type FinalAssessment,
  type AttemptLike,
  type ReviewLike,
  type BaselineAssessment,
} from "./recommendation-experiment";
import type {
  HumanVerificationRecord,
  Id,
  InterventionOutcomeRecord,
  IsoInstant,
  Question,
} from "./types";
import { z } from "zod";

export const PHYSICS_REVIEW_PACKET_VERSION = 1 as const;
export const PHYSICS_PREREQUISITE_PACKET_VERSION = 1 as const;
export const PHYSICS_PAPER_MANIFEST_VERSION = 1 as const;
export const PHYSICS_INTERVENTION_PACKET_VERSION = 1 as const;
export const PHYSICS_EXPERIMENT_PACKET_VERSION = 1 as const;

type PhysicsReviewerRole = NonNullable<HumanVerificationRecord["reviewerRole"]>;

const REVIEWER_ROLES: readonly PhysicsReviewerRole[] = ["examiner", "teacher", "subject-expert"];
const ANSWER_SOURCES: readonly AnswerCorpusProvenance[] = ["official/past-paper", "examiner-reviewed", "teacher-reviewed"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function instant(value: unknown): value is IsoInstant {
  return text(value) && Number.isFinite(Date.parse(value));
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function jsonRows(raw: string, key: string): { value: Record<string, unknown> | null; rows: unknown[]; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { value: null, rows: [], errors: ["File is not valid JSON"] };
  }
  if (Array.isArray(parsed)) return { value: null, rows: parsed, errors: [] };
  if (isObject(parsed) && Array.isArray(parsed[key])) {
    if (parsed.formatVersion !== 1) return { value: parsed, rows: [], errors: ["Unsupported or missing formatVersion; expected 1"] };
    return { value: parsed, rows: parsed[key], errors: [] };
  }
  return { value: isObject(parsed) ? parsed : null, rows: [], errors: [`Expected a JSON array or an object with a ${key} array`] };
}

function allChecks(value: unknown, prefix: string): { checks?: HumanVerificationRecord["checks"]; errors: string[] } {
  if (!isObject(value)) return { errors: [`${prefix}.checks must be an object`] };
  const errors: string[] = [];
  const checks = {} as HumanVerificationRecord["checks"];
  for (const check of REQUIRED_HUMAN_CHECKS) {
    if (!bool(value[check])) errors.push(`${prefix}.checks.${check} must be boolean`);
    else checks[check] = value[check];
  }
  return errors.length ? { errors } : { checks, errors };
}

function reviewRecord(value: unknown, prefix: string, expectedFingerprint: string): { review?: HumanVerificationRecord; errors: string[]; warnings: string[] } {
  if (!isObject(value)) return { errors: [`${prefix} must be an object`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const status = value.status;
  if (status !== "pending" && status !== "approved" && status !== "changes-requested") {
    errors.push(`${prefix}.status must be pending, approved or changes-requested`);
  }
  const checksResult = allChecks(value.checks, prefix);
  errors.push(...checksResult.errors);
  if (!text(value.contentFingerprint) || value.contentFingerprint !== expectedFingerprint) {
    errors.push(`${prefix}.contentFingerprint does not match the current question fingerprint`);
  }
  if (value.reviewerId !== undefined && !text(value.reviewerId)) errors.push(`${prefix}.reviewerId must be a non-empty string`);
  if (value.reviewerRole !== undefined && (!text(value.reviewerRole) || !REVIEWER_ROLES.includes(value.reviewerRole as PhysicsReviewerRole))) {
    errors.push(`${prefix}.reviewerRole must be examiner, teacher or subject-expert`);
  }
  if (value.reviewerQualification !== undefined && !text(value.reviewerQualification)) errors.push(`${prefix}.reviewerQualification must be a non-empty string`);
  if (value.reviewedAt !== undefined && !instant(value.reviewedAt)) errors.push(`${prefix}.reviewedAt must be an ISO instant`);
  if (status === "approved") {
    if (!text(value.reviewerId) || !instant(value.reviewedAt)) errors.push(`${prefix}: an approved decision needs a named reviewer and review time`);
    if (!text(value.reviewerRole) || !REVIEWER_ROLES.includes(value.reviewerRole as PhysicsReviewerRole) || !text(value.reviewerQualification)) {
      errors.push(`${prefix}: an approved Physics decision needs reviewerRole and reviewerQualification`);
    }
    if (checksResult.checks && REQUIRED_HUMAN_CHECKS.some((check) => checksResult.checks?.[check] !== true)) {
      errors.push(`${prefix}: all six human checks must be true before approval`);
    }
  } else if (status === "pending") {
    warnings.push(`${prefix}: pending review remains practice-only`);
  } else if (!text(value.reviewerId) || !instant(value.reviewedAt)) {
    warnings.push(`${prefix}: changes-requested row has no complete reviewer attestation`);
  }
  if (errors.length || !checksResult.checks || !text(status)) return { errors, warnings };
  return {
    review: {
      status: status as HumanVerificationRecord["status"],
      reviewerId: text(value.reviewerId) ? value.reviewerId : undefined,
      reviewerRole: value.reviewerRole as PhysicsReviewerRole | undefined,
      reviewerQualification: text(value.reviewerQualification) ? value.reviewerQualification : undefined,
      reviewedAt: instant(value.reviewedAt) ? value.reviewedAt : undefined,
      contentFingerprint: expectedFingerprint,
      checks: checksResult.checks,
      notes: typeof value.notes === "string" ? value.notes : undefined,
    },
    errors,
    warnings,
  };
}

export interface PhysicsReviewPacketRow {
  questionId: Id;
  fingerprint: string;
  review: HumanVerificationRecord;
  /** The full question is included for reviewer context; the importer always uses the current bank row. */
  question?: Question;
  quality?: unknown;
}

export interface PhysicsReviewPacketTemplateRow {
  question: Question;
  questionId: Id;
  fingerprint: string;
  review: HumanVerificationRecord;
  reviewerInstructions: string;
}

export interface PhysicsReviewImportResult {
  updatedQuestions: Question[];
  approvedQuestionIds: Id[];
  pendingQuestionIds: Id[];
  missingQuestionIds: Id[];
  errors: string[];
  warnings: string[];
  reviewQueue: PhysicsReviewQueueRow[];
}

/** Build the exact packet a reviewer should fill; no approval is created. */
export function buildPhysicsReviewPacketTemplate(questions: readonly Question[]): PhysicsReviewPacketTemplateRow[] {
  return questions
    .filter((question) => question.subjectId === "wjec-alevel-physics")
    .map((question) => {
      const fingerprint = physicsContentFingerprint(question);
      return {
        question,
        questionId: question.id,
        fingerprint,
        review: {
          status: "pending",
          contentFingerprint: fingerprint,
          checks: Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((check) => [check, false])) as HumanVerificationRecord["checks"],
          notes: "Complete all six checks only after solving the item and checking the exact current version.",
        },
        reviewerInstructions: "Enter reviewerId, reviewerRole, reviewerQualification and reviewedAt. Keep this fingerprint unchanged.",
      };
    });
}

/** Import completed packet rows against the current live bank. */
export function importPhysicsReviewPacket(raw: string, questions: readonly Question[]): PhysicsReviewImportResult {
  const parsed = jsonRows(raw, "rows");
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  const byId = new Map(questions.filter((question) => question.subjectId === "wjec-alevel-physics").map((question) => [question.id, question]));
  const seen = new Set<Id>();
  const updated = new Map<Id, Question>();
  const approvedQuestionIds: Id[] = [];
  const pendingQuestionIds: Id[] = [];
  for (const [index, rawRow] of parsed.rows.entries()) {
    const prefix = `Row ${index + 1}`;
    if (!isObject(rawRow)) {
      errors.push(`${prefix}: row must be an object`);
      continue;
    }
    const embedded = isObject(rawRow.question) ? rawRow.question : undefined;
    const questionId = text(rawRow.questionId) ? rawRow.questionId : text(embedded?.id) ? embedded.id : "";
    if (!questionId) {
      errors.push(`${prefix}: questionId is required`);
      continue;
    }
    if (seen.has(questionId)) {
      errors.push(`${prefix}: duplicate questionId ${questionId}`);
      continue;
    }
    seen.add(questionId);
    const current = byId.get(questionId);
    if (!current) {
      errors.push(`${prefix}: unknown Physics question ${questionId}`);
      continue;
    }
    const expected = physicsContentFingerprint(current);
    if (!text(rawRow.fingerprint) || rawRow.fingerprint !== expected) {
      errors.push(`${prefix}: fingerprint is stale for ${questionId}; regenerate the packet`);
      continue;
    }
    if (embedded && physicsContentFingerprint(embedded as unknown as Question) !== expected) {
      errors.push(`${prefix}: embedded question was edited; apply corrections to the bank and regenerate before approval`);
      continue;
    }
    const result = reviewRecord(rawRow.review, prefix, expected);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (!result.review) continue;
    const next = applyHumanVerification(current, result.review);
    if (result.review.status === "approved") {
      if (!humanVerifiedPhysicsQuestion(next)) {
        errors.push(`${prefix}: approval failed the trusted Physics predicate after application`);
        continue;
      }
      approvedQuestionIds.push(questionId);
    } else {
      pendingQuestionIds.push(questionId);
    }
    updated.set(questionId, next);
  }
  const missingQuestionIds = [...byId.keys()].filter((id) => !seen.has(id));
  if (missingQuestionIds.length) warnings.push(`${missingQuestionIds.length} live Physics questions were not present in the packet`);
  const merged = questions.map((question) => updated.get(question.id) ?? question);
  return {
    updatedQuestions: merged,
    approvedQuestionIds,
    pendingQuestionIds,
    missingQuestionIds,
    errors,
    warnings,
    reviewQueue: buildPhysicsReviewQueue(merged),
  };
}

export interface PhysicsPrerequisiteReviewRow {
  targetId: Id;
  targetLabel?: string;
  prerequisiteId: Id;
  prerequisiteLabel?: string | null;
  rationale?: string | null;
  edgeFingerprint: string;
  review: CapabilityDependencyReview;
}

export interface PhysicsPrerequisiteReviewTemplateRow extends PhysicsPrerequisiteReviewRow {
  reviewerInstructions: string;
}

export interface PhysicsPrerequisiteImportResult {
  updatedNodes: CapabilityNode[];
  approvedEdges: string[];
  unresolvedEdges: string[];
  missingEdges: string[];
  errors: string[];
  warnings: string[];
}

export function buildPhysicsPrerequisiteReviewTemplate(nodes: readonly CapabilityNode[]): PhysicsPrerequisiteReviewTemplateRow[] {
  const physics = nodes.filter((node) => node.subjectId === "wjec-alevel-physics");
  const byId = new Map(physics.map((node) => [node.id, node]));
  return physics.flatMap((node) => node.prerequisites.map((prerequisiteId) => {
    const prerequisite = byId.get(prerequisiteId) ?? nodes.find((candidate) => candidate.id === prerequisiteId);
    return {
      targetId: node.id,
      targetLabel: node.label,
      prerequisiteId,
      prerequisiteLabel: prerequisite?.label ?? null,
      rationale: node.prerequisiteRationales?.[prerequisiteId] ?? null,
      edgeFingerprint: capabilityEdgeFingerprint(node, prerequisite ?? prerequisiteId),
      review: { status: "unreviewed" as const },
      reviewerInstructions: "Approve only when the rationale is a real conceptual dependency and the fingerprint matches this graph version.",
    };
  }));
}

function dependencyReview(value: unknown, prefix: string, expectedFingerprint: string): { review?: CapabilityDependencyReview; errors: string[]; warnings: string[] } {
  if (!isObject(value)) return { errors: [`${prefix}.review must be an object`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const status = value.status;
  if (status !== "unreviewed" && status !== "approved" && status !== "rejected") errors.push(`${prefix}.review.status is invalid`);
  if (value.reviewerId !== undefined && !text(value.reviewerId)) errors.push(`${prefix}.review.reviewerId must be a non-empty string`);
  if (value.reviewedAt !== undefined && !instant(value.reviewedAt)) errors.push(`${prefix}.review.reviewedAt must be an ISO instant`);
  if (value.edgeFingerprint !== undefined && value.edgeFingerprint !== expectedFingerprint) errors.push(`${prefix}.review.edgeFingerprint is stale`);
  if (status === "approved") {
    if (!text(value.reviewerId) || !instant(value.reviewedAt)) errors.push(`${prefix}: an approved edge needs a named reviewer and review time`);
    if (value.edgeFingerprint !== expectedFingerprint) errors.push(`${prefix}: an approved edge needs the current edge fingerprint`);
    if (!REVIEWER_ROLES.includes(value.reviewerRole as PhysicsReviewerRole) || !text(value.reviewerQualification)) errors.push(`${prefix}: an approved edge needs reviewerRole and reviewerQualification`);
  } else if (status === "unreviewed") warnings.push(`${prefix}: edge remains a diagnosis hypothesis`);
  if (errors.length || (status !== "unreviewed" && (!text(value.reviewerId) || !instant(value.reviewedAt)))) return { errors, warnings };
  return {
    review: {
      status: status as CapabilityDependencyReview["status"],
      reviewerId: text(value.reviewerId) ? value.reviewerId : undefined,
      reviewerRole: value.reviewerRole as CapabilityDependencyReview["reviewerRole"] | undefined,
      reviewerQualification: text(value.reviewerQualification) ? value.reviewerQualification : undefined,
      reviewedAt: instant(value.reviewedAt) ? value.reviewedAt : undefined,
      edgeFingerprint: expectedFingerprint,
    },
    errors,
    warnings,
  };
}

export function importPhysicsPrerequisiteReviews(raw: string, nodes: readonly CapabilityNode[]): PhysicsPrerequisiteImportResult {
  const parsed = jsonRows(raw, "rows");
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const expectedRows = buildPhysicsPrerequisiteReviewTemplate(nodes);
  const expected = new Map(expectedRows.map((row) => [`${row.targetId}:${row.prerequisiteId}`, row]));
  const seen = new Set<string>();
  const reviews = new Map<string, CapabilityDependencyReview>();
  const approvedEdges: string[] = [];
  const unresolvedEdges: string[] = [];
  for (const [index, rawRow] of parsed.rows.entries()) {
    const prefix = `Row ${index + 1}`;
    if (!isObject(rawRow) || !text(rawRow.targetId) || !text(rawRow.prerequisiteId)) {
      errors.push(`${prefix}: targetId and prerequisiteId are required`);
      continue;
    }
    const key = `${rawRow.targetId}:${rawRow.prerequisiteId}`;
    if (seen.has(key)) {
      errors.push(`${prefix}: duplicate edge ${key}`);
      continue;
    }
    seen.add(key);
    const target = byId.get(rawRow.targetId);
    const prerequisite = byId.get(rawRow.prerequisiteId);
    if (!target || !prerequisite || target.subjectId !== "wjec-alevel-physics" || prerequisite.subjectId !== "wjec-alevel-physics") {
      errors.push(`${prefix}: unknown or non-Physics edge ${key}`);
      continue;
    }
    if (!expected.has(key)) {
      errors.push(`${prefix}: ${key} is not an existing prerequisite edge`);
      continue;
    }
    if (isObject(rawRow.review) && rawRow.review.status === "approved" && !text(target.prerequisiteRationales?.[prerequisite.id])) {
      errors.push(`${prefix}: an approved edge needs a conceptual rationale in the current graph`);
      continue;
    }
    const expectedFingerprint = capabilityEdgeFingerprint(target, prerequisite);
    if (rawRow.edgeFingerprint !== expectedFingerprint) {
      errors.push(`${prefix}: edgeFingerprint is stale for ${key}`);
      continue;
    }
    const result = dependencyReview(rawRow.review, prefix, expectedFingerprint);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (!result.review) continue;
    reviews.set(key, result.review);
    if (result.review.status === "approved") approvedEdges.push(key);
    else unresolvedEdges.push(key);
  }
  const missingEdges = [...expected.keys()].filter((key) => !seen.has(key));
  if (missingEdges.length) warnings.push(`${missingEdges.length} prerequisite edges were not present in the review file`);
  const updatedNodes = nodes.map((node) => {
    if (node.subjectId !== "wjec-alevel-physics" || !node.prerequisites.length) return node;
    const nextReviews = { ...(node.prerequisiteReviews ?? {}) };
    for (const prerequisiteId of node.prerequisites) {
      const review = reviews.get(`${node.id}:${prerequisiteId}`);
      if (review) nextReviews[prerequisiteId] = review;
    }
    return { ...node, prerequisiteReviews: nextReviews };
  });
  return { updatedNodes, approvedEdges, unresolvedEdges, missingEdges, errors, warnings };
}

export interface PhysicsMarkingCorpusIntake {
  file: ReturnType<typeof parseAnswerCorpusJson>["file"];
  records: AnswerCorpusRecord[];
  physicsRecords: AnswerCorpusRecord[];
  externalRows: number;
  independentlyDoubleMarkedRows: number;
  adjudicatedRows: number;
  caseCoverage: Record<PhysicsBenchmarkCaseTag, number>;
  benchmark: PhysicsMarkingBenchmarkReport;
  errors: string[];
  warnings: string[];
  readyForCalibration: boolean;
}

function independentPair(record: AnswerCorpusRecord): boolean {
  return record.humanMark1 != null && record.humanMark2 != null &&
    record.marker1Meta?.independentlyMarked === true && record.marker2Meta?.independentlyMarked === true;
}

function externalPhysicsRecord(record: AnswerCorpusRecord): boolean {
  return record.subject === "wjec-alevel-physics" && ANSWER_SOURCES.includes(record.source);
}

/** Parse a marker export while keeping incomplete and failed rows available for review. */
export function importPhysicsMarkingCorpus(raw: string, questions: readonly Question[]): PhysicsMarkingCorpusIntake {
  const parsed = parseAnswerCorpusJson(raw);
  const records = parsed.records;
  const physicsRecords = records.filter((record) => record.subject === "wjec-alevel-physics");
  const benchmark = evaluatePhysicsAnswerCorpus({ records, questions, provenance: "external-human" });
  const externalRows = physicsRecords.filter(externalPhysicsRecord).length;
  const independentlyDoubleMarkedRows = physicsRecords.filter(independentPair).length;
  const adjudicatedRows = physicsRecords.filter((record) => record.reviewStatus === "adjudicated" && record.adjudicatedMark != null).length;
  const warnings = [...parsed.warnings];
  if (!physicsRecords.length) warnings.push("No WJEC Physics rows were supplied; calibration remains unavailable.");
  if (physicsRecords.some((record) => !externalPhysicsRecord(record))) warnings.push("Internal, synthetic or unreviewed rows are retained for diagnostics but cannot be calibration gold.");
  if (benchmark.missingQuestionIds.length || benchmark.missingPartRecordIds.length) warnings.push("Rows with stale question snapshots remain visible but are excluded from the benchmark.");
  return {
    file: parsed.file,
    records,
    physicsRecords,
    externalRows,
    independentlyDoubleMarkedRows,
    adjudicatedRows,
    caseCoverage: benchmark.caseCoverage,
    benchmark,
    errors: parsed.errors,
    warnings,
    readyForCalibration: benchmark.usableForCalibration,
  };
}

export interface PhysicsPaperManifest {
  paperId: Id;
  sittingId: Id;
  board: "WJEC";
  subjectId: "wjec-alevel-physics";
  qualificationLevel: "alevel";
  specification: string;
  specificationVersion: string;
  year: number;
  series: string;
  sourceUrl: string;
  sourceDigest: string;
  markSchemeDigest?: string;
  markSchemeUrl?: string;
  dataBookletUrl?: string;
  dataBookletDigest?: string;
  durationMinutes?: number;
  maximumMarks?: number;
  questionCount?: number;
  status: "pending" | "verified" | "rejected";
  verifiedBy?: Id;
  verifiedAt?: IsoInstant;
  notes?: string;
}

export interface PhysicsPaperManifestValidation {
  manifest?: PhysicsPaperManifest;
  trusted: boolean;
  errors: string[];
  warnings: string[];
}

export interface PhysicsPaperManifestIntake {
  manifests: PhysicsPaperManifest[];
  trustedManifests: PhysicsPaperManifest[];
  errors: string[];
  warnings: string[];
}

/** Convert a reviewed paper manifest into the per-question provenance shape. */
export function paperProvenanceFromManifest(manifest: PhysicsPaperManifest, questionNumber: string) {
  return {
    board: manifest.board,
    specification: manifest.specification,
    specificationVersion: manifest.specificationVersion,
    paperId: manifest.paperId,
    sittingId: manifest.sittingId,
    year: manifest.year,
    series: manifest.series,
    questionNumber,
    sourceUrl: manifest.sourceUrl,
    sourceDigest: manifest.sourceDigest,
    status: manifest.status,
    ...(manifest.verifiedBy ? { verifiedBy: manifest.verifiedBy } : {}),
    ...(manifest.verifiedAt ? { verifiedAt: manifest.verifiedAt } : {}),
    ...(manifest.notes ? { notes: manifest.notes } : {}),
  };
}

export function validatePhysicsPaperManifest(value: unknown, prefix = "Manifest"): PhysicsPaperManifestValidation {
  if (!isObject(value)) return { trusted: false, errors: [`${prefix} must be an object`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const requiredText: Array<[keyof PhysicsPaperManifest, string]> = [
    ["paperId", "paperId"], ["sittingId", "sittingId"], ["specification", "specification"],
    ["specificationVersion", "specificationVersion"], ["series", "series"], ["sourceDigest", "sourceDigest"],
  ];
  for (const [key, label] of requiredText) if (!text(value[key])) errors.push(`${prefix}.${label} is required`);
  if (value.board !== "WJEC") errors.push(`${prefix}.board must be WJEC`);
  if (value.subjectId !== "wjec-alevel-physics") errors.push(`${prefix}.subjectId must be wjec-alevel-physics`);
  if (value.qualificationLevel !== "alevel") errors.push(`${prefix}.qualificationLevel must be alevel`);
  if (!integer(value.year) || value.year < 2015 || value.year > 2100) errors.push(`${prefix}.year must be an exam year`);
  try {
    const url = new URL(String(value.sourceUrl));
    if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "wjec.co.uk" || url.hostname.endsWith(".wjec.co.uk"))) throw new Error("not official");
  } catch { errors.push(`${prefix}.sourceUrl must be an official WJEC https URL`); }
  if (!text(value.sourceDigest) || !/^(sha256:)?[a-f0-9]{64}$/i.test(value.sourceDigest)) errors.push(`${prefix}.sourceDigest must be a SHA-256 file digest`);
  if (value.markSchemeDigest !== undefined && (!text(value.markSchemeDigest) || !/^(sha256:)?[a-f0-9]{64}$/i.test(value.markSchemeDigest))) errors.push(`${prefix}.markSchemeDigest must be a SHA-256 file digest`);
  for (const key of ["markSchemeUrl", "dataBookletUrl"] as const) {
    if (value[key] === undefined) continue;
    try {
      const url = new URL(String(value[key]));
      if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "wjec.co.uk" || url.hostname.endsWith(".wjec.co.uk"))) throw new Error("not official");
    } catch { errors.push(`${prefix}.${key} must be an official WJEC https URL`); }
  }
  if (value.dataBookletDigest !== undefined && (!text(value.dataBookletDigest) || !/^(sha256:)?[a-f0-9]{64}$/i.test(value.dataBookletDigest))) errors.push(`${prefix}.dataBookletDigest must be a SHA-256 file digest`);
  for (const key of ["durationMinutes", "maximumMarks"] as const) {
    if (value[key] !== undefined && (!integer(value[key]) || value[key] <= 0)) errors.push(`${prefix}.${key} must be a positive integer`);
  }
  if (value.questionCount !== undefined && (!integer(value.questionCount) || value.questionCount < 1)) errors.push(`${prefix}.questionCount must be a positive integer when supplied`);
  if (!["pending", "verified", "rejected"].includes(String(value.status))) errors.push(`${prefix}.status is invalid`);
  if (value.status === "verified") {
    if (!text(value.verifiedBy) || !instant(value.verifiedAt)) errors.push(`${prefix}: verified manifests need verifiedBy and verifiedAt`);
  } else if (value.status === "pending") {
    warnings.push(`${prefix}: pending provenance cannot create trusted paper questions`);
  } else {
    warnings.push(`${prefix}: rejected provenance cannot create trusted paper questions`);
  }
  if (errors.length) return { trusted: false, errors, warnings };
  const manifest = {
    paperId: value.paperId as Id,
    sittingId: value.sittingId as Id,
    board: "WJEC" as const,
    subjectId: "wjec-alevel-physics" as const,
    qualificationLevel: "alevel" as const,
    specification: value.specification as string,
    specificationVersion: value.specificationVersion as string,
    year: value.year as number,
    series: value.series as string,
    sourceUrl: value.sourceUrl as string,
    sourceDigest: value.sourceDigest as string,
    ...(text(value.markSchemeDigest) ? { markSchemeDigest: value.markSchemeDigest as string } : {}),
    ...(text(value.markSchemeUrl) ? { markSchemeUrl: value.markSchemeUrl } : {}),
    ...(text(value.dataBookletUrl) ? { dataBookletUrl: value.dataBookletUrl } : {}),
    ...(text(value.dataBookletDigest) ? { dataBookletDigest: value.dataBookletDigest } : {}),
    ...(integer(value.durationMinutes) ? { durationMinutes: value.durationMinutes } : {}),
    ...(integer(value.maximumMarks) ? { maximumMarks: value.maximumMarks } : {}),
    ...(integer(value.questionCount) ? { questionCount: value.questionCount as number } : {}),
    status: value.status as PhysicsPaperManifest["status"],
    ...(text(value.verifiedBy) ? { verifiedBy: value.verifiedBy as Id } : {}),
    ...(instant(value.verifiedAt) ? { verifiedAt: value.verifiedAt as IsoInstant } : {}),
    ...(typeof value.notes === "string" ? { notes: value.notes } : {}),
  } satisfies PhysicsPaperManifest;
  return { manifest, trusted: manifest.status === "verified", errors, warnings };
}

export function importPhysicsPaperManifests(raw: string): PhysicsPaperManifestIntake {
  const parsed = jsonRows(raw, "papers");
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  const manifests: PhysicsPaperManifest[] = [];
  const trustedManifests: PhysicsPaperManifest[] = [];
  const seen = new Set<string>();
  for (const [index, value] of parsed.rows.entries()) {
    const result = validatePhysicsPaperManifest(value, `Paper ${index + 1}`);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (!result.manifest) continue;
    const key = `${result.manifest.paperId}:${result.manifest.sittingId}`;
    if (seen.has(key)) {
      errors.push(`Paper ${index + 1}: duplicate paper/sitting ${key}`);
      continue;
    }
    seen.add(key);
    manifests.push(result.manifest);
    if (result.trusted) trustedManifests.push(result.manifest);
  }
  if (!manifests.length) warnings.push("No paper manifests supplied; authenticated paper ingestion remains unavailable.");
  return { manifests, trustedManifests, errors, warnings };
}

function validateOutcomeShape(value: unknown, prefix: string): { outcome?: InterventionOutcomeRecord; errors: string[]; warnings: string[] } {
  if (!isObject(value)) return { errors: [`${prefix} must be an object`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (value.subjectId !== "wjec-alevel-physics") errors.push(`${prefix}.subjectId must be wjec-alevel-physics`);
  if (!["diagnose", "guided", "independent", "transfer", "retention"].includes(String(value.kind))) errors.push(`${prefix}.kind is invalid`);
  if (!["unknown", "weak", "developing", "secure"].includes(String(value.priorState))) errors.push(`${prefix}.priorState is invalid`);
  if (!["none", "cue", "prompt", "scaffold", "worked-solution"].includes(String(value.support))) errors.push(`${prefix}.support is invalid`);
  if (!instant(value.createdAt) || !instant(value.updatedAt)) errors.push(`${prefix}: createdAt and updatedAt must be dates`);
  for (const key of ["id", "userId", "subjectId", "topicId", "capabilityId", "kind", "priorState", "support", "createdAt", "updatedAt"] as const) {
    if (!text(value[key])) errors.push(`${prefix}.${key} is required`);
  }
  if (!finite(value.plannedMinutes) || (value.plannedMinutes as number) <= 0) errors.push(`${prefix}.plannedMinutes must be positive`);
  if (!finite(value.actualMinutes) || (value.actualMinutes as number) < 0) errors.push(`${prefix}.actualMinutes must be non-negative`);
  if (value.priorAccuracy !== undefined && (!finite(value.priorAccuracy) || (value.priorAccuracy as number) < 0 || (value.priorAccuracy as number) > 1)) errors.push(`${prefix}.priorAccuracy must be in 0..1`);
  if (value.timeMeasured !== undefined && !bool(value.timeMeasured)) errors.push(`${prefix}.timeMeasured must be boolean`);
  if (value.evidenceVersion !== undefined && value.evidenceVersion !== 2) warnings.push(`${prefix}.evidenceVersion is not v2; it cannot calibrate until migrated`);
  if (!isObject(value.immediate)) errors.push(`${prefix}.immediate is required`);
  const checkScore = (score: unknown, label: string, required: boolean): void => {
    if (score === undefined && !required) return;
    if (!isObject(score)) { errors.push(`${prefix}.${label} must be an object`); return; }
    // Teaching/scheduling observations have no marks; retain their zero-mark row.
    const unscored = label === "immediate" && (value.activity === "teaching" || value.activity === "retrieval");
    if (!finite(score.awarded) || !finite(score.max) || (unscored ? score.max < 0 : score.max <= 0) || score.awarded < 0 || score.awarded > score.max) errors.push(`${prefix}.${label} has invalid marks`);
    if (!bool(score.independent) || !text(score.attemptId) || !instant(score.at)) errors.push(`${prefix}.${label} needs independent, attemptId and at`);
    if (score.trusted !== undefined && !bool(score.trusted)) errors.push(`${prefix}.${label}.trusted must be boolean`);
  };
  checkScore(value.immediate, "immediate", true);
  checkScore(value.transfer, "transfer", false);
  checkScore(value.delayedRetention, "delayedRetention", false);
  for (const key of ["transfer", "delayedRetention"] as const) {
    const score = value[key];
    if (!isObject(score)) continue;
    if (!text(score.questionId)) errors.push(`${prefix}.${key} needs questionId`);
    if (!text(score.familyId)) warnings.push(`${prefix}.${key}: missing family is retained but cannot calibrate`);
  }
  if (value.subjectId === "wjec-alevel-physics" && value.timeMeasured !== true) warnings.push(`${prefix}: unmeasured time is retained but cannot calibrate`);
  if (value.subjectId === "wjec-alevel-physics" && isObject(value.immediate) && value.immediate.trusted !== true) warnings.push(`${prefix}: untrusted immediate Physics content cannot calibrate`);
  if (errors.length) return { errors, warnings };
  return { outcome: value as unknown as InterventionOutcomeRecord, errors, warnings };
}

export interface PhysicsInterventionIntake {
  outcomes: InterventionOutcomeRecord[];
  completeChains: number;
  incompleteChains: number;
  calibratedChains: number;
  failedOrPartialChains: number;
  errors: string[];
  warnings: string[];
}

export function importPhysicsInterventionOutcomes(raw: string): PhysicsInterventionIntake {
  const parsed = jsonRows(raw, "outcomes");
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  const outcomes: InterventionOutcomeRecord[] = [];
  const seen = new Set<string>();
  for (const [index, value] of parsed.rows.entries()) {
    const result = validateOutcomeShape(value, `Outcome ${index + 1}`);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (!result.outcome) continue;
    if (seen.has(result.outcome.id)) {
      errors.push(`Outcome ${index + 1}: duplicate id ${result.outcome.id}`);
      continue;
    }
    seen.add(result.outcome.id);
    outcomes.push(result.outcome);
  }
  const completeChains = outcomes.filter((outcome) => durableOutcomeScore(outcome) != null).length;
  const calibratedChains = outcomes.filter((outcome) => calibratedGain(outcome) != null).length;
  const incompleteChains = outcomes.length - completeChains;
  if (!outcomes.length) warnings.push("No intervention outcomes supplied; conservative priors remain in force.");
  const failedOrPartialChains = outcomes.filter((outcome) => {
    const score = durableOutcomeScore(outcome);
    return score === null || score < 0.8;
  }).length;
  return { outcomes, completeChains, incompleteChains, calibratedChains, failedOrPartialChains, errors, warnings };
}

export interface PhysicsExperimentEvidenceFile {
  formatVersion: typeof PHYSICS_EXPERIMENT_PACKET_VERSION;
  assignments: ExperimentAssignment[];
  events: ExperimentEvent[];
  attempts: AttemptLike[];
  reviews: ReviewLike[];
  masteryByTopic: Record<Id, number>;
  baselineAssessments: BaselineAssessment[];
  finalAssessments: FinalAssessment[];
}

export interface PhysicsExperimentIntake {
  evidence: PhysicsExperimentEvidenceFile | null;
  analysis: ExperimentAnalysis | null;
  errors: string[];
  warnings: string[];
}

// Validate the existing export shape at the file boundary, before analysis.
const idSchema = z.string().trim().min(1);
const dateSchema = z.string().refine(instant, "Invalid date");
const scoreSchema = z.number().finite().min(0).max(100);
const assessmentSchema = z.object({
  anonId: idSchema, subjectId: z.literal("wjec-alevel-physics"), percent: scoreSchema,
  maxMarks: z.number().finite().positive(), takenAt: dateSchema, assessmentVersion: idSchema,
  humanMarked: z.boolean().optional(),
});
const experimentFileSchema = z.object({
  formatVersion: z.literal(1),
  assignments: z.array(z.object({ anonId: idSchema, arm: z.enum(EXPERIMENT_ARMS), assignedAt: dateSchema, version: z.literal(1) })),
  events: z.array(z.object({ anonId: idSchema, taskId: idSchema, activity: idSchema, topicId: idSchema.nullable(), type: z.enum(["shown", "started", "completed", "rejected"]), at: dateSchema })),
  attempts: z.array(z.object({
    anonId: idSchema, subjectId: z.literal("wjec-alevel-physics"), trusted: z.boolean().optional(), topicIds: z.array(idSchema),
    questionId: idSchema, awarded: z.number().finite().nonnegative(), max: z.number().finite().positive(),
    elapsedMs: z.number().finite().nonnegative(), createdAt: dateSchema,
  }).refine((row) => row.awarded <= row.max, "Marks exceed maximum")),
  reviews: z.array(z.object({ anonId: idSchema, cardId: idSchema, reviewedAt: dateSchema, grade: idSchema })),
  masteryByTopic: z.record(z.string(), z.number().finite().min(0).max(1)),
  baselineAssessments: z.array(assessmentSchema),
  finalAssessments: z.array(assessmentSchema.extend({
    matchesBaselineVersion: z.boolean(), heldOutFamilies: z.boolean().optional(), delayedDays: z.number().finite().nonnegative().optional(),
    revisionMinutes: z.number().finite().nonnegative().optional(), delayedAssessment: z.object({
      percent: scoreSchema, maxMarks: z.number().finite().positive(), takenAt: dateSchema, assessmentVersion: idSchema,
      heldOutFamilies: z.boolean(), humanMarked: z.boolean(),
    }).optional(),
  })),
});

export function importPhysicsExperimentEvidence(raw: string): PhysicsExperimentIntake {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { evidence: null, analysis: null, errors: ["File is not valid JSON"], warnings: [] }; }
  if (!isObject(parsed)) return { evidence: null, analysis: null, errors: ["Experiment evidence must be an object"], warnings: [] };
  const validated = experimentFileSchema.safeParse(parsed);
  if (!validated.success) return { evidence: null, analysis: null, errors: validated.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (parsed.formatVersion !== undefined && parsed.formatVersion !== PHYSICS_EXPERIMENT_PACKET_VERSION) errors.push(`Unsupported experiment formatVersion ${String(parsed.formatVersion)}`);
  const arrays = ["assignments", "events", "attempts", "reviews", "baselineAssessments", "finalAssessments"] as const;
  for (const key of arrays) if (!Array.isArray(parsed[key])) errors.push(`Experiment ${key} must be an array`);
  if (!isObject(parsed.masteryByTopic)) errors.push("Experiment masteryByTopic must be an object");
  if (errors.length) return { evidence: null, analysis: null, errors, warnings };
  const assignments = parsed.assignments as ExperimentAssignment[];
  const seen = new Set<string>();
  for (const assignment of assignments) {
    if (!text(assignment.anonId) || !EXPERIMENT_ARMS.includes(assignment.arm)) errors.push(`Invalid experiment assignment ${assignment.anonId ?? "?"}`);
    if (seen.has(assignment.anonId)) errors.push(`Duplicate experiment assignment ${assignment.anonId}`);
    seen.add(assignment.anonId);
  }
  const masteryByTopic: Record<Id, number> = {};
  for (const [topicId, score] of Object.entries(parsed.masteryByTopic as Record<string, unknown>)) {
    if (!finite(score) || score < 0 || score > 1) errors.push(`Invalid mastery score for ${topicId}`);
    else masteryByTopic[topicId] = score;
  }
  if (errors.length) return { evidence: null, analysis: null, errors, warnings };
  const evidence: PhysicsExperimentEvidenceFile = {
    formatVersion: PHYSICS_EXPERIMENT_PACKET_VERSION,
    assignments,
    events: parsed.events as ExperimentEvent[],
    attempts: parsed.attempts as AttemptLike[],
    reviews: parsed.reviews as ReviewLike[],
    masteryByTopic,
    baselineAssessments: parsed.baselineAssessments as BaselineAssessment[],
    finalAssessments: parsed.finalAssessments as FinalAssessment[],
  };
  const analysisInput: AnalyseExperimentInput = { ...evidence, masteryByTopic: new Map(Object.entries(masteryByTopic)) };
  const analysis = analyseExperiment(analysisInput);
  if (!assignments.length) warnings.push("No participants assigned; the four-arm experiment remains enrolling.");
  if (analysis.primaryOutcomeEligibleN === 0) warnings.push("No valid paired baseline/final Physics outcomes yet; no durable marks-per-hour claim is available.");
  return { evidence, analysis, errors, warnings };
}

/** A blank, versioned file for each external collection stream. */
export function emptyPhysicsEvidenceFiles(): {
  reviewRows: PhysicsReviewPacketTemplateRow[];
  prerequisiteRows: PhysicsPrerequisiteReviewTemplateRow[];
  markingCorpus: { formatVersion: 2; benchmarkVersion: string; createdAt: IsoInstant; provenance: string; records: [] };
  paperManifests: { formatVersion: typeof PHYSICS_PAPER_MANIFEST_VERSION; papers: [] };
  interventionOutcomes: { formatVersion: 1; outcomes: [] };
  experiment: PhysicsExperimentEvidenceFile;
} {
  return {
    reviewRows: [],
    prerequisiteRows: [],
    markingCorpus: { formatVersion: 2, benchmarkVersion: "physics-human-gold-v1", createdAt: new Date().toISOString(), provenance: "awaiting qualified marker export", records: [] },
    paperManifests: { formatVersion: PHYSICS_PAPER_MANIFEST_VERSION, papers: [] },
    interventionOutcomes: { formatVersion: PHYSICS_INTERVENTION_PACKET_VERSION, outcomes: [] },
    experiment: {
      formatVersion: PHYSICS_EXPERIMENT_PACKET_VERSION,
      assignments: [], events: [], attempts: [], reviews: [], masteryByTopic: {}, baselineAssessments: [], finalAssessments: [],
    },
  };
}

/** Stable labels for operators and reports; synthetic rows remain visible as such. */
export const PHYSICS_REQUIRED_MARKING_CASES: readonly PhysicsBenchmarkCaseTag[] = REQUIRED_PHYSICS_BENCHMARK_CASES;
