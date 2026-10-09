/** Exact content identity and human attestation. No audit or learner graph dependency. */
import { canonicalJson, sha256Hex } from "./content-fingerprint";
import { localDayOfInstant } from "./local-date";
import { validAttestationInstant, validOfficialWjecUrl, validSha256Digest, WJEC_ATTESTATION_ROLES } from "./trust-attestation";
import type { HumanVerificationRecord, Id, Question } from "./types";
import { isFlagship } from "./flagship";
import { OFFICIAL_PAPER_TRUST_TIER, type OfficialPaperTrustTier } from "./official-papers";

/**
 * Official-paper trust tier marker. Re-exported here so the tier is explicit
 * in the trust module, but it is deliberately NOT part of any trust
 * predicate below: trustedAssessmentContent, humanVerifiedWjecQuestion and
 * the review gates never consult it. It counts toward proof only through the
 * dedicated officialPaperProofEligible gate, per learner, with the feature
 * flag on, for a paper not previously attempted.
 */
export const OfficialPaperTier: OfficialPaperTrustTier = OFFICIAL_PAPER_TRUST_TIER;

export const PHYSICS_SUBJECT_ID = "wjec-alevel-physics";
export const REVIEWED_WJEC_SUBJECT_IDS = [PHYSICS_SUBJECT_ID, "wjec-alevel-maths", "wjec-alevel-biology", "wjec-alevel-chemistry"] as const;
export const WJEC_REVIEWER_ROLES = WJEC_ATTESTATION_ROLES;
function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function validHumanReviewInstant(value: unknown, nowMs = Date.now()): value is string {
  return validAttestationInstant(value, nowMs);
}
export function requiresWjecContentReview(subjectId: string | undefined): boolean {
  return REVIEWED_WJEC_SUBJECT_IDS.some((id) => id === subjectId);
}
export const REQUIRED_HUMAN_CHECKS = ["question", "marking", "workedSolution", "capabilityMapping", "specificationMapping", "examRealism"] as const;

/**
 * Exact-content change detector for review attestations.
 *
 * This is not an identity signature: reviewer identity is still a separate
 * human attestation. v3 replaces the old 32-bit v2 hash with canonical SHA-256.
 */
export function physicsContentFingerprint(question: Question): string {
  const reviewPayload = [question.id, question.subjectId, question.topicIds,
    question.specPointIds, question.stem, question.parts, question.totalMarks,
    question.difficulty, question.aos,
    question.learning, question.options, question.correctIndex, question.calculatorAllowed,
    question.source, question.origin, question.licensedSource, question.paperId, question.paperQuestionNumber,
    question.paperProvenance, question.specVersion];
  return `wjec-review-v3:sha256:${sha256Hex(canonicalJson(reviewPayload))}`;
}

export type PhysicsReviewQueueRow = {
  questionId: Id;
  topicIds: Id[];
  specPointIds: Id[];
  missingChecks: Array<(typeof REQUIRED_HUMAN_CHECKS)[number]>;
  status: HumanVerificationRecord["status"] | "unreviewed";
};

export type HumanVerificationIssue =
  | "subject-not-review-gated"
  | "not-approved"
  | "missing-reviewer-id"
  | "missing-reviewer-role"
  | "missing-reviewer-qualification"
  | "invalid-reviewed-at"
  | "missing-human-check"
  | "stale-content-fingerprint"
  | "invalid-paper-provenance"
  | "blocked-validation-stage";

/**
 * Canonical human-review contract for all four WJEC flagships.
 *
 * Every path that can turn content into trusted assessment evidence must use
 * this exact predicate. Importers may perform extra file-shape validation, but
 * they are not allowed to define a weaker or stronger approval contract.
 */
