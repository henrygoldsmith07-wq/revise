"use client";

// One derivation of the learner's recovery evidence for every surface that
// shows missions, marks recovered or paper repair. Nothing here is stored.

import { useMemo } from "react";
import { getTopic } from "@/domain/curriculum";
import { unseenQuestion } from "@/domain/learning-evidence";
import { todayLocal } from "@/domain/local-date";
import { effectivenessReport, rankedWeight } from "@/domain/effectiveness";
import type { InterventionKind } from "@/domain/intervention-ranking";
import { buildMarkRecovery, type MarkRecovery } from "@/domain/mark-recovery";
import { buildMistakePatterns, type MistakePattern } from "@/domain/mistake-patterns";
import { daysToExam } from "@/domain/recommender";
import { useStoreFields } from "@/state/store";
import type { Mistake } from "@/domain/types";

export interface RecoveryEvidence {
  mistakes: Mistake[];
  recovery: MarkRecovery;
  patterns: MistakePattern[];
  unseenByTopic: Record<string, number>;
  daysToExam: number | null;
  topicTitle: (id: string) => string;
  /** Outcome-based ranking weight; 1 until this learner has reliable evidence. */
  repairWeight: (kind: InterventionKind) => number;
}

export function useRecoveryEvidence(): RecoveryEvidence {
  const store = useStoreFields("attempts", "examDates", "interventionOutcomes", "mistakes", "questions", "settings");
  return useMemo(() => {
    const subjects = new Set(store.settings.subjectIds);
    const mistakes = store.mistakes.filter((m) => subjects.has(m.subjectId));
    const recovery = buildMarkRecovery({ mistakes, attempts: store.attempts, questions: store.questions });
    const patterns = buildMistakePatterns({ mistakes, attempts: store.attempts, questions: store.questions });
    const topics = new Set(mistakes.map((m) => m.topicId));
    const unseenByTopic: Record<string, number> = {};
    for (const q of store.questions) {
      if (!q.topicIds.some((t) => topics.has(t)) || !unseenQuestion(q, store.attempts, store.questions)) continue;
      for (const t of q.topicIds) if (topics.has(t)) unseenByTopic[t] = (unseenByTopic[t] ?? 0) + 1;
    }
    const today = todayLocal();
    const days = store.settings.subjectIds
      .map((id) => daysToExam(store.examDates, id, today))
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b)[0] ?? null;
    const report = effectivenessReport(store.interventionOutcomes ?? []);
    return { mistakes, recovery, patterns, unseenByTopic, daysToExam: days, topicTitle: (id: string) => getTopic(id)?.title ?? id, repairWeight: (kind: InterventionKind) => rankedWeight(report, kind) };
  }, [store.attempts, store.examDates, store.interventionOutcomes, store.mistakes, store.questions, store.settings.subjectIds]);
}
