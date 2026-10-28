// ---------------------------------------------------------------------------
// Today brief — the facts the first viewport needs about the chosen session.
//
// Pure selector over the adaptive plan, paper readiness and open mistakes, so
// the page shows exactly what the domain layer derived and never recomputes
// its own scoring. Anything unknown stays null.
// ---------------------------------------------------------------------------

import type { AdaptiveSessionPlan, AdaptiveStepKind } from "./adaptive-contract";
import type { PaperReadiness } from "./paper-readiness";
import type { TopicLifecycle } from "./proof-lifecycle";
import type { ExamDate, Id, Mistake } from "./types";
import { localDaysBetween, todayLocal } from "./local-date";
import { examForTopic } from "./exam-timetable";
import type { Topic } from "./types";

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
  /** Where this topic stands on proof, so a good session is never mistaken for mastery. */
  lifecycle: { label: string; line: string; dueNow: boolean } | null;
  /** The nearest dated paper in this subject, e.g. "Physics Unit 1 is in 23 days (90 minutes, 80 marks)." */
  nextPaper: string | null;
}

const EVIDENCE: Partial<Record<AdaptiveStepKind, string>> = {
  "overdue-retrieval": "a check of what you still remember",
  "misconception-repair": "a fix for a mistake you made",
  "independent-application": "an exam-style question done without help",
  transfer: "a question set in an unfamiliar context",
  "prerequisite-repair": "a check on an earlier topic this builds on",
  "delayed-retrieval": "a follow-up check booked for a later day",
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
  lifecycle?: TopicLifecycle;
  /** The session topic, so a unit-dated subject counts down to this topic's own unit. */
  topic?: Pick<Topic, "specRef" | "id" | "subjectId" | "title">;
  nextPaper?: string | null;
  now?: Date;
}): TodayBrief {
  const { plan } = input;
  const owning = (input.papers ?? [])
    .filter((paper) => paper.subjectId === plan.subjectId && paper.topicIds.includes(plan.topicId))
    .sort((a, b) => (a.daysUntil === null || a.daysUntil < 0 ? 1e9 : a.daysUntil) - (b.daysUntil === null || b.daysUntil < 0 ? 1e9 : b.daysUntil))[0];

  const today = todayLocal(input.now ?? new Date());
  const unitDated = (input.examDates ?? []).some((exam) => exam.subjectId === plan.subjectId && exam.paperSpecId);
  let daysToExam: number | null = owning?.daysUntil ?? null;
  let unitLabel: string | null = null;
  if (unitDated && input.topic) {
    // Unit dates exist: count down to this topic's own unit, never to a sibling unit's paper.
    const exam = examForTopic((input.examDates ?? []).map((e) => ({ ...e, date: e.date.slice(0, 10) })), input.topic, today);
    daysToExam = exam ? localDaysBetween(today, exam.date) : null;
    unitLabel = exam?.label ?? null;
  } else if (daysToExam === null) {
    const upcoming = (input.examDates ?? [])
      .filter((exam) => exam.subjectId === plan.subjectId)
      .map((exam) => localDaysBetween(today, exam.date.slice(0, 10)))
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
    lifecycle: input.lifecycle && input.lifecycle.stage !== "not-started" ? { label: input.lifecycle.label, line: input.lifecycle.line, dueNow: input.lifecycle.dueNow } : null,
    paperName: unitLabel ?? owning?.name ?? null,
    nextPaper: input.nextPaper ?? null,
    daysToExam,
    examLabel: countdownLabel(daysToExam),
    marksAtRisk,
    openMistakes: open.length,
    activity: plan.steps.map((step) => step.label),
    produces,
    doesNotProve: guidedOnly
      ? "Guided questions build skill but do not count as independent proof."
      : kinds.has("independent-application") && !kinds.has("transfer")
        ? "A question in an unfamiliar context comes in a later session — that is what proves it."
        : null,
  };
}

export type { Id };
