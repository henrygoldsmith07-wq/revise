"use client";

// Adaptive timetable — plan state, not study state.
//
// Owns: the replan fingerprint watcher, manual plan rebuilds, missed-session
// recovery, session completion, exam dates, user settings, and countdown
// phase notices. Reads the snapshot and the derived model; writes go through
// the repository (and patch/setSnapshot for the in-memory copy).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { allSubjects, getSubject } from "@/domain/curriculum";
import { daysToExam } from "@/domain/recommender";
import { buildPlan, rescheduleMissed, summarizePlanChange } from "@/domain/planner";
import { buildSubjectEvidence } from "@/domain/subject-allocation";
import { currentPhaseBuckets, techniqueEntryNotices } from "@/domain/phase-notice";
import type { PhaseBucket, PhaseNotice, PhaseSubject } from "@/domain/phase-notice";
import { computeFingerprint, fingerprintKey, replanDynamically, type ReplanFingerprint } from "@/domain/replan";
import { todayIso } from "@/domain/scheduling";
import { XP } from "@/domain/gamification";
import type {
  ExamDate,
  GamificationStats,
  Id,
  PlannedSession,
  StreakState,
  Topic,
  TopicMastery,
  UserSettings,
} from "@/domain/types";
import type { Snapshot } from "@/data/repository";
import * as repo from "@/data/repository";

export interface Planning {
  replanSummary: string | null;
  planChangelog: string[];
  examPhaseNotice: PhaseNotice | null;
  regeneratePlan: () => Promise<void>;
  rescheduleMissedSessions: () => Promise<void>;
  completeSession: (sessionId: Id, status?: PlannedSession["status"]) => Promise<void>;
  upsertExamDate: (exam: ExamDate) => Promise<void>;
  removeExamDate: (id: Id) => Promise<void>;
  updateSettings: (patchValue: Partial<UserSettings>) => Promise<void>;
  refreshPhaseNotices: () => Promise<void>;
  dismissExamPhaseNotice: () => void;
}

