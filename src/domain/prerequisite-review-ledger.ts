import {
  capabilityEdgeFingerprint,
  capabilityEdgeFingerprintMatches,
  type CapabilityDependencyReview,
  type CapabilityNode,
} from "./capability-graph";
import { validAttestationInstant, WJEC_ATTESTATION_ROLES } from "./trust-attestation";
import type { Id } from "./types";

export const WJEC_PREREQUISITE_LEDGER_VERSION = 1 as const;

export interface PrerequisiteReviewLedgerEntry {
  subjectId: Id;
  targetId: Id;
  prerequisiteId: Id;
  edgeFingerprint: string;
  review: CapabilityDependencyReview;
}

export interface PrerequisiteReviewLedgerIssue {
  key: string;
  kind: "invalid-file" | "invalid-entry" | "unknown-edge" | "subject-mismatch" | "historical-fingerprint" | "invalid-decision" | "duplicate-entry";
  detail: string;
  blocking: boolean;
}

export interface PrerequisiteReviewLedgerFile {
  formatVersion: typeof WJEC_PREREQUISITE_LEDGER_VERSION;
  entries: PrerequisiteReviewLedgerEntry[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function prerequisiteReviewLedgerKey(targetId: Id, prerequisiteId: Id, fingerprint: string): string {
  return `${targetId}<-${prerequisiteId}::${fingerprint}`;
}

function validDecision(review: CapabilityDependencyReview): boolean {
  return (review.status === "approved" || review.status === "rejected") && text(review.reviewerId) &&
    Boolean(review.reviewerRole && WJEC_ATTESTATION_ROLES.includes(review.reviewerRole)) &&
    text(review.reviewerQualification) && validAttestationInstant(review.reviewedAt);
}

export function applyPrerequisiteReviewLedger(
  nodes: readonly CapabilityNode[],
  raw: unknown,
): { nodes: CapabilityNode[]; appliedKeys: string[]; historicalKeys: string[]; issues: PrerequisiteReviewLedgerIssue[] } {
  const issues: PrerequisiteReviewLedgerIssue[] = [];
  const appliedKeys: string[] = [];
  const historicalKeys: string[] = [];
  if (!object(raw) || raw.formatVersion !== WJEC_PREREQUISITE_LEDGER_VERSION || !Array.isArray(raw.entries)) {
    return { nodes: [...nodes], appliedKeys, historicalKeys, issues: [{ key: "file", kind: "invalid-file", detail: "Prerequisite ledger must be a version-1 object with an entries array.", blocking: true }] };
  }
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const current = new Map<string, CapabilityDependencyReview>();
  const seen = new Set<string>();

  for (const [index, value] of raw.entries.entries()) {
    const rowKey = `row-${index + 1}`;
    if (!object(value) || !text(value.subjectId) || !text(value.targetId) || !text(value.prerequisiteId) || !text(value.edgeFingerprint) || !object(value.review)) {
      issues.push({ key: rowKey, kind: "invalid-entry", detail: "Entry needs subjectId, targetId, prerequisiteId, edgeFingerprint and review.", blocking: true });
      continue;
    }
    const key = prerequisiteReviewLedgerKey(value.targetId, value.prerequisiteId, value.edgeFingerprint);
    if (seen.has(key)) {
      issues.push({ key, kind: "duplicate-entry", detail: "Duplicate prerequisite attestation.", blocking: true });
      continue;
    }
    seen.add(key);
    const target = byId.get(value.targetId);
    const prerequisite = byId.get(value.prerequisiteId);
    if (!target || !prerequisite || !target.prerequisites.includes(value.prerequisiteId)) {
      historicalKeys.push(key);
      issues.push({ key, kind: "unknown-edge", detail: "Prerequisite edge is no longer present in the current graph.", blocking: false });
      continue;
    }
    if (target.subjectId !== value.subjectId || prerequisite.subjectId !== value.subjectId) {
      issues.push({ key, kind: "subject-mismatch", detail: "Ledger subject does not match the current prerequisite edge.", blocking: true });
      continue;
    }
    if (!text(value.review.edgeFingerprint) || value.review.edgeFingerprint !== value.edgeFingerprint) {
      issues.push({ key, kind: "invalid-entry", detail: "Ledger entry fingerprint and review fingerprint must match.", blocking: true });
      continue;
    }
    if (!capabilityEdgeFingerprintMatches(value.edgeFingerprint, target, prerequisite)) {
      historicalKeys.push(key);
      issues.push({ key, kind: "historical-fingerprint", detail: "Attestation belongs to an older edge definition and is retained as history only.", blocking: false });
      continue;
    }
    const review: CapabilityDependencyReview = {
      status: value.review.status as CapabilityDependencyReview["status"],
      reviewerId: text(value.review.reviewerId) ? value.review.reviewerId : undefined,
      reviewerRole: value.review.reviewerRole as CapabilityDependencyReview["reviewerRole"] | undefined,
      reviewerQualification: text(value.review.reviewerQualification) ? value.review.reviewerQualification : undefined,
      reviewedAt: text(value.review.reviewedAt) ? value.review.reviewedAt : undefined,
      edgeFingerprint: value.edgeFingerprint,
    };
    if (!validDecision(review)) {
      issues.push({ key, kind: "invalid-decision", detail: "Current prerequisite decision needs approved/rejected status, a named qualified reviewer and a valid non-future instant.", blocking: true });
      continue;
    }
    current.set(`${target.id}<-${prerequisite.id}`, review);
  }

  const next = nodes.map((node) => {
    if (!node.prerequisites.length) return node;
    const reviews = { ...(node.prerequisiteReviews ?? {}) };
    let changed = false;
    for (const prerequisiteId of node.prerequisites) {
      const review = current.get(`${node.id}<-${prerequisiteId}`);
      if (!review) continue;
      reviews[prerequisiteId] = review;
      appliedKeys.push(prerequisiteReviewLedgerKey(node.id, prerequisiteId, review.edgeFingerprint!));
      changed = true;
    }
    return changed ? { ...node, prerequisiteReviews: reviews } : node;
  });
  return { nodes: next, appliedKeys, historicalKeys, issues };
}

export function buildPrerequisiteReviewLedgerEntry(
  target: CapabilityNode,
  prerequisite: CapabilityNode,
  review: CapabilityDependencyReview,
): PrerequisiteReviewLedgerEntry {
  const edgeFingerprint = capabilityEdgeFingerprint(target, prerequisite);
  const normalized = { ...review, edgeFingerprint };
  if (!validDecision(normalized)) throw new Error(`Prerequisite edge ${target.id}<-${prerequisite.id} is not eligible for the ledger.`);
  return { subjectId: target.subjectId, targetId: target.id, prerequisiteId: prerequisite.id, edgeFingerprint, review: normalized };
}

export function mergePrerequisiteReviewLedger(raw: unknown, additions: readonly PrerequisiteReviewLedgerEntry[]): PrerequisiteReviewLedgerFile {
  const existing = object(raw) && raw.formatVersion === WJEC_PREREQUISITE_LEDGER_VERSION && Array.isArray(raw.entries)
    ? raw.entries.filter(object) as unknown as PrerequisiteReviewLedgerEntry[]
    : [];
  const merged = new Map(existing.map((entry) => [prerequisiteReviewLedgerKey(entry.targetId, entry.prerequisiteId, entry.edgeFingerprint), entry]));
  for (const entry of additions) merged.set(prerequisiteReviewLedgerKey(entry.targetId, entry.prerequisiteId, entry.edgeFingerprint), entry);
  return { formatVersion: WJEC_PREREQUISITE_LEDGER_VERSION, entries: [...merged.values()].sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.targetId.localeCompare(b.targetId) || a.prerequisiteId.localeCompare(b.prerequisiteId)) };
}
