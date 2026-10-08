// ---------------------------------------------------------------------------
// Exam marks-at-risk intelligence.
//
// Turns the observed open-loss ledger (buildMarksAtRisk) plus recall /
// application splits, retention, proof and paper evidence into six honest
// categories plus highest-value opportunities:
//
// - weak knowledge (recall)
// - weak application
// - insufficient evidence
// - forgetting risk
// - recurring mistakes
// - insufficient exam practice
//
// Nothing here is a grade forecast. With no marked answers every category
// reports "no evidence" rather than a reassuring zero.
// ---------------------------------------------------------------------------

import type { ApplicationMasteryRow } from "./application-mastery";
import type { RecallMasteryRow } from "./recall-mastery";
import type { Attempt, Id, Mistake, Question } from "./types";
import { buildMarksAtRisk } from "./marks-at-risk";

export type RiskCategoryKey =
  | "weak-knowledge"
  | "weak-application"
  | "insufficient-evidence"
  | "forgetting-risk"
  | "recurring-mistakes"
  | "insufficient-practice";

export interface RiskCategory {
  key: RiskCategoryKey;
  label: string;
  marks: number;
  topics: number;
  detail: string;
  action: { label: string; href: string };
}

export interface RiskOpportunity {
  topicId: Id;
  subjectId: Id;
  title: string;
  marks: number;
  reason: string;
  href: string;
}

export interface MarksIntelligence {
  totalMarks: number | null;
  evidence: "none" | "thin" | "adequate";
  headline: string;
  categories: RiskCategory[];
  opportunities: RiskOpportunity[];
}