export function usePlanning(input: {
  userId: Id;
  snapshot: Snapshot | null;
  setSnapshot: Dispatch<SetStateAction<Snapshot | null>>;
  patch: (updater: (prev: Snapshot) => Snapshot) => void;
  topics: Topic[];
  mastery: TopicMastery[];
  bumpGamification: (
    current: StreakState,
    xp: number,
    statsPatch: Partial<GamificationStats>,
    snap: Snapshot,
  ) => Promise<StreakState>;
}): Planning {
  const { userId, snapshot, setSnapshot, patch, topics, mastery, bumpGamification } = input;
  const [replanSummary, setReplanSummary] = useState<string | null>(null);
  const [planChangelog, setPlanChangelog] = useState<string[]>([]);
  const [examPhaseNotice, setExamPhaseNotice] = useState<PhaseNotice | null>(null);
  const lastFingerprint = useRef<ReplanFingerprint | null>(null);

  // Dynamic replanning: when an input the plan depends on changes (exam date,
  // target grade, availability, session length or subject set), rebuild the
  // pending future sessions automatically and say why. The fingerprint lives
  // in a ref so replanning never triggers an extra render.
  useEffect(() => {
    if (!snapshot) return;
    const current = computeFingerprint({
      exams: snapshot.examDates,
      targetGrades: snapshot.settings.targetGrades,
      availability: snapshot.settings.availability,
      sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
      subjectIds: snapshot.settings.subjectIds,
    });
    if (lastFingerprint.current === null) {
      lastFingerprint.current = current;
      return;
    }
    if (fingerprintKey(current) === fingerprintKey(lastFingerprint.current)) return;
    const previous = lastFingerprint.current;
    lastFingerprint.current = current;
    void (async () => {
      const result = replanDynamically({
        userId,
        topics,
        subjects: allSubjects().filter((s) => snapshot.settings.subjectIds.includes(s.id)),
        mastery,
        exams: snapshot.examDates,
        availability: snapshot.settings.availability,
        sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
        subjectIds: snapshot.settings.subjectIds,
        targetGrades: snapshot.settings.targetGrades,
        evidence: buildSubjectEvidence(snapshot.cards, snapshot.mistakes, snapshot.attempts, todayIso(), snapshot.questions),
        existing: snapshot.plannedSessions,
        previous,
      });
      if (result.changed) {
        await repo.replacePlan(userId, result.plan);
        setSnapshot((prev) => (prev ? { ...prev, plannedSessions: result.plan } : prev));
      }
      setReplanSummary(result.summary);
    })();
  }, [snapshot, userId, topics, mastery, setSnapshot]);

  const regeneratePlan = useCallback(async () => {
    if (!snapshot) return;
    const subjects = allSubjects().filter((s) => snapshot.settings.subjectIds.includes(s.id));
    const plan = buildPlan({
      userId,
      topics,
      mastery,
      exams: snapshot.examDates,
      availability: snapshot.settings.availability,
      sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
      subjectIds: snapshot.settings.subjectIds,
      subjects,
      targetGrades: snapshot.settings.targetGrades,
      evidence: buildSubjectEvidence(snapshot.cards, snapshot.mistakes, snapshot.attempts, todayIso(), snapshot.questions),
      existing: snapshot.plannedSessions,
    });
    const changelog = summarizePlanChange({
      previous: snapshot.plannedSessions,
      next: plan,
      exams: snapshot.examDates,
      subjectNames: Object.fromEntries(subjects.map((s) => [s.id, s.name])),
      today: todayIso(),
    });
    await repo.replacePlan(userId, plan);
    setPlanChangelog(changelog);
    patch((prev) => ({ ...prev, plannedSessions: plan }));
  }, [snapshot, userId, topics, mastery, patch, setPlanChangelog]);

  const rescheduleMissedSessions = useCallback(async () => {
    if (!snapshot) return;
    const healed = rescheduleMissed(snapshot.plannedSessions, todayIso(), 6);
    await repo.replacePlan(userId, healed);
    patch((prev) => ({ ...prev, plannedSessions: healed }));
  }, [snapshot, userId, patch]);

  const completeSession = useCallback(async (sessionId: Id, status: PlannedSession["status"] = "done") => {
    const session = snapshot?.plannedSessions.find((s) => s.id === sessionId);
    if (!session) return;
    const updated: PlannedSession = {
      ...session,
      status,
      completedAt: status === "done" ? new Date().toISOString() : undefined,
    };
    await repo.savePlan([updated]);
    setSnapshot((prev) => {
      if (!prev) return prev;
      const next: Snapshot = {
        ...prev,
        plannedSessions: prev.plannedSessions.map((s) => (s.id === sessionId ? updated : s)),
      };
      if (status === "done") {
        void bumpGamification(prev.streak, XP.sessionCompleted, {}, next).then((streak) =>
          patch((p) => ({ ...p, streak })),
        );
      }
      return next;
    });
  }, [snapshot, bumpGamification, patch, setSnapshot]);

  const upsertExamDate = useCallback(async (exam: ExamDate) => {
    await repo.saveExamDate(exam);
    patch((prev) => ({
      ...prev,
      examDates: [...prev.examDates.filter((e) => e.id !== exam.id), exam],
    }));
  }, [patch]);

  const removeExamDate = useCallback(async (id: Id) => {
    await repo.deleteExamDate(id, userId);
    patch((prev) => ({ ...prev, examDates: prev.examDates.filter((e) => e.id !== id) }));
  }, [patch, userId]);

  const updateSettings = useCallback(async (patchValue: Partial<UserSettings>) => {
    if (!snapshot) return;
    const next: UserSettings = { ...snapshot.settings, ...patchValue, updatedAt: new Date().toISOString() };
    await repo.saveSettings(next);
    patch((prev) => ({ ...prev, settings: next }));
  }, [snapshot, patch]);

  const refreshPhaseNotices = useCallback(async () => {
    if (!snapshot) return;
    const subjects: PhaseSubject[] = snapshot.settings.subjectIds.map((subjectId) => {
      const subject = getSubject(subjectId);
      return {
        subjectId,
        name: subject?.name ?? subjectId,
        days: daysToExam(snapshot.examDates, subjectId, todayIso()),
      };
    });
    const previous = (snapshot.settings.examNotices ?? {}) as Record<string, PhaseBucket | null | undefined>;
    const notices = techniqueEntryNotices(subjects, previous);
    // Record every subject's current bucket so a transition is announced
    // exactly once — and a subject pushed back out of the window can be
    // re-announced when it later re-enters.
    const buckets = currentPhaseBuckets(subjects);
    const examNotices: Record<string, string> = {};
    for (const [subjectId, bucket] of Object.entries(buckets)) {
      if (bucket) examNotices[subjectId] = bucket;
    }
    const changed =
      Object.keys(examNotices).length !== Object.keys(previous).length ||
      Object.entries(examNotices).some(([subjectId, bucket]) => previous[subjectId] !== bucket);
    if (changed) await updateSettings({ examNotices });
    const notice = notices[0] ?? null;
    if (notice) setExamPhaseNotice(notice);
    if (
      notice &&
      snapshot.settings.examNotifications &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      try {
        new window.Notification(notice.title, { body: notice.body });
      } catch {
        // Some environments throw on construction (private browsing, iframes);
        // the in-app banner still shows, so the notice is not lost.
      }
    }
  }, [snapshot, updateSettings]);

  const dismissExamPhaseNotice = useCallback(() => {
    setExamPhaseNotice(null);
  }, []);

  return {
    replanSummary,
    planChangelog,
    examPhaseNotice,
    regeneratePlan,
    rescheduleMissedSessions,
    completeSession,
    upsertExamDate,
    removeExamDate,
    updateSettings,
    refreshPhaseNotices,
    dismissExamPhaseNotice,
  };
}
