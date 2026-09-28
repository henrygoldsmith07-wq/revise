"use client";

// Lesson run state machine — which lesson is active, which step, what the
// student answered, and the completion summary. Extracted from LessonMode so
// run orchestration (transitions, gating) lives apart from roadmap/runner
// rendering. Recall and application drafts stay local by design: they prompt
// retrieval, they are never persisted or sent anywhere.

import { useCallback, useState } from "react";
import { summariseLesson } from "@/content/lessons";
import type { RoadmapLessonEntry } from "@/content/lessons";

export type LessonEntry = RoadmapLessonEntry;

export interface LessonRunSummary {
  correct: number;
  total: number;
  missed: { body: string; answer: string; explanation: string }[];
}

type Step = NonNullable<LessonEntry["lesson"]["steps"]>[number];

export function useLessonRunner(input: {
  lessons: LessonEntry[];
  initialLessonIdx: number;
  completed: Record<string, boolean>;
  completeLesson: (lessonId: string) => unknown;
}): {
  activeIdx: number | null;
  active: LessonEntry | null;
  lesson: LessonEntry["lesson"] | null;
  step: Step | null;
  stepIdx: number;
  summary: LessonRunSummary | null;
  chosen: number | undefined;
  recallDone: boolean;
  hasCheck: boolean;
  checkAnswered: boolean;
  isLast: boolean;
  currentRecallDraft: string;
  nextIdx: number | null;
  isEntryComplete: (entry: LessonEntry) => boolean;
  isApplicationRevealed: (stepId: string) => boolean;
  startLesson: (idx: number) => void;
  exitLesson: () => void;
  advance: () => void;
  goBack: () => void;
  answer: (optionIdx: number) => void;
  revealRecall: () => void;
  finishLesson: () => void;
  continueFromSummary: () => void;
  updateRecallDraft: (stepId: string, value: string) => void;
  revealApplication: (stepId: string) => void;
} {
  const { lessons, initialLessonIdx, completed, completeLesson } = input;
  const [activeIdx, setActiveIdx] = useState<number | null>(() => (initialLessonIdx >= 0 ? initialLessonIdx : null));
  const [stepIdx, setStepIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, number>>({}); // stepId -> chosen option
  const [recallDraft, setRecallDraft] = useState<Record<string, string>>({});
  const [recallRevealed, setRecallRevealed] = useState<Record<string, boolean>>({});
  const [applicationRevealed, setApplicationRevealed] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<LessonRunSummary | null>(null);

  const active = activeIdx !== null ? (lessons[activeIdx] ?? null) : null;
  const lesson = active?.lesson ?? null;
  const step = lesson && !summary ? (lesson.steps[stepIdx] ?? null) : null;

  const isEntryComplete = useCallback(
    (entry: LessonEntry) =>
      Boolean(
        completed[entry.lesson.id] ||
          completed[`lesson:${entry.topic.id}`],
      ),
    [completed],
  );
  const chosen = step?.id ? checked[step.id] : undefined;
  const recallDone = !step?.id || Boolean(recallRevealed[step.id]);
  // Check questions and active recall both gate progress. Every step asks the
  // student to produce the idea before the authored answer is shown.
  const hasCheck = Boolean(step?.check);
  const checkAnswered = recallDone && (!hasCheck || chosen !== undefined);
  const isLast = lesson ? stepIdx === lesson.steps.length - 1 : false;

  const startLesson = useCallback((idx: number) => {
    setActiveIdx(idx);
    setStepIdx(0);
    setChecked({});
    setRecallDraft({});
    setRecallRevealed({});
    setApplicationRevealed({});
    setSummary(null);
  }, []);

  const exitLesson = useCallback(() => {
    setActiveIdx(null);
    setStepIdx(0);
    setChecked({});
    setRecallDraft({});
    setRecallRevealed({});
    setApplicationRevealed({});
    setSummary(null);
  }, []);

  const nextIdx = (() => {
    if (activeIdx === null) return null;
    // Suggest the first not-yet-completed lesson *after* this one; if every
    // later lesson is done, wrap around to the earliest remaining.
    for (let i = activeIdx + 1; i < lessons.length; i++) {
      const candidate = lessons[i];
      if (candidate && !isEntryComplete(candidate)) return i;
    }
    for (let i = 0; i < activeIdx; i++) {
      const candidate = lessons[i];
      if (candidate && !isEntryComplete(candidate)) return i;
    }
    return null;
  })();

  const finishLesson = useCallback(() => {
    if (!lesson || !checkAnswered) return;
    // Persist through the synced store — it writes IndexedDB then queues the
    // same row for Supabase, so progress survives on this device and follows
    // the student elsewhere. The summary renders the updated streak once the
    // patch lands.
    void completeLesson(lesson.id);
    // Carry the missed checks into the summary so the student re-exposes the
    // correction instead of only seeing a score.
    setSummary(summariseLesson(lesson, checked));
  }, [checked, checkAnswered, completeLesson, lesson]);

  const advance = useCallback(() => {
    if (!lesson || !checkAnswered) return;
    if (isLast) {
      finishLesson();
    } else {
      setStepIdx((s) => s + 1);
    }
  }, [checkAnswered, finishLesson, isLast, lesson]);

  const goBack = useCallback(() => {
    setStepIdx((s) => Math.max(0, s - 1));
  }, []);

  const answer = useCallback(
    (optionIdx: number) => {
      if (!step?.id || !recallDone || checkAnswered) return;
      const stepId = step.id;
      setChecked((prev) => ({ ...prev, [stepId]: optionIdx }));
    },
    [checkAnswered, recallDone, step],
  );

  const revealRecall = useCallback(() => {
    if (!step?.id || !recallDraft[step.id]?.trim()) return;
    const stepId = step.id;
    setRecallRevealed((previous) => ({ ...previous, [stepId]: true }));
  }, [recallDraft, step]);

  const continueFromSummary = useCallback(() => {
    if (nextIdx !== null) {
      startLesson(nextIdx);
    } else {
      exitLesson();
    }
  }, [exitLesson, nextIdx, startLesson]);

  const updateRecallDraft = useCallback((stepId: string, value: string) => {
    setRecallDraft((previous) => ({ ...previous, [stepId]: value }));
  }, []);

  const isApplicationRevealed = useCallback(
    (stepId: string) => Boolean(applicationRevealed[stepId]),
    [applicationRevealed],
  );

  const revealApplication = useCallback((stepId: string) => {
    setApplicationRevealed((previous) => ({ ...previous, [stepId]: true }));
  }, []);

  const currentRecallDraft = step?.id ? (recallDraft[step.id] ?? "") : "";

  return {
    activeIdx,
    active,
    lesson,
    step,
    stepIdx,
    summary,
    chosen,
    recallDone,
    hasCheck,
    checkAnswered,
    isLast,
    currentRecallDraft,
    nextIdx,
    isEntryComplete,
    isApplicationRevealed,
    startLesson,
    exitLesson,
    advance,
    goBack,
    answer,
    revealRecall,
    finishLesson,
    continueFromSummary,
    updateRecallDraft,
    revealApplication,
  };
}
