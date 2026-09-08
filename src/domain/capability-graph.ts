import { independentAttempt, questionFamily, trustworthyAttempt } from "./learning-evidence";
import type { Attempt, Question } from "./types";

export interface CapabilityNode {
  id: string;
  subjectId: string;
  topicId: string;
  label: string;
  specPointIds: string[];
  prerequisites: string[];
  explanation: string;
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
        // Keep the first independent encounter with each family: memorised retries cannot inflate it.
        if (!families.has(questionFamily(question))) families.set(questionFamily(question), { awarded, max });
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
export function smallestUnprovenCapability(targetIds: readonly string[], nodes: readonly CapabilityNode[], evidence: ReadonlyMap<string, SkillEvidence>): CapabilityNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const ordered: CapabilityNode[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    node.prerequisites.forEach(visit);
    ordered.push(node);
  };
  targetIds.forEach(visit);
  return ordered.find((n) => evidence.get(n.id)?.state === "weak") ??
    ordered.find((n) => !evidence.has(n.id) || evidence.get(n.id)?.state === "unknown") ??
    ordered.find((n) => evidence.get(n.id)?.state === "developing");
}
