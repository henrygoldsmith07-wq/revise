// ---------------------------------------------------------------------------
// Unified longitudinal learner model.
//
// One coherent learner-intelligence layer over the existing mastery, mistake,
// retention, evidence and outcome models. This file creates no new evidence
// store: it composes the pure domain functions the repo already trusts
// (mastery, recall/application splits, marks-at-risk, proof ledger,
// retention, mistakes) into a single state the recommender, tutor and
// readiness surfaces can reason over.
//
// Design rules:
// - Deterministic and pure (no React, no I/O, no clock beyond `now`).
// - Unknown is never zero: null means "no evidence", never "failed".
// - All counts are real computed counts; nothing is invented.
// - Evidence labels distinguish no evidence / weak / improving / proven /
//   regressed via the existing LearnerState projection.
// ---------------------------------------------------------------------------

import type { ApplicationMasteryRow } from "./application-mastery";
import type { RecallMasteryRow } from "./recall-mastery";
import type { Attempt, ExamDate, Id, Mistake, TopicMastery } from "./types";
import type { LearnerState } from "./learner-state";
import type { TopicProof } from "./proof-of-improvement";

export type EvidenceLabel =
  | "no-evidence"
  | "weak"
  | "improving"
  | "proven"
  | "regressed";

export const EVIDENCE_LABEL: Record<EvidenceLabel, string> = {
  "no-evidence": "Not yet checked",
  improving: "Improving",
  proven: "Proven",
  regressed: "Regressed",
  weak: "Needs work",
};

export function learnerStateToEvidence(state: LearnerState): EvidenceLabel {
  switch (state) {
    case "not-checked":
      return "no-evidence";
    case "needs-work":
      return "weak";
    case "improving":
      return "improving";
    case "awaiting-proof":
      return "improving";
    case "proven":
      return "proven";
    case "regressed":
      return "regressed";
  }
}

export interface TopicIntelligence {
  topicId: Id;
  subjectId: Id;
  mastery: number | null;
  recall: number | null;
  application: number | null;
  /** Positive when recall exceeds application: knows it, cannot yet use it. */
  applicationGap: number | null;
  retention: number | null;
  uncertainty: number;
  evidenceAttempts: number;
  evidence: EvidenceLabel;
  marksLost: number;
  marksRecoverable: number;
  openMistakes: number;
  recurringMistakes: number;
  daysSinceSuccess: number | null;
  daysToExam: number | null;
  proofStatus: TopicProof["status"] | null;
  commandWeakness: string | null;
  timingWeakness: boolean;
}

export interface SubjectIntelligence {
  subjectId: Id;
  topics: TopicIntelligence[];
  /** Observed open marks, never a forecast. Null with no marked answers. */
  marksAtRisk: number | null;
  evidence: "none" | "thin" | "adequate";
  examDays: number | null;
  strongestTopicId: Id | null;
  weakestTopicId: Id | null;
  applicationGapTopics: Id[];
}

export interface BehaviourSignals {
  recentRevisionDays: number;
  sessionsCompleted7d: number;
  missedSessions7d: number;
  preferredMinutes: number | null;
  repeatedFailureTopics: Id[];
  studyModesUsed: string[];
}

export interface LearnerIntelligence {
  subjects: SubjectIntelligence[];
  behaviour: BehaviourSignals;
  /** Topics where recall is secure but application lags — the key differentiator. */
  applicationGaps: TopicIntelligence[];
  /** Highest-value opportunities, biggest recoverable stake first. */
  opportunities: TopicIntelligence[];
  updatedAt: string;
}

export interface LearnerIntelligenceInput {
  topicIds: readonly Id[];
  topicSubject: (topicId: Id) => Id;
  mastery: readonly TopicMastery[];
  recallMastery?: readonly RecallMasteryRow[];
  applicationMastery?: readonly ApplicationMasteryRow[];
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  proof?: readonly TopicProof[];
  examDates: readonly ExamDate[];
  reviewLogs?: ReadonlyArray<{ topicId: Id; reviewedAt: string }>;
  plannedSessions?: ReadonlyArray<{ status: string; date: string }>;
  now?: Date;
}

const DAY_MS = 86_400_000;

function daysToExamFor(
  exams: readonly ExamDate[],
  subjectId: Id,
  now: Date,
): number | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates = exams
    .filter((e) => e.subjectId === subjectId)
    .map((e) => Date.parse(`${e.date}T00:00:00Z`))
    .filter((t) => Number.isFinite(t) && t >= today);
  if (!dates.length) return null;
  return Math.round((Math.min(...dates) - today) / DAY_MS);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Build one coherent learner state from existing domain rows. */
