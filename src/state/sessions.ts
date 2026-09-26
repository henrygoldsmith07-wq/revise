"use client";

// Revision session lifecycle — the current learning block, not study data.
//
// Owns: the resumable revision checkpoint, the revision-twin state, and the
// actions that start/complete/abandon a twin session. Reads the ranked
// recommendations only to offer twin choices; writes go through the
// repository. Nothing here mutates cards, attempts, or the plan.

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildAdaptiveSession } from "@/domain/adaptive-session";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-session";
import type { ApplicationMasteryRow } from "@/domain/application-mastery";
import type { ExamReadiness } from "@/domain/exam-readiness";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type {
  Attempt,
  Card,
  ExamDate,
  Id,
  InterventionOutcomeRecord,
  Mistake,
  Question,
  Recommendation,
  ReviewLog,
  Topic,
  TopicMastery,
} from "@/domain/types";
import { createRevisionCheckpoint } from "@/domain/revision-checkpoint";
import type { RevisionCheckpoint, RevisionCheckpointInput } from "@/domain/revision-checkpoint";
import * as repo from "@/data/repository";
import {
  abandonRevisionTwinSession as abandonStoredTwinSession,
  buildRevisionTwinChoices,
  completeRevisionTwinSession as completeTwinSession,
  createRevisionTwinSession,
  createRevisionTwinState,
  revisionTwinReport,
} from "@/domain/revision-twin";
import type { RevisionTwinChoice, RevisionTwinReport, RevisionTwinSession, RevisionTwinState } from "@/domain/revision-twin";

export interface RevisionSessions {
  /** True once the mount load finished — first paint waits for it, as boot did. */
  loaded: boolean;
  /** The one best sequence for the next bounded study window (null pre-plan). */
  adaptiveSession: AdaptiveSessionPlan | null;
  revisionCheckpoint: RevisionCheckpoint | null;
  revisionTwin: RevisionTwinState;
  revisionTwinChoices: RevisionTwinChoice[];
  revisionTwinReport: RevisionTwinReport;
  saveRevisionCheckpoint: (input: RevisionCheckpointInput) => Promise<void>;
  clearRevisionCheckpoint: () => Promise<void>;
  startRevisionTwinSession: (choice: RevisionTwinChoice, title?: string) => Promise<RevisionTwinSession>;
  completeRevisionTwinSession: (id: Id, actualMarks: number, actualMinutes?: number) => Promise<void>;
  abandonRevisionTwinSession: (id: Id) => Promise<void>;
}

export function useRevisionSessions(input: {
  userId: Id;
  recommendations: Recommendation[];
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  exams: ExamDate[];
  subjectIds: readonly Id[];
  recallMastery: RecallMasteryRow[];
  applicationMastery: ApplicationMasteryRow[];
  readiness: ExamReadiness[];
  interventionOutcomes: InterventionOutcomeRecord[];
}): RevisionSessions {
  const {
    userId, recommendations, topics, cards, reviewLogs, questions, attempts,
    mistakes, mastery, exams, subjectIds, recallMastery, applicationMastery,
    readiness, interventionOutcomes,
  } = input;
  const [revisionCheckpoint, setRevisionCheckpoint] = useState<RevisionCheckpoint | null>(null);
  const [revisionTwin, setRevisionTwin] = useState<RevisionTwinState | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Self-loading on mount (in parallel with the snapshot load).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [checkpoint, twin] = await Promise.all([
        repo.loadRevisionCheckpoint(userId),
        repo.loadRevisionTwin(userId),
      ]);
      if (cancelled) return;
      setRevisionCheckpoint(checkpoint ?? null);
      setRevisionTwin(twin ?? createRevisionTwinState(userId));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveRevisionCheckpoint = useCallback(async (checkpointInput: RevisionCheckpointInput) => {
    const checkpoint = createRevisionCheckpoint(userId, checkpointInput);
    await repo.saveRevisionCheckpoint(checkpoint);
    setRevisionCheckpoint(checkpoint);
  }, [userId]);

  const clearRevisionCheckpoint = useCallback(async () => {
    await repo.clearRevisionCheckpoint(userId);
    setRevisionCheckpoint(null);
  }, [userId]);

  const startRevisionTwinSession = useCallback(async (choice: RevisionTwinChoice, title?: string) => {
    const state = revisionTwin ?? createRevisionTwinState(userId);
    if (state.sessions.some((session) => session.status === "active")) throw new Error("A revision block is already active.");
    const session = createRevisionTwinSession({ id: crypto.randomUUID(), userId, choice, title });
    const next: RevisionTwinState = { ...state, sessions: [session, ...state.sessions], updatedAt: new Date().toISOString() };
    await repo.saveRevisionTwin(next);
    setRevisionTwin(next);
    return session;
  }, [revisionTwin, userId]);

  const completeRevisionTwinSession = useCallback(async (id: Id, actualMarks: number, actualMinutes?: number) => {
    const state = revisionTwin;
    const session = state?.sessions.find((row) => row.id === id && row.status === "active");
    if (!state || !session) return;
    const updated = completeTwinSession(session, { actualMarks, actualMinutes });
    const next: RevisionTwinState = { ...state, sessions: state.sessions.map((row) => row.id === id ? updated : row), updatedAt: new Date().toISOString() };
    await repo.saveRevisionTwin(next);
    setRevisionTwin(next);
  }, [revisionTwin]);

  const abandonRevisionTwinSession = useCallback(async (id: Id) => {
    const state = revisionTwin;
    const session = state?.sessions.find((row) => row.id === id && row.status === "active");
    if (!state || !session) return;
    const updated = abandonStoredTwinSession(session);
    const next: RevisionTwinState = { ...state, sessions: state.sessions.map((row) => row.id === id ? updated : row), updatedAt: new Date().toISOString() };
    await repo.saveRevisionTwin(next);
    setRevisionTwin(next);
  }, [revisionTwin]);

  const twinState = useMemo(() => revisionTwin ?? createRevisionTwinState(userId), [revisionTwin, userId]);
  const twinReport = useMemo(() => revisionTwinReport(twinState), [twinState]);
  const revisionTwinChoices = useMemo(
    () => buildRevisionTwinChoices({ recommendations, sessions: twinState.sessions }),
    [recommendations, twinState.sessions],
  );

  // Unlike `recommendations`, this is not a list of competing activity
  // queues. It is one optimiser pass over the same snapshot, then one
  // sequence for the winning topic. Today and /adaptive-session consume this
  // exact value so the hero cannot drift from the route it opens. Readiness
  // gates adaptive stopping, so the optimiser reads the computed rows.
  const adaptiveSession = useMemo(() => {
    if (!topics.length) return null;
    return buildAdaptiveSession({
      topics,
      cards,
      reviewLogs,
      questions,
      attempts,
      mistakes,
      mastery,
      exams,
      subjectIds: [...subjectIds],
      recallMastery,
      applicationMastery,
      readiness,
      interventionOutcomes,
      targetMinutes: 20,
    });
  }, [topics, cards, reviewLogs, questions, attempts, mistakes, mastery, exams,
    subjectIds, recallMastery, applicationMastery, readiness, interventionOutcomes]);

  return {
    loaded,
    adaptiveSession,
    revisionCheckpoint,
    revisionTwin: twinState,
    revisionTwinChoices,
    revisionTwinReport: twinReport,
    saveRevisionCheckpoint,
    clearRevisionCheckpoint,
    startRevisionTwinSession,
    completeRevisionTwinSession,
    abandonRevisionTwinSession,
  };
}
