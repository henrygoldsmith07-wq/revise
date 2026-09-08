import { deriveSkillEvidence, smallestUnprovenCapability, type CapabilityNode } from "./capability-graph";
import { isTransferQuestion, questionCapabilities, unseenQuestion } from "./learning-evidence";
import { repairTargetParts } from "./repair-evidence";
import type { Attempt, Mistake, Question } from "./types";

export interface LearningAction {
  kind: "diagnose" | "guided" | "independent" | "transfer" | "retention";
  question: Question;
  capabilityId: string;
  mistakeId?: string;
  teaching: boolean;
  minutes: number;
  reason: string;
  /** An explicit policy prior, not a measured causal effect or calibrated prediction. */
  expectedGainPerMinute: number;
  calibrated: false;
}

export function selectLearningAction(input: {
  topicId: string; nodes: readonly CapabilityNode[]; questions: readonly Question[];
  attempts: readonly Attempt[]; mistakes: readonly Mistake[]; now: Date; remainingMinutes?: number;
}): LearningAction | undefined {
  const { topicId, nodes, questions, attempts, now } = input;
  const evidence = deriveSkillEvidence(nodes, questions, attempts);
  const candidates: LearningAction[] = [];
  const eligible = questions.filter((q) => q.topicIds.includes(topicId) && q.learning &&
    !["rejected", "retired", "needs_changes"].includes(q.validation?.stage ?? ""));
  const add = (kind: LearningAction["kind"], capabilityId: string, pool: Question[], reason: string, mistake?: Mistake) => {
    for (const question of pool) {
      const minutes = Math.max(0.5, question.learning?.expectedMinutes ?? question.totalMarks * 0.75);
      if (minutes > (input.remainingMinutes ?? Infinity)) continue;
      const lost = mistake?.marksLost ?? evidence.get(capabilityId)?.lostMarks ?? 1;
      const gap = 1 - (evidence.get(capabilityId)?.accuracy ?? 0.35);
      const gainPrior = { diagnose: 0.35, guided: 0.45, independent: 0.6, transfer: 0.7, retention: 0.8 }[kind];
      candidates.push({ kind, question, capabilityId, ...(mistake ? { mistakeId: mistake.id } : {}),
        teaching: kind === "guided", minutes, reason,
        expectedGainPerMinute: gainPrior * Math.min(5, Math.max(1, lost)) * (0.4 + gap) / minutes,
        calibrated: false });
    }
  };
  const open = input.mistakes.filter((m) => !m.resolved && m.topicId === topicId);
  for (const mistake of open) {
    const capabilityId = mistake.capabilityIds?.length === 1 ? mistake.capabilityIds[0]! : undefined;
    if (!capabilityId) continue;
    const target = nodes.find((n) => n.id === capabilityId);
    if (!target) continue;
    const stage = mistake.repair?.stage ?? "diagnosed";
    if (stage === "transfer" && mistake.repair?.dueAt && Date.parse(mistake.repair.dueAt) > now.getTime()) continue;
    const root = smallestUnprovenCapability([capabilityId], nodes, evidence);
    if (root && root.id !== capabilityId && ["weak", "unknown"].includes(evidence.get(root.id)?.state ?? "unknown")) {
      const probes = eligible.filter((q) => questionCapabilities(q).includes(root.id) && unseenQuestion(q, attempts, questions));
      add("diagnose", root.id, probes, `Check ${root.label.toLowerCase()} first; the upstream cause is still a hypothesis.`, mistake);
      if (probes.length) continue;
    }
    const relevant = eligible.filter((q) => repairTargetParts(mistake, q).length > 0);
    const fresh = relevant.filter((q) => unseenQuestion(q, attempts, questions));
    if (["detected", "diagnosed", "taught"].includes(stage)) {
      const source = relevant.filter((q) => q.id === mistake.questionId);
      add("guided", capabilityId, source, `Repair ${target.label.toLowerCase()}, then complete one guided attempt.`, mistake);
    } else if (stage === "guided-success") {
      add("independent", capabilityId, fresh.filter((q) => ["application", "calculation"].includes(q.learning!.demand)),
        `The guided answer held. Test ${target.label.toLowerCase()} on a fresh question without help.`, mistake);
    } else if (stage === "independent-success") {
      const source = questions.find((q) => q.id === mistake.questionId);
      add("transfer", capabilityId, fresh.filter((q) => source && isTransferQuestion(q, source)),
        "Independent success held. Apply the same skill in an unfamiliar context.", mistake);
    } else if (stage === "transfer") {
      add("retention", capabilityId, fresh.filter((q) => ["application", "calculation", "transfer", "synoptic"].includes(q.learning!.demand)),
        "The delayed check is due. Retrieve and apply the skill without help to test whether the repair lasted.", mistake);
    }
  }
  if (!candidates.length) {
    const waiting = new Set(open.filter((m) => m.repair?.stage === "transfer" && m.repair.dueAt && Date.parse(m.repair.dueAt) > now.getTime()).flatMap((m) => m.capabilityIds ?? []));
    const targets = nodes.filter((n) => n.topicId === topicId && !waiting.has(n.id));
    const orderedTargets = [...targets].sort((a, b) => {
      const rank = (id: string) => ({ unknown: 0, weak: 1, developing: 2, secure: 3 }[evidence.get(id)?.state ?? "unknown"]);
      return rank(a.id) - rank(b.id);
    });
    for (const target of orderedTargets) {
      const pool = eligible.filter((q) => questionCapabilities(q).includes(target.id) && unseenQuestion(q, attempts, questions) && !isTransferQuestion(q));
      if (!pool.length) continue;
      add("diagnose", target.id, pool, `One short question will check ${target.label.toLowerCase()} before choosing an explanation.`);
      break;
    }
  }
  return candidates.sort((a, b) =>
    Number(b.kind === "retention") - Number(a.kind === "retention") ||
    b.expectedGainPerMinute - a.expectedGainPerMinute || a.question.id.localeCompare(b.question.id))[0];
}