export function buildLearnerIntelligence(
  input: LearnerIntelligenceInput,
): LearnerIntelligence {
  const now = input.now ?? new Date();
  const masteryByTopic = new Map(input.mastery.map((m) => [m.topicId, m]));
  const recallByTopic = new Map(
    (input.recallMastery ?? []).map((r) => [r.topicId, r]),
  );
  const appByTopic = new Map(
    (input.applicationMastery ?? []).map((r) => [r.topicId, r]),
  );
  const proofByTopic = new Map((input.proof ?? []).map((p) => [p.topicId, p]));

  const openByTopic = new Map<Id, Mistake[]>();
  for (const m of input.mistakes) {
    if (m.resolved || m.marksLost <= 0) continue;
    const rows = openByTopic.get(m.topicId) ?? [];
    rows.push(m);
    openByTopic.set(m.topicId, rows);
  }

  const successByTopic = new Map<Id, number>();
  for (const a of input.attempts) {
    if (a.max <= 0 || a.awarded / a.max < 0.7) continue;
    for (const t of a.topicIds) {
      const prev = successByTopic.get(t);
      const at = Date.parse(a.createdAt);
      if (!Number.isFinite(at)) continue;
      if (prev === undefined || at > prev) successByTopic.set(t, at);
    }
  }

  const commandByTopic = new Map<Id, Map<string, number>>();
  for (const m of input.mistakes) {
    if (m.resolved) continue;
    const cmd = (m.command ?? "").trim().toLowerCase();
    if (!cmd || cmd === "other") continue;
    const per = commandByTopic.get(m.topicId) ?? new Map<string, number>();
    per.set(cmd, (per.get(cmd) ?? 0) + 1);
    commandByTopic.set(m.topicId, per);
  }

  const bySubject = new Map<Id, TopicIntelligence[]>();
  for (const topicId of input.topicIds) {
    const subjectId = input.topicSubject(topicId);
    const m = masteryByTopic.get(topicId);
    const recall = recallByTopic.get(topicId);
    const app = appByTopic.get(topicId);
    const proof = proofByTopic.get(topicId);
    const open = openByTopic.get(topicId) ?? [];
    const marksLost = open.reduce((s, x) => s + x.marksLost, 0);

    const recallV =
      recall && recall.evidence !== "unmeasured" ? recall.mastery : null;
    const appV =
      app && app.evidence !== "unmeasured" ? app.mastery : null;
    const gap =
      recallV !== null && appV !== null
        ? Math.round((recallV - appV) * 1000) / 1000
        : null;

    const attempts = m?.attempts ?? app?.attempts ?? 0;
    const evidence: EvidenceLabel =
      proof?.status === "proven-gain" || proof?.status === "held"
        ? "proven"
        : proof?.status === "declined"
          ? "regressed"
          : attempts === 0 && open.length === 0
            ? "no-evidence"
            : (m?.mastery ?? 0.5) < 0.55 || open.length > 0
              ? "weak"
              : "improving";

    const lastSuccess = successByTopic.get(topicId);
    const daysSinceSuccess =
      lastSuccess === undefined
        ? null
        : Math.max(
            0,
            Math.floor((now.getTime() - lastSuccess) / DAY_MS),
          );

    // Uncertainty shrinks as independent evidence accumulates.
    const uncertainty = clamp01(1 - Math.min(1, attempts / 8));

    const commands = commandByTopic.get(topicId);
    const commandWeakness = commands
      ? [...commands.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;

    const row: TopicIntelligence = {
      topicId,
      subjectId,
      mastery: m ? Math.round(m.mastery * 1000) / 1000 : null,
      recall: recallV,
      application: appV,
      applicationGap: gap !== null && gap > 0.08 ? gap : null,
      retention: m ? Math.round(m.retention * 1000) / 1000 : null,
      uncertainty: Math.round(uncertainty * 1000) / 1000,
      evidenceAttempts: attempts,
      evidence,
      marksLost: Math.round(marksLost * 10) / 10,
      marksRecoverable: Math.round(marksLost * 10) / 10,
      openMistakes: open.length,
      recurringMistakes: open.filter((x) => x.misconceptionEntryId || (x.misconception && x.misconception !== "other")).length,
      daysSinceSuccess,
      daysToExam: daysToExamFor(input.examDates, subjectId, now),
      proofStatus: proof?.status ?? null,
      commandWeakness,
      timingWeakness: open.some((x) => x.category === "method" && /time/i.test(x.description ?? "")),
    };
    const list = bySubject.get(subjectId) ?? [];
    list.push(row);
    bySubject.set(subjectId, list);
  }

  const subjects: SubjectIntelligence[] = [...bySubject.entries()].map(
    ([subjectId, topics]) => {
      const open = topics.reduce((s, t) => s + t.marksRecoverable, 0);
      const attempts = topics.reduce((s, t) => s + t.evidenceAttempts, 0);
      const evidence =
        attempts === 0 ? ("none" as const) : attempts < 8 ? ("thin" as const) : ("adequate" as const);
      const ranked = [...topics].sort(
        (a, b) => (a.mastery ?? 0.5) - (b.mastery ?? 0.5),
      );
      return {
        subjectId,
        topics: topics.sort((a, b) => b.marksRecoverable - a.marksRecoverable),
        marksAtRisk: attempts === 0 ? null : Math.round(open * 10) / 10,
        evidence,
        examDays: daysToExamFor(input.examDates, subjectId, now),
        strongestTopicId: [...topics].sort((a, b) => (b.mastery ?? 0) - (a.mastery ?? 0))[0]?.topicId ?? null,
        weakestTopicId: ranked[0]?.topicId ?? null,
        applicationGapTopics: topics
          .filter((t) => t.applicationGap !== null)
          .sort((a, b) => (b.applicationGap ?? 0) - (a.applicationGap ?? 0))
          .map((t) => t.topicId),
      };
    },
  );

  const all = subjects.flatMap((s) => s.topics);
  const applicationGaps = all
    .filter((t) => t.applicationGap !== null)
    .sort((a, b) => (b.applicationGap ?? 0) - (a.applicationGap ?? 0));
  const opportunities = all
    .filter((t) => t.evidence === "weak" || t.evidence === "regressed")
    .sort(
      (a, b) =>
        b.marksRecoverable - a.marksRecoverable ||
        (b.daysToExam !== null && a.daysToExam !== null ? a.daysToExam - b.daysToExam : 0),
    )
    .slice(0, 5);

  const logs = input.reviewLogs ?? [];
  const recentDays = new Set(
    logs
      .map((l) => l.reviewedAt.slice(0, 10))
      .filter(Boolean),
  );
  const sessions = input.plannedSessions ?? [];

  return {
    subjects,
    behaviour: {
      recentRevisionDays: recentDays.size,
      sessionsCompleted7d: sessions.filter((s) => s.status === "done").length,
      missedSessions7d: sessions.filter((s) => s.status === "missed").length,
      preferredMinutes: null,
      repeatedFailureTopics: all.filter((t) => t.openMistakes >= 2).map((t) => t.topicId),
      studyModesUsed: [],
    },
    applicationGaps,
    opportunities,
    updatedAt: now.toISOString(),
  };
}

/** Human sentence for one topic; never invents numbers, never shows zero as evidence. */
export function describeTopicIntelligence(
  topic: TopicIntelligence,
  topicTitle: string,
): string {
  if (topic.evidence === "no-evidence") {
    return `${topicTitle} has no checked answers yet, so Revise cannot judge it. It is unknown, not weak.`;
  }
  const parts: string[] = [];
  if (topic.applicationGap !== null) {
    parts.push(
      `You remember the facts here but lose marks when the question changes context`,
    );
  }
  if (topic.marksLost > 0) {
    parts.push(
      `you lost ${topic.marksLost} mark${topic.marksLost === 1 ? "" : "s"} here recently`,
    );
  }
  if (topic.recall !== null && topic.application !== null && topic.applicationGap === null) {
    parts.push(
      `recall ${Math.round(topic.recall * 100)}%, application ${Math.round(topic.application * 100)}% on checked answers`,
    );
  }
  if (topic.daysSinceSuccess !== null && topic.daysSinceSuccess >= 7) {
    parts.push(`no successful answer for ${topic.daysSinceSuccess} days`);
  }
  if (topic.commandWeakness) {
    parts.push(`“${topic.commandWeakness}” questions cost the most here`);
  }
  if (!parts.length) {
    return topic.evidence === "proven"
      ? `${topicTitle} is proven on new questions.`
      : `${topicTitle} is improving on checked answers.`;
  }
  return `${topicTitle}: ${parts.join("; ")}.`;
}
