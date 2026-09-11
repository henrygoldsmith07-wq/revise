import { authenticPaperEvidence, independentAttempt, partFamily, trustworthyAttempt } from "./learning-evidence";
import { requiresWjecContentReview, trustedAssessmentContent } from "./physics-content-review";
import type { Attempt, Question } from "./types";

export interface CapabilityNode {
  id: string;
  subjectId: string;
  topicId: string;
  label: string;
  specPointIds: string[];
  prerequisites: string[];
  /** Why each prerequisite blocks this skill; required for curated cross-topic edges. */
  prerequisiteRationales?: Record<string, string>;
  /**
   * Subject-expert attestation for each dependency. Missing metadata is
   * deliberately treated as unreviewed for Physics so a plausible edge
   * cannot silently become a diagnosis rule before review.
   */
  prerequisiteReviews?: Record<string, CapabilityDependencyReview>;
  explanation: string;
}

export type CapabilityDependencyReviewStatus = "unreviewed" | "approved" | "rejected";

export interface CapabilityDependencyReview {
  status: CapabilityDependencyReviewStatus;
  reviewerId?: string;
  /** Optional qualification metadata retained for the external review audit. */
  reviewerRole?: "examiner" | "teacher" | "subject-expert";
  reviewerQualification?: string;
  reviewedAt?: string;
  /** Fingerprint of the target/prerequisite/rationale reviewed by the expert. */
  edgeFingerprint?: string;
}

