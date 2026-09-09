import { deriveSkillEvidence, smallestUnprovenCapability, type CapabilityNode } from "./capability-graph";
import { isTransferQuestion, partLearningMetadata, questionCapabilities, questionDemands, unseenQuestion } from "./learning-evidence";
import { repairTargetParts } from "./repair-evidence";
import { calibrateInterventions, effectivenessFor } from "./intervention-calibration";
import { humanVerifiedPhysicsQuestion, trustedAssessmentContent } from "./physics-content-review";
import type { Attempt, InterventionOutcomeRecord, Mistake, Question, InterventionPriorState } from "./types";

export interface LearningAction {
  kind: "diagnose" | "guided" | "independent" | "transfer" | "retention";
  question: Question;
  capabilityId: string;
  topicId?: string;
  priorState: InterventionPriorState;
  priorAccuracy?: number;
  mistakeId?: string;
  teaching: boolean;
  minutes: number;
  reason: string;
  /** An explicit policy prior, not a measured causal effect or calibrated prediction. */
  expectedGainPerMinute: number;
  calibrated: boolean;
  calibrationSampleSize: number;
  contentTrust: "human-verified" | "needs-human-review";
}

export function selectLearningAction(input: {
  topicId: string; nodes: readonly CapabilityNode[]; questions: readonly Question[];
  attempts: readonly Attempt[]; mistakes: readonly Mistake[]; now: Date; remainingMinutes?: number;
  interventionOutcomes?: readonly InterventionOutcomeRecord[];
}): LearningAction | undefined {
  const { topicId, nodes, questions, attempts, now } = input;
  const trustedQuestions = questions.filter(trustedAssessmentContent);
  const evidence = deriveSkillEvidence(nodes, trustedQuestions, attempts);
  const baselineEvidence = evidence;
  const calibrations = calibrateInterventions(input.interventionOutcomes ?? []);
  const candidates: LearningAction[] = [];
  const hasLearningMetadata = (q: Question) => Boolean(q.learning || q.parts.some((part) => partLearningMetadata(q, part)));
  const eligible = questions.filter((q) => q.topicIds.includes(topicId) && hasLearningMetadata(q) &&
    !["rejected", "retired", "needs_changes"].includes(q.validation?.stage ?? ""));
  const add = (kind: LearningAction["kind"], capabilityId: string, pool: Question[], reason: string, mistake?: Mistake) => {
    const trustedPool = (kind === "transfer" || kind === "retention")
      ? pool.filter(trustedAssessmentContent)
      : pool;
    const selectedPool = trustedPool;
    for (const question of selectedPool) {
      const minutes = Math.max(0.5, question.learning?.expectedMinutes ?? question.totalMarks * 0.75);
      if (minutes > (input.remainingMinutes ?? Infinity)) continue;
      const lost = mistake?.marksLost ?? evidence.get(capabilityId)?.lostMarks ?? 1;
      const gap = 1 - (evidence.get(capabilityId)?.accuracy ?? 0.35);
      const effect = effectivenessFor(kind, capabilityId, calibrations, question.subjectId);
      const trust = humanVerifiedPhysicsQuestion(question) ? "human-verified" as const : "needs-human-review" as const;
      candidates.push({ kind, question, capabilityId, priorState: evidence.get(capabilityId)?.state ?? "unknown", ...(mistake ? { mistakeId: mistake.id } : {}),
        topicId: nodes.find((node) => node.id === capabilityId)?.topicId ?? question.topicIds[0] ?? topicId,
        ...(baselineEvidence.get(capabilityId)?.accuracy != null ? { priorAccuracy: baselineEvidence.get(capabilityId)!.accuracy! } : {}),
        teaching: kind === "guided", minutes, reason,
        expectedGainPerMinute: effect.gainPerMinute * Math.min(5, Math.max(1, lost)) * (0.4 + gap),
        calibrated: effect.calibrated,
        calibrationSampleSize: effect.sampleSize,
        contentTrust: trust });
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
      const probes = questions.filter((q) => q.subjectId === root.subjectId && hasLearningMetadata(q) &&
        !["rejected", "retired", "needs_changes"].includes(q.validation?.stage ?? "") &&
        questionCapabilities(q).includes(root.id) && unseenQuestion(q, attempts, questions));
      add("diagnose", root.id, probes, `Check ${root.label.toLowerCase()} first; the upstream cause is still a hypothesis.`, mistake);
      if (probes.length) continue;
    }
    const relevant = eligible.filter((q) => repairTargetParts(mistake, q).length > 0);
    const fresh = relevant.filter((q) => unseenQuestion(q, attempts, questions));
    if (["detected", "diagnosed", "taught"].includes(stage)) {
      const source = relevant.filter((q) => q.id === mistake.questionId);
      add("guided", capabilityId, source, `Repair ${target.label.toLowerCase()}, then complete one guided attempt.`, mistake);
    } else if (stage === "guided-success") {
      add("independent", capabilityId, fresh.filter((q) => questionDemands(q).some((demand) => ["application", "calculation"].includes(demand))),
        `The guided answer held. Test ${target.label.toLowerCase()} on a fresh question without help.`, mistake);
    } else if (stage === "independent-success") {
      const source = questions.find((q) => q.id === mistake.questionId);
      add("transfer", capabilityId, fresh.filter((q) => source && isTransferQuestion(q, source)),
        "Independent success held. Apply the same skill in an unfamiliar context.", mistake);
    } else if (stage === "transfer") {
      add("retention", capabilityId, fresh.filter((q) => questionDemands(q).some((demand) => ["application", "calculation", "transfer", "synoptic"].includes(demand))),
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
    b.expectedGainPerMinute - a.expectedGainPerMinute ||
    Number(b.kind === "retention") - Number(a.kind === "retention") ||
    a.question.id.localeCompare(b.question.id))[0];
}
