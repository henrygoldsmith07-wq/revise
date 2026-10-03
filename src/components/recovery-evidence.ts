"use client";

// One derivation of the learner's recovery evidence and of the Next Best Action
// plan, shared by every surface. Nothing here is stored: it is all derived from
// the learner's attempts, mistakes and schedule.

import { useMemo } from "react";
import { allTopics, getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { effectivenessReport, estimateEffectiveness, missionChains, type EffectivenessEvidence } from "@/domain/effectiveness";
import { selectNextPaper } from "@/domain/exam-paper-selection";
import type { InterventionKind } from "@/domain/intervention-ranking";
import { todayLocal } from "@/domain/local-date";
import { planColdStart } from "@/domain/cold-start";
import { buildMarkRecovery, type MarkRecovery } from "@/domain/mark-recovery";
import { buildMistakePatterns, type MistakePattern } from "@/domain/mistake-patterns";
import { daysToNearestExam, rankRevisionActions, type RevisionPlan } from "@/domain/revision-engine";
import { isDue } from "@/domain/scheduling";
import { unseenSupplyByTopic, type TopicSupply } from "@/domain/supply";
import { topicShares } from "@/domain/topic-weight";
import { useStoreFields } from "@/state/store";
import type { Mistake } from "@/domain/types";

export interface RecoveryEvidence {
  mistakes: Mistake[];
  recovery: MarkRecovery;
  patterns: MistakePattern[];
  unseenByTopic: Record<string, number>;
  supplyByTopic: Record<string, TopicSupply>;
  /** Nearest exam across enrolled subjects; independent of the order they are listed in. */
  daysToExam: number | null;
  topicTitle: (id: string) => string;
  effectiveness: EffectivenessEvidence;
  /** Outcome-based ranking weight; 1 until this learner has reliable evidence. */
  repairWeight: (kind: InterventionKind) => number;
}

export function useRecoveryEvidence(): RecoveryEvidence {
  const store = useStoreFields("attempts", "examDates", "interventionOutcomes", "mistakes", "questions", "settings");
  return useMemo(() => {
    const subjects = new Set(store.settings.subjectIds);
    const mistakes = store.mistakes.filter((m) => subjects.has(m.subjectId));
    const now = new Date();
    const recovery = buildMarkRecovery({ mistakes, attempts: store.attempts, questions: store.questions, now });
    const patterns = buildMistakePatterns({ mistakes, attempts: store.attempts, questions: store.questions });
    const supplyByTopic = unseenSupplyByTopic(new Set(mistakes.map((m) => m.topicId)), store.questions, store.attempts);
    const unseenByTopic = Object.fromEntries(Object.entries(supplyByTopic).map(([t, s]) => [t, s.provable]));
    const days = [...subjects].map((id) => daysToNearestExam(store.examDates, id, now)).filter((d): d is number => d !== null).sort((a, b) => a - b)[0] ?? null;
    const effectiveness: EffectivenessEvidence = {
      report: effectivenessReport(store.interventionOutcomes ?? []),
      chains: missionChains({ attempts: store.attempts, mistakes: store.mistakes, questions: store.questions }),
    };
    return {
      mistakes, recovery, patterns, unseenByTopic, supplyByTopic, daysToExam: days, topicTitle: (id: string) => getTopic(id)?.title ?? id, effectiveness,
      repairWeight: (kind: InterventionKind) => estimateEffectiveness(effectiveness, { kind }).weight,
    };
  }, [store.attempts, store.examDates, store.interventionOutcomes, store.mistakes, store.questions, store.settings.subjectIds]);
}

/** The single ranked plan Today, the command centre, the diagnostic and mission routes all read. */
export function useRevisionPlan(): { plan: RevisionPlan; evidence: RecoveryEvidence } {
  const evidence = useRecoveryEvidence();
  const store = useStoreFields("adaptiveSession", "attempts", "cards", "examDates", "mastery", "mistakes", "papers", "questions", "reviewLogs", "settings");
  const plan = useMemo(() => {
    const now = new Date();
    const today = todayLocal();
    const subjectIds = store.settings.subjectIds;
    const topics = allTopics(subjectIds);
    const shares = topicShares(topics);
    const perSubject = new Map<string, number>();
    for (const t of topics) perSubject.set(t.subjectId, (perSubject.get(t.subjectId) ?? 0) + 1);
    const topicWeight = (id: string) => {
      const topic = topics.find((t) => t.id === id);
      const share = shares.get(id) ?? 0;
      return { share, relative: topic ? share * (perSubject.get(topic.subjectId) ?? 1) : 1 };
    };
    const due = new Map<string, { count: number; overdue: number }>();
    for (const card of store.cards) {
      if (!subjectIds.includes(card.subjectId) || !isDue(card, today)) continue;
      const row = due.get(card.subjectId) ?? { count: 0, overdue: 0 };
      due.set(card.subjectId, { count: row.count + 1, overdue: row.overdue + (card.due < today ? 1 : 0) });
    }
    const touched = new Set(store.attempts.flatMap((a) => a.topicIds));
    const cardTopics = new Set(store.cards.map((c) => c.topicId));
    const untouched = topics.filter((t) => !touched.has(t.id) && !cardTopics.has(t.id)).map((t) => ({ subjectId: t.subjectId, topicId: t.id, label: t.title, share: shares.get(t.id) ?? 0 }));
    const papers = subjectIds.flatMap((subjectId) => {
      const pick = selectNextPaper({
        subjectId, papers: store.papers, questions: store.questions, attempts: store.attempts, mistakes: store.mistakes, mastery: store.mastery,
        topics: topicsFor(subjectId), targetGrade: store.settings.targetGrades[subjectId] ?? null, gradeBoundaries: getSubject(subjectId)?.gradeBoundaries, now,
      }).recommended;
      const paper = pick ? store.papers.find((p) => p.id === pick.paperId) : undefined;
      return paper ? [{ subjectId, paperId: paper.id, title: paper.title }] : [];
    });
    const coldStart = planColdStart({
      subjectIds, attempts: store.attempts, mistakes: store.mistakes, reviewLogs: store.reviewLogs, questions: store.questions, examDates: store.examDates,
      skipped: store.settings.quickCheckSkipped, topicSubject: (id) => getTopic(id)?.subjectId, now,
    });
    return rankRevisionActions({
      coldStart,
      now, subjectIds, subjectName: (id) => getSubject(id)?.name ?? id, topicTitle: evidence.topicTitle,
      mistakes: evidence.mistakes, attempts: store.attempts, questions: store.questions, recovery: evidence.recovery, examDates: store.examDates,
      adaptive: store.adaptiveSession, supplyByTopic: evidence.supplyByTopic, effectiveness: evidence.effectiveness, topicWeight, papers, untouched,
      dueReviews: [...due].map(([subjectId, v]) => ({ subjectId, ...v })),
      paperTitles: Object.fromEntries(store.papers.map((p) => [p.id, p.title])),
    });
  }, [evidence, store.adaptiveSession, store.attempts, store.cards, store.examDates, store.mastery, store.mistakes, store.papers, store.questions, store.reviewLogs, store.settings.quickCheckSkipped, store.settings.subjectIds, store.settings.targetGrades]);
  return { plan, evidence };
}
