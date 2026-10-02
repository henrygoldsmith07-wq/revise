// ---------------------------------------------------------------------------
// Today brief — the facts the first viewport needs about the chosen session.
//
// Pure selector over the adaptive plan, paper readiness and open mistakes, so
// the page shows exactly what the domain layer derived and never recomputes
// its own scoring. Anything unknown stays null.
// ---------------------------------------------------------------------------

import type { AdaptiveSessionPlan, AdaptiveStepKind } from "./adaptive-contract";
import type { PaperReadiness } from "./paper-readiness";
import type { ExamDate, Id, Mistake } from "./types";

export interface TodayBrief {
  paperName: string | null;
  daysToExam: number | null;
  examLabel: string | null;
  marksAtRisk: number;
  openMistakes: number;
  /** Ordered, plain-language step names. */
  activity: string[];
  /** What finishing the session will, and will not, prove. */
  produces: string[];
  doesNotProve: string | null;
  /** Set when the pick is not yet backed by this learner's own marked answers. */
  provisional: string | null;
}

const EVIDENCE: Partial<Record<AdaptiveStepKind, string>> = {
  "overdue-retrieval": "fresh recall evidence",
  "misconception-repair": "a repair check on a mistake you made",
  "independent-application": "unaided application evidence",
  transfer: "unfamiliar-context evidence",
  "prerequisite-repair": "evidence on the prerequisite topic",
  "delayed-retrieval": "a delayed proof check, scheduled for later",
};

export function countdownLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return "Exam date has passed";
  if (days === 0) return "Exam today";
  return `${days} day${days === 1 ? "" : "s"} to the exam`;
}

export function buildTodayBrief(input: {
  plan: AdaptiveSessionPlan;
  papers?: readonly PaperReadiness[];
  examDates?: readonly ExamDate[];
  mistakes?: readonly Mistake[];
  now?: Date;
}): TodayBrief {
  const { plan } = input;
  const owning = (input.papers ?? [])
    .filter((paper) => paper.subjectId === plan.subjectId && paper.topicIds.includes(plan.topicId))
    .sort((a, b) => (a.daysUntil === null || a.daysUntil < 0 ? 1e9 : a.daysUntil) - (b.daysUntil === null || b.daysUntil < 0 ? 1e9 : b.daysUntil))[0];

  let daysToExam: number | null = owning?.daysUntil ?? null;
  if (daysToExam === null) {
    const today = Date.parse(`${(input.now ?? new Date()).toISOString().slice(0, 10)}T00:00:00`);
    const upcoming = (input.examDates ?? [])
      .filter((exam) => exam.subjectId === plan.subjectId)
      .map((exam) => Math.round((Date.parse(`${exam.date}T00:00:00`) - today) / 86_400_000))
      .filter((days) => Number.isFinite(days) && days >= 0)
      .sort((a, b) => a - b)[0];
    daysToExam = upcoming ?? null;
  }

  const open = (input.mistakes ?? []).filter((m) => !m.resolved && m.marksLost > 0 && m.topicId === plan.topicId);
  const marksAtRisk = Math.round(open.reduce((sum, m) => sum + m.marksLost, 0) * 10) / 10;

  const kinds = new Set<AdaptiveStepKind>(plan.steps.map((step) => step.kind));
  const produces = [...new Set(plan.steps.map((step) => EVIDENCE[step.kind]).filter((text): text is string => !!text))];
  const guidedOnly = kinds.has("supported-practice") && !kinds.has("independent-application") && !kinds.has("transfer");

  const basis = daysToExam !== null && daysToExam >= 0
    ? "the exam date and how much of the specification this topic covers"
    : "how much of the specification this topic covers";
  const provisional = plan.evidence.attempts === 0 && open.length === 0
    ? `Provisional: you have no marked answers on this topic yet, so it was chosen from ${basis}. Your answers will sharpen the next suggestion.`
    : null;

  return {
    provisional,
    paperName: owning?.name ?? null,
    daysToExam,
    examLabel: countdownLabel(daysToExam),
    marksAtRisk,
    openMistakes: open.length,
    activity: plan.steps.map((step) => step.label),
    produces,
    doesNotProve: guidedOnly
      ? "Guided questions build skill but do not count as independent proof."
      : kinds.has("independent-application") && !kinds.has("transfer")
        ? "Unfamiliar-context proof comes in a later session."
        : null,
  };
}

export type { Id };