export interface MarksIntelligenceInput {
  mistakes: readonly Mistake[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  subjectIds: readonly Id[];
  topicTitle?: (id: Id) => string;
  recallMastery?: readonly RecallMasteryRow[];
  applicationMastery?: readonly ApplicationMasteryRow[];
  daysSinceReview?: Map<Id, number>;
  timedAttempts?: number;
  now?: Date;
}

function titleOf(input: MarksIntelligenceInput, topicId: Id): string {
  return input.topicTitle?.(topicId) ?? topicId;
}

export function buildMarksIntelligence(
  input: MarksIntelligenceInput,
): MarksIntelligence {
  const report = buildMarksAtRisk({
    mistakes: [...input.mistakes],
    attempts: [...input.attempts],
    questions: [...input.questions],
    subjectIds: [...input.subjectIds],
    now: input.now,
  });

  if (report.evidence === "none") {
    return {
      totalMarks: null,
      evidence: "none",
      headline:
        "No marked answers yet, so there is nothing to estimate. Answer a few questions and this fills in.",
      categories: [],
      opportunities: [],
    };
  }

  const recallWeak = new Set<Id>();
  for (const r of input.recallMastery ?? []) {
    if (r.evidence !== "unmeasured" && r.mastery < 0.6) recallWeak.add(r.topicId);
  }
  const appWeak = new Set<Id>();
  for (const r of input.applicationMastery ?? []) {
    if (r.evidence === "unmeasured" || r.mastery < 0.65) {
      if (r.attempts > 0 || r.evidence === "unmeasured") appWeak.add(r.topicId);
    }
  }

  const marksByTopic = new Map(report.topics.map((t) => [t.topicId, t.marks]));
  const sumFor = (ids: ReadonlySet<Id>): { marks: number; topics: number } => {
    let marks = 0;
    let topics = 0;
    for (const [topicId, m] of marksByTopic) {
      if (ids.has(topicId)) {
        marks += m;
        topics += 1;
      }
    }
    return { marks: Math.round(marks * 10) / 10, topics };
  };

  const openTopics = new Set(report.topics.map((t) => t.topicId));
  const evidencedTopics = new Set(
    input.attempts.flatMap((a) => a.topicIds),
  );
  const thinTopics = new Set(
    [...openTopics].filter((t) => !evidencedTopics.has(t)),
  );
  const forgettingTopics = new Set<Id>();
  if (input.daysSinceReview) {
    for (const [topicId, days] of input.daysSinceReview) {
      if (days >= 12 && openTopics.has(topicId)) forgettingTopics.add(topicId);
    }
  } else {
    // Derive from last successful answer when no explicit review map is given.
    const nowMs = (input.now ?? new Date()).getTime();
    const lastSuccess = new Map<Id, number>();
    for (const a of input.attempts) {
      if (a.max <= 0 || a.awarded / a.max < 0.7) continue;
      const at = Date.parse(a.createdAt);
      if (!Number.isFinite(at)) continue;
      for (const t of a.topicIds) {
        const prev = lastSuccess.get(t);
        if (prev === undefined || at > prev) lastSuccess.set(t, at);
      }
    }
    for (const topicId of openTopics) {
      const last = lastSuccess.get(topicId);
      if (last === undefined) continue;
      const days = Math.floor((nowMs - last) / 86_400_000);
      if (days >= 12) forgettingTopics.add(topicId);
    }
  }
  const recurringTopics = new Set<Id>();
  for (const m of input.mistakes) {
    if (m.resolved) continue;
    if (m.misconceptionEntryId || (m.misconception && m.misconception !== "other")) {
      recurringTopics.add(m.topicId);
    }
  }

  const knowledge = sumFor(recallWeak);
  const application = sumFor(appWeak);
  const thin = sumFor(thinTopics);
  const forgetting = sumFor(forgettingTopics);
  const recurringMarks = Math.round(
    report.recurring.reduce((s, r) => s + r.marks, 0) * 10,
  ) / 10;
  const timed = input.timedAttempts ?? input.attempts.filter((a) => a.mode === "paper").length;
  const practiceGap = timed < 3 ? Math.round(report.totalMarks * 10) / 10 : 0;

  const firstTopic = report.topics[0];
  const categories: RiskCategory[] = [
    {
      key: "weak-knowledge",
      label: "Weak knowledge",
      marks: knowledge.marks,
      topics: knowledge.topics,
      detail:
        knowledge.topics === 0
          ? "Recall looks secure where it has been checked."
          : `Recall is weak in ${knowledge.topics} topic${knowledge.topics === 1 ? "" : "s"}.`,
      action: {
        label: "Repair recall",
        href: firstTopic ? `/review?topic=${encodeURIComponent(firstTopic.topicId)}` : "/review",
      },
    },
    {
      key: "weak-application",
      label: "Weak application",
      marks: application.marks,
      topics: application.topics,
      detail:
        application.topics === 0
          ? "Application holds where it has been checked."
          : `Facts are remembered but not yet turned into marks in ${application.topics} topic${application.topics === 1 ? "" : "s"}.`,
      action: {
        label: "Practise application",
        href: firstTopic ? `/practice?topic=${encodeURIComponent(firstTopic.topicId)}` : "/practice",
      },
    },
    {
      key: "insufficient-evidence",
      label: "Insufficient evidence",
      marks: thin.marks,
      topics: thin.topics,
      detail:
        thin.topics === 0
          ? "Open topics have checked answers behind them."
          : `${thin.topics} topic${thin.topics === 1 ? "" : "s"} have open marks but too few checked answers to judge.`,
      action: { label: "Gather evidence", href: "/diagnostic" },
    },
    {
      key: "forgetting-risk",
      label: "Forgetting risk",
      marks: forgetting.marks,
      topics: forgetting.topics,
      detail:
        forgetting.topics === 0
          ? "Nothing checked looks stale right now."
          : `${forgetting.topics} topic${forgetting.topics === 1 ? "" : "s"} have not been answered successfully for 12+ days.`,
      action: { label: "Revisit", href: "/review" },
    },
    {
      key: "recurring-mistakes",
      label: "Recurring mistakes",
      marks: recurringMarks,
      topics: report.recurring.length,
      detail:
        report.recurring.length === 0
          ? "No mistake has repeated across separate questions yet."
          : `${report.recurring.length} pattern${report.recurring.length === 1 ? "" : "s"} ${report.recurring.length === 1 ? "has" : "have"} repeated.`,
      action: { label: "Fix repeats", href: "/practice?recover=1" },
    },
    {
      key: "insufficient-practice",
      label: "Insufficient exam practice",
      marks: practiceGap,
      topics: timed < 3 ? openTopics.size : 0,
      detail:
        timed >= 3
          ? `${timed} timed answers give a real pace signal.`
          : `Only ${timed} timed answer${timed === 1 ? "" : "s"} so far — pace under pressure is unproven.`,
      action: { label: "Timed practice", href: "/papers" },
    },
  ];

  const opportunities: RiskOpportunity[] = report.topics.slice(0, 3).map((t) => ({
    topicId: t.topicId,
    subjectId: t.subjectId,
    title: titleOf(input, t.topicId),
    marks: t.marks,
    reason:
      appWeak.has(t.topicId) && recallWeak.has(t.topicId)
        ? `${t.marks} open marks; both recall and application are weak.`
        : appWeak.has(t.topicId)
          ? `${t.marks} open marks; application is weaker than recall.`
          : `${t.marks} open marks; the biggest recoverable stake.`,
    href: `/practice?topic=${encodeURIComponent(t.topicId)}`,
  }));

  return {
    totalMarks: report.totalMarks,
    evidence: report.evidence,
    headline: report.headline,
    categories,
    opportunities,
  };
}