export function humanVerificationIssues(
  question: Question,
  record: HumanVerificationRecord | undefined,
): HumanVerificationIssue[] {
  const issues: HumanVerificationIssue[] = [];
  if (!requiresWjecContentReview(question.subjectId)) issues.push("subject-not-review-gated");
  if (record?.status !== "approved") issues.push("not-approved");
  if (!nonBlank(record?.reviewerId)) issues.push("missing-reviewer-id");
  if (!record?.reviewerRole || !WJEC_REVIEWER_ROLES.includes(record.reviewerRole)) issues.push("missing-reviewer-role");
  if (!nonBlank(record?.reviewerQualification)) issues.push("missing-reviewer-qualification");
  if (!validHumanReviewInstant(record?.reviewedAt)) issues.push("invalid-reviewed-at");
  if (!record || REQUIRED_HUMAN_CHECKS.some((check) => record.checks?.[check] !== true)) issues.push("missing-human-check");
  if (record?.contentFingerprint !== physicsContentFingerprint(question)) issues.push("stale-content-fingerprint");
  if (question.source === "past-paper" && !verifiedWjecPaperProvenance(question)) issues.push("invalid-paper-provenance");
  if (["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "")) issues.push("blocked-validation-stage");
  return [...new Set(issues)];
}

export function validHumanVerification(
  question: Question,
  record: HumanVerificationRecord | undefined,
): boolean {
  return humanVerificationIssues(question, record).length === 0;
}

/** A question is trusted only when every component has an approved check. */
export function humanVerifiedPhysicsQuestion(question: Question): boolean {
  return question.subjectId === PHYSICS_SUBJECT_ID && humanVerifiedWjecQuestion(question);
}

/** Same six-check and edit-invalidation contract for all four WJEC flagships. */
export function humanVerifiedWjecQuestion(question: Question): boolean {
  return question.verification === "verified" && validHumanVerification(question, question.humanVerification);
}

export function trustedAssessmentContent(question: Question): boolean {
  return !requiresWjecContentReview(question.subjectId) || humanVerifiedWjecQuestion(question);
}

/**
 * Learner-evidence trust. Deliberately stricter than
 * `trustedAssessmentContent`, and the two are not interchangeable.
 *
 * `trustedAssessmentContent` is deliberately permissive for subjects with no
 * review gate: authoring, supply and curriculum paths rely on that, and it is
 * kept exactly as it is. But an exam candidate is entitled to know that
 * "Proven" means *a qualified human checked this*. Reference-tier subjects are
 * cloned outlines the UI labels "not checked against the specification"
 * (`trustNoteFor`, `trust-indicator`, `docs/learner-model.md`), yet they pass
 * the permissive predicate unchecked — so unreviewed reference answers were
 * producing a learner-visible "Proven" claim.
 *
 * Proof therefore requires flagship **and** the human review contract. This
 * loosens nothing: it only closes the gap between what the app claims and
 * what it can show.
 */
export function learnerEvidenceTrusted(question: Question | undefined): boolean {
  if (!question) return false;
  return isFlagship(question.subjectId) && trustedAssessmentContent(question);
}

/**
 * A paper item is authentic only when its WJEC source manifest was checked by
 * a named reviewer. This is deliberately separate from question-content
 * approval: provenance and marking quality are two independent gates.
 */
export function verifiedPhysicsPaperProvenance(question: Question): boolean {
  return question.subjectId === PHYSICS_SUBJECT_ID && verifiedWjecPaperProvenance(question);
}

export function verifiedWjecPaperProvenance(question: Question): boolean {
  const provenance = question.paperProvenance;
  return requiresWjecContentReview(question.subjectId) && question.source === "past-paper" &&
    Boolean(nonBlank(question.paperId) && nonBlank(question.paperQuestionNumber) && provenance &&
      provenance.status === "verified" && nonBlank(provenance.board) && provenance.board.toLowerCase() === "wjec" &&
      provenance.paperId === question.paperId && provenance.questionNumber === question.paperQuestionNumber &&
      nonBlank(provenance.specification) && validOfficialWjecUrl(provenance.sourceUrl) &&
      validSha256Digest(provenance.sourceDigest) && nonBlank(provenance.verifiedBy) && nonBlank(provenance.verifiedAt) &&
      validAttestationInstant(provenance.verifiedAt) &&
      (!provenance.specificationVersion || !question.specVersion || provenance.specificationVersion === question.specVersion));
}

/** Questions requiring editorial review before they can provide trusted transfer evidence. */
export function buildPhysicsReviewQueue(questions: readonly Question[], subjectId: Id = PHYSICS_SUBJECT_ID): PhysicsReviewQueueRow[] {
  return questions
    .filter((question) => question.subjectId === subjectId)
    .flatMap((question) => {
      if (humanVerifiedWjecQuestion(question)) return [];
      const checks = question.humanVerification?.checks;
      const missingChecks = REQUIRED_HUMAN_CHECKS.filter((check) => !checks?.[check]);
      const status: PhysicsReviewQueueRow["status"] = question.humanVerification?.status ?? "unreviewed";
      return [{
        questionId: question.id,
        topicIds: question.topicIds,
        specPointIds: question.specPointIds ?? question.parts.flatMap((part) => part.specPointIds ?? []),
        missingChecks,
        status,
      }];
    });
}

/** Apply an immutable review decision; incomplete approvals remain untrusted. */
export function applyHumanVerification(question: Question, record: HumanVerificationRecord): Question {
  const approved = validHumanVerification(question, record);
  return {
    ...question,
    humanVerification: { ...record, status: approved ? "approved" : record.status === "approved" ? "pending" : record.status },
    ...(approved ? { verification: "verified" as const, reviewer: record.reviewerId ?? question.reviewer ?? null, lastChecked: record.reviewedAt ? localDayOfInstant(record.reviewedAt) : (question.lastChecked ?? null) } :
      { verification: "unverified" as const, reviewer: null, lastChecked: null }),
  };
}
