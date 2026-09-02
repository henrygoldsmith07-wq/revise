"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildLesson, summariseLesson } from "@/content/lessons";
import { allTopics, getSubject } from "@/domain/curriculum";
import type { Topic } from "@/domain/types";
import { AchievementIcon, StreakIcon, ICON_SIZE } from "./icons";
import { useShortcuts } from "./shortcuts";
import { Button, EmptyState, Panel, Pill, ProgressBar, cx } from "./ui";
import { useStore } from "@/state/store";

// Lesson mode: learn a topic from zero before drilling it with flashcards.
// Steps are derived from authored curriculum data; each check question gates
// progress so reading stays active instead of passive. Completion and the
// lesson streak live in the synced store (one row per user), so progress
// follows the student across devices instead of sitting in per-device
// localStorage.

export function LessonMode({ topics, onExit }: { topics: Topic[]; onExit: () => void }) {
  const lessons = useMemo(
    () =>
      topics
        .map((t) => ({ topic: t, lesson: buildLesson(t) }))
        .filter((x): x is { topic: (typeof topics)[number]; lesson: NonNullable<ReturnType<typeof buildLesson>> } => x.lesson !== null),
    [topics],
  );

  const store = useStore();
  const { lessonProgress, completeLesson } = store;
  const completed = lessonProgress.completed;
  const streak = lessonProgress.streak;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, number>>({}); // stepId -> chosen option
  const [summary, setSummary] = useState<{ correct: number; total: number; missed: { body: string; answer: string }[] } | null>(null);

  const active = activeIdx !== null ? lessons[activeIdx] : null;
  const lesson = active?.lesson ?? null;
  const step = lesson && !summary ? lesson.steps[stepIdx] : null;
  const chosen = step?.id ? checked[step.id] : undefined;
  // Only steps that carry a check question gate progress. The intro summary
  // and the common-trap closers are plain reading — they must never block the
  // student, or the lesson dead-ends on step one.
  const hasCheck = Boolean(step?.check);
  const checkAnswered = !hasCheck || chosen !== undefined;
  const isLast = lesson ? stepIdx === lesson.steps.length - 1 : false;

  const startLesson = useCallback((idx: number) => {
    setActiveIdx(idx);
    setStepIdx(0);
    setChecked({});
    setSummary(null);
  }, []);

  const exitLesson = useCallback(() => {
    setActiveIdx(null);
    setStepIdx(0);
    setChecked({});
    setSummary(null);
  }, []);

  const nextIdx = useMemo(() => {
    if (activeIdx === null) return null;
    // Suggest the first not-yet-completed lesson *after* this one; if every
    // later lesson is done, wrap around to the earliest remaining.
    for (let i = activeIdx + 1; i < lessons.length; i++) {
      if (!completed[lessons[i].lesson.id]) return i;
    }
    for (let i = 0; i < activeIdx; i++) {
      if (!completed[lessons[i].lesson.id]) return i;
    }
    return null;
  }, [activeIdx, completed, lessons]);

  const finishLesson = useCallback(() => {
    if (!lesson) return;
    // Persist through the synced store — it writes IndexedDB then queues the
    // same row for Supabase, so progress survives on this device and follows
    // the student elsewhere. The summary renders the updated streak once the
    // patch lands.
    void completeLesson(lesson.id);
    // Carry the missed checks into the summary so the student re-exposes the
    // correction instead of only seeing a score.
    setSummary(summariseLesson(lesson, checked));
  }, [checked, completeLesson, lesson]);

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
      if (!step?.id || checkAnswered) return;
      setChecked((prev) => ({ ...prev, [step.id!]: optionIdx }));
    },
    [checkAnswered, step],
  );

  const continueFromSummary = useCallback(() => {
    if (nextIdx !== null) {
      startLesson(nextIdx);
    } else {
      exitLesson();
    }
  }, [exitLesson, nextIdx, startLesson]);

  // When this subject is finished, point at the next enrolled subject that
  // still has lessons left, in curriculum order — momentum over dead ends.
  // Recomputed on render: it only matters on the summary screen, where the
  // loop over enrolled subjects is trivially cheap.
  const currentSubjectId = topics[0]?.subjectId ?? null;
  let upNextSubject: { subjectId: string; name: string; remaining: number } | null = null;
  if (nextIdx === null) {
    for (const sid of store.settings.subjectIds) {
      if (sid === currentSubjectId) continue;
      const remaining = allTopics([sid]).filter((t) => {
        const l = buildLesson(t);
        return l && !completed[l.id];
      }).length;
      if (remaining > 0) {
        upNextSubject = { subjectId: sid, name: getSubject(sid)?.name ?? sid, remaining };
        break;
      }
    }
  }
  const router = useRouter();

  // Keyboard: 1-4 answer the current question, Enter continues, Backspace
  // steps back, Esc leaves the lesson. Registered through the shared shortcut
  // registry so the keys show up in the global `?` sheet.
  const answerKeys = lesson && !summary && step?.check ? step.check.options.map((_, oi) => String(oi + 1)) : [];
  useShortcuts(
    [
      ...answerKeys.map((key) => ({
        key,
        group: "Lesson",
        label: `Answer option ${key}`,
        disabled: !lesson || !!summary || !step?.check || checkAnswered,
        run: () => answer(Number(key) - 1),
      })),
      {
        key: "enter",
        group: "Lesson",
        label: summary ? "Next lesson" : checkAnswered ? (isLast ? "Finish lesson" : "Continue") : "Continue",
        disabled: !lesson || (!summary && !checkAnswered),
        run: summary ? continueFromSummary : advance,
      },
      {
        key: "backspace",
        group: "Lesson",
        label: "Previous step",
        disabled: !lesson || !!summary || stepIdx === 0,
        run: goBack,
      },
      {
        key: "escape",
        group: "Lesson",
        label: "Exit lesson",
        disabled: !lesson,
        run: exitLesson,
      },
    ],
    [advance, answer, checkAnswered, continueFromSummary, exitLesson, goBack, isLast, lesson, step, stepIdx, summary],
  );

  if (!lessons.length) {
    return (
      <div className="max-w-2xl mx-auto">
        <EmptyState title="No lessons available" body="Pick a topic with authored key points first." />
      </div>
    );
  }

  // ---- Completion summary ------------------------------------------------
  if (lesson && summary) {
    const perfect = summary.total > 0 && summary.correct === summary.total;
    const next = nextIdx !== null ? lessons[nextIdx] : null;
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Lesson complete</p>
            <h2 className="text-lg font-semibold">{lesson.title}</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={exitLesson}>
            Exit
          </Button>
        </div>

        <Panel className="space-y-5 text-center py-8">
          <div className="bubble-in mx-auto w-14 h-14 rounded-full bg-successsoft text-success flex items-center justify-center">
            <AchievementIcon size={ICON_SIZE.lg} />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">{perfect ? "Perfect — the deck will stick." : "Lesson done — review the misses below."}</p>
            <p className="text-sm text-ink3 mt-1">
              {summary.correct} of {summary.total} check questions correct
            </p>
          </div>

          {summary.missed.length ? (
            <ul className="text-left space-y-2 max-w-md mx-auto">
              {summary.missed.map((m, i) => (
                <li key={i} className="text-xs border border-line rounded-[8px] px-3 py-2">
                  <span className="text-success font-medium">✓ {m.answer}</span>
                  <p className="mt-1 text-ink3">{m.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Pill tone="accent" className="inline-flex items-center gap-1.5">
              <StreakIcon size={ICON_SIZE.sm} />
              {streak.count}-day streak
            </Pill>
            {perfect ? <Pill tone="success">Flawless</Pill> : null}
          </div>

          {next ? (
            <div className="pt-2 border-t border-line">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Next up</p>
              <p className="text-sm font-medium text-ink mt-1">{next.topic.title}</p>
              <Button variant="primary" className="mt-3" onClick={continueFromSummary}>
                Start next lesson
              </Button>
            </div>
          ) : upNextSubject ? (
            <div className="pt-2 border-t border-line">
              <p className="text-sm text-ink3">All lessons in this subject are complete. 🎉</p>
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mt-3">Up next</p>
              <p className="text-sm font-medium text-ink mt-1">
                {upNextSubject.name} — {upNextSubject.remaining} {upNextSubject.remaining === 1 ? "lesson" : "lessons"} left
              </p>
              <Button
                variant="primary"
                className="mt-3"
                onClick={() => router.push(`/lesson?subject=${encodeURIComponent(upNextSubject.subjectId)}`)}
              >
                Switch to {upNextSubject.name}
              </Button>
            </div>
          ) : (
            <div className="pt-2 border-t border-line">
              <p className="text-sm text-ink3">All lessons in your subjects are complete. 🎉</p>
              <Button variant="primary" className="mt-3" onClick={exitLesson}>
                Back to lessons
              </Button>
            </div>
          )}
        </Panel>
      </div>
    );
  }

  // ---- Active lesson -----------------------------------------------------
  if (lesson && step) {
    const reveal = checkAnswered;
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Lesson</p>
            <h2 className="text-lg font-semibold">{lesson.title}</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={exitLesson}>
            Exit
          </Button>
        </div>
        <ProgressBar value={(stepIdx + 1) / lesson.steps.length} label={`Step ${stepIdx + 1} of ${lesson.steps.length}`} />

        {/* keyed by step id so each new step re-mounts and plays the enter animation */}
        <Panel key={step.id} className="space-y-4 app-enter">
          <p className="text-sm text-ink whitespace-pre-line">{step.body}</p>

          {step.check ? (
            <div className="space-y-2 pt-3 border-t border-line">
              <p className="text-sm font-medium">{step.check.question}</p>
              <ul className="space-y-2">
                {step.check.options.map((option, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = oi === step.check!.correctIndex;
                  return (
                    <li key={oi}>
                      <button
                        disabled={reveal}
                        onClick={() => answer(oi)}
                        aria-pressed={isChosen}
                        className={cx(
                          "w-full text-left text-sm px-3 py-2 rounded-[8px] border transition-colors flex items-center gap-2",
                          reveal
                            ? isCorrect
                              ? "border-success text-success"
                              : isChosen
                                ? "border-danger text-danger"
                                : "border-line text-ink3"
                            : "border-line hover:border-ink3 text-ink2",
                        )}
                      >
                        <span className="text-[11px] font-mono text-ink3 shrink-0">{oi + 1}</span>
                        <span className="min-w-0">{option}</span>
                        {reveal && isCorrect ? <span className="ml-auto shrink-0">✓</span> : null}
                        {reveal && isChosen && !isCorrect ? <span className="ml-auto shrink-0">✗</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Panel>

        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="ghost" disabled={stepIdx === 0} onClick={goBack}>
            Back
          </Button>
          {isLast ? (
            <Button variant="primary" onClick={finishLesson} disabled={!checkAnswered}>
              Finish lesson
            </Button>
          ) : (
            <Button variant="primary" disabled={!checkAnswered} onClick={advance}>
              {checkAnswered ? "Next" : "Answer to continue"}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-ink3 text-center">
          {hasCheck ? (
            <>
              <kbd className="font-mono px-1 py-0.5 rounded border border-line bg-surface2">1–4</kbd> answer ·{" "}
            </>
          ) : null}
          <kbd className="font-mono px-1 py-0.5 rounded border border-line bg-surface2">Enter</kbd> continue ·{" "}
          <kbd className="font-mono px-1 py-0.5 rounded border border-line bg-surface2">Esc</kbd> exit
        </p>
      </div>
    );
  }

  // ---- Lesson list -------------------------------------------------------
  const doneCount = lessons.filter((l) => completed[l.lesson.id]).length;
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Lessons</p>
          <h2 className="text-lg font-semibold">Learn from the start</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>

      {streak.count > 0 ? (
        <div className="flex items-center gap-2">
          <Pill tone="accent" className="inline-flex items-center gap-1.5">
            <StreakIcon size={ICON_SIZE.sm} />
            {streak.count}-day streak
          </Pill>
          <Pill>
            {doneCount} of {lessons.length} done
          </Pill>
        </div>
      ) : null}

      <ul className="space-y-2">
        {lessons.map((entry, idx) => {
          const done = completed[entry.lesson.id] === true;
          return (
            <li key={entry.lesson.id}>
              <button
                onClick={() => startLesson(idx)}
                className="w-full text-left px-4 py-3 rounded-[8px] border border-line hover:border-ink3 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{entry.topic.title}</p>
                  <p className="text-xs text-ink3 mt-0.5">{entry.lesson.steps.length} steps</p>
                </div>
                {done ? <Pill tone="success">Done</Pill> : <Pill>Start</Pill>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