/** Fingerprint the exact dependency and rationale an expert reviewed. */
export function capabilityEdgeFingerprint(node: CapabilityNode, prerequisite: CapabilityNode | string): string {
  const prerequisiteNode = typeof prerequisite === "string" ? null : prerequisite;
  const prerequisiteId = typeof prerequisite === "string" ? prerequisite : prerequisite.id;
  const text = JSON.stringify([
    node.id, node.subjectId, node.topicId, node.label, node.specPointIds, node.prerequisites, node.explanation,
    prerequisiteId, prerequisiteNode?.subjectId ?? null, prerequisiteNode?.topicId ?? null,
    prerequisiteNode?.label ?? null, prerequisiteNode?.specPointIds ?? null,
    node.prerequisiteRationales?.[prerequisiteId] ?? null,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `capability-edge-v1:${(hash >>> 0).toString(16)}`;
}

export interface SkillEvidence {
  capabilityId: string;
  state: "unknown" | "weak" | "developing" | "secure";
  independentFamilies: number;
  accuracy: number | null;
  supportedSuccesses: number;
  lostMarks: number;
}

export function validateCapabilityGraph(nodes: readonly CapabilityNode[]): string[] {
  const errors: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) errors.push("Duplicate capability id");
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (node: CapabilityNode) => {
    if (visiting.has(node.id)) { errors.push(`Cycle at ${node.id}`); return; }
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    for (const id of node.prerequisites) {
      const prerequisite = byId.get(id);
      if (!prerequisite) errors.push(`Unknown prerequisite ${id}`);
      else if (prerequisite.subjectId !== node.subjectId) errors.push(`Cross-subject prerequisite ${id}`);
      else visit(prerequisite);
    }
    visiting.delete(node.id);
    visited.add(node.id);
  };
  nodes.forEach(visit);
  return errors;
}

/**
 * Check the explanatory metadata for cross-topic prerequisites. A graph can be
 * acyclic and still be pedagogically opaque; requiring a rationale makes every
 * cross-topic edge auditable by a subject expert without burdening legacy
 * within-topic nodes.
 */
export function validatePrerequisiteRationales(nodes: readonly CapabilityNode[], subjectId?: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const errors: string[] = [];
  for (const node of nodes) {
    if (subjectId && node.subjectId !== subjectId) continue;
    for (const prerequisiteId of node.prerequisites) {
      const prerequisite = byId.get(prerequisiteId);
      if (!prerequisite || prerequisite.topicId === node.topicId) continue;
      const rationale = node.prerequisiteRationales?.[prerequisiteId];
      if (!rationale?.trim()) errors.push(`Missing prerequisite rationale ${node.id} <- ${prerequisiteId}`);
    }
  }
  return errors;
}

/**
 * Review gate for dependency assumptions. Physics edges are hypotheses until
 * a named subject expert approves the exact edge and rationale; rejected or
 * stale/malformed attestations stay out of diagnosis. Other subjects retain
 * the legacy behaviour until their own graph is brought under this gate.
 */
export function validatePrerequisiteReviews(nodes: readonly CapabilityNode[], subjectId?: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const errors: string[] = [];
  for (const node of nodes) {
    if (subjectId && node.subjectId !== subjectId) continue;
    if (!subjectId && node.subjectId !== "wjec-alevel-physics") continue;
    for (const prerequisiteId of node.prerequisites) {
      const prerequisite = byId.get(prerequisiteId);
      if (!prerequisite) continue;
      const review = node.prerequisiteReviews?.[prerequisiteId];
      if (review?.status !== "approved") {
        errors.push(`Unreviewed prerequisite ${node.id} <- ${prerequisiteId}`);
        continue;
      }
      if (!review.reviewerId?.trim() || !review.reviewedAt || !Number.isFinite(Date.parse(review.reviewedAt))) {
        errors.push(`Invalid prerequisite review ${node.id} <- ${prerequisiteId}`);
        continue;
      }
      if (!review.edgeFingerprint) errors.push(`Missing prerequisite fingerprint ${node.id} <- ${prerequisiteId}`);
      else if (review.edgeFingerprint !== capabilityEdgeFingerprint(node, prerequisite)) errors.push(`Stale prerequisite review ${node.id} <- ${prerequisiteId}`);
    }
  }
  return errors;
}

function trustedPrerequisiteEdge(node: CapabilityNode, prerequisiteId: string, trustedOnly: boolean, byId: ReadonlyMap<string, CapabilityNode>): boolean {
  if (!trustedOnly || !requiresWjecContentReview(node.subjectId)) return true;
  const review = node.prerequisiteReviews?.[prerequisiteId];
  return review?.status === "approved" && Boolean(review.reviewerId?.trim() && review.reviewedAt && Number.isFinite(Date.parse(review.reviewedAt))) &&
    Boolean(review.edgeFingerprint && review.edgeFingerprint === capabilityEdgeFingerprint(node, byId.get(prerequisiteId) ?? prerequisiteId));
}

/** Part-level evidence only. A combined part cannot locate its smallest failed skill. */
export function deriveSkillEvidence(nodes: readonly CapabilityNode[], questions: readonly Question[], attempts: readonly Attempt[]): Map<string, SkillEvidence> {
  const byQuestion = new Map(questions.map((q) => [q.id, q]));
  const result = new Map<string, SkillEvidence>();
  for (const node of nodes) {
    const families = new Map<string, { awarded: number; max: number }>();
    let supportedSuccesses = 0;
    let lostMarks = 0;
    const seenAttempts = new Set<string>();
    for (const attempt of [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (seenAttempts.has(attempt.id) || !trustworthyAttempt(attempt)) continue;
      seenAttempts.add(attempt.id);
      const question = byQuestion.get(attempt.questionId);
      if (!question || question.subjectId !== node.subjectId) continue;
      // Draft Physics questions remain useful for practice, but their marks
      // cannot establish capability mastery. Paper attempts additionally need
      // authenticated provenance and a human marking attestation.
      if (!trustedAssessmentContent(question)) continue;
      if (requiresWjecContentReview(question.subjectId) && attempt.mode === "paper" &&
        !authenticPaperEvidence(attempt, question, attempts, questions)) continue;
      const parts = question.parts.filter((p) => p.capabilityIds?.length === 1 && p.capabilityIds[0] === node.id);
      const marks = parts.flatMap((part) => {
        const marked = attempt.marked.find((m) => m.partId === part.id && m.max === part.marks && m.awarded >= 0 && m.awarded <= m.max);
        return marked ? [marked] : [];
      });
      if (!marks.length) continue;
      const awarded = marks.reduce((sum, p) => sum + p.awarded, 0);
      const max = marks.reduce((sum, p) => sum + p.max, 0);
      lostMarks += max - awarded;
      if (independentAttempt(attempt)) {
        // Keep the first independent encounter with each part family:
        // memorised retries cannot inflate transfer coverage on mixed questions.
        const familyIds = [...new Set(parts.map((part) => partFamily(question, part)))];
        for (const familyId of familyIds) {
          if (!families.has(familyId)) families.set(familyId, { awarded, max });
        }
      } else if (awarded === max) supportedSuccesses++;
    }
    const recent = [...families.values()].slice(-6);
    const max = recent.reduce((sum, p) => sum + p.max, 0);
    const accuracy = max ? recent.reduce((sum, p) => sum + p.awarded, 0) / max : null;
    result.set(node.id, {
      capabilityId: node.id, independentFamilies: recent.length, accuracy, supportedSuccesses, lostMarks,
      state: accuracy === null ? "unknown" : accuracy < 0.7 ? "weak" : recent.length >= 3 && accuracy >= 0.85 ? "secure" : "developing",
    });
  }
  return result;
}

/** Weak upstream skills win; unknown foundations receive a probe, not a diagnosis. */
export function smallestUnprovenCapability(
  targetIds: readonly string[],
  nodes: readonly CapabilityNode[],
  evidence: ReadonlyMap<string, SkillEvidence>,
  options: { trustedOnly?: boolean } = {},
): CapabilityNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const ordered: CapabilityNode[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    node.prerequisites.forEach((prerequisiteId) => {
      if (trustedPrerequisiteEdge(node, prerequisiteId, options.trustedOnly === true, byId)) visit(prerequisiteId);
    });
    ordered.push(node);
  };
  targetIds.forEach(visit);
  return ordered.find((n) => evidence.get(n.id)?.state === "weak") ??
    ordered.find((n) => !evidence.has(n.id) || evidence.get(n.id)?.state === "unknown") ??
    ordered.find((n) => evidence.get(n.id)?.state === "developing");
}
