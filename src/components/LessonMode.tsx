"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildRoadmapLessons, summariseLesson } from "@/content/lessons";
import { allTopics, getSubject, unitsFor } from "@/domain/curriculum";
import type { Topic } from "@/domain/types";
import type { RoadmapLessonEntry } from "@/content/lessons";
import { AchievementIcon, StreakIcon, VideoIcon, ICON_SIZE } from "./icons";
import { RichText } from "./RichText";
import { VideoLesson } from "./VideoLesson";
import { useShortcuts } from "./shortcuts";
import { Button, EmptyState, Panel, Pill, ProgressBar, cx } from "./ui";
import { useStore } from "@/state/store";

const STEP_META = {
  overview: { label: "Big picture", tone: "accent" },
  core: { label: "Key idea", tone: "accent" },
  trap: { label: "Common trap", tone: "review" },
  misconception: { label: "Fix a misconception", tone: "danger" },
} as const;

type LessonEntry = RoadmapLessonEntry;

// Lesson mode: learn a topic from zero before drilling it with flashcards.
// Steps are derived from authored curriculum data; each check question gates
// progress so reading stays active instead of passive. Completion and the
// lesson streak live in the synced store (one row per user), so progress
// follows the student across devices instead of sitting in per-device
// localStorage. Video lessons mark their own `video:<topicId>` completion in
// the same map, so a watching session earns the streak exactly like reading.

export function LessonMode({ topics, onExit }: { topics: Topic[]; onExit: () => void }) {
  const lessons = useMemo<LessonEntry[]>(() => buildRoadmapLessons(topics), [topics]);

  const store = useStore();
  const { lessonProgress, completeLesson } = store;
  const completed = lessonProgress.completed;
  const streak = lessonProgress.streak;
  const currentSubjectId = topics[0]?.subjectId ?? null;
  const roadmapUnits = useMemo(
    () =>
      (currentSubjectId ? unitsFor(currentSubjectId) : [])
        .map((unit) => ({
          unit,
          entries: lessons
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.topic.unitId === unit.id),
        }))
        .filter((group) => group.entries.length > 0),
    [currentSubjectId, lessons],
  );
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, number>>({}); // stepId -> chosen option
  const [summary, setSummary] = useState<{
    correct: number;
    total: number;
    missed: { body: string; answer: string; explanation: string }[];
  } | null>(null);
  // When set, the video-style lesson replaces the whole lesson view; keyed by
  // topic id in the render so switching topics restarts the player cleanly.
  const [videoTopic, setVideoTopic] = useState<Topic | null>(null);
  // Watching a video to the end completes its `video:<topicId>` entry in the
  // same synced map the step lessons use — the streak bump comes with it.
  const markVideoWatched = useCallback(
    (topicId: string) => {
      void completeLesson(`video:${topicId}`);
    },
    [completeLesson],
  );

  const active = activeIdx !== null ? lessons[activeIdx] : null;
  const lesson = active?.lesson ?? null;
  const step = lesson && !summary ? lesson.steps[stepIdx] : null;
  const isEntryComplete = useCallback(
    (entry: LessonEntry) =>
      Boolean(
        completed[entry.lesson.id] ||
          completed[`video:${entry.topic.id}`] ||
          completed[`lesson:${entry.topic.id}`],
      ),
    [completed],
  );
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
      if (!isEntryComplete(lessons[i])) return i;
    }
    for (let i = 0; i < activeIdx; i++) {
      if (!isEntryComplete(lessons[i])) return i;
    }
    return null;
  }, [activeIdx, isEntryComplete, lessons]);

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
  let upNextSubject: { subjectId: string; name: string; remaining: number } | null = null;
  if (nextIdx === null) {
    for (const sid of store.settings.subjectIds) {
      if (sid === currentSubjectId) continue;
      const remaining = buildRoadmapLessons(allTopics([sid])).filter(
        (entry) => !isEntryComplete(entry),
      ).length;
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

  // ---- Video lesson --------------------------------------------------------
  if (videoTopic) {
    // Chain to the first not-yet-watched video after this one (wrapping), so a
    // watching session flows topic to topic like the step lessons do.
    const currentIndex = topics.findIndex((t) => t.id === videoTopic.id);
    const nextTopic =
      topics
        .slice(currentIndex + 1)
        .concat(topics.slice(0, Math.max(0, currentIndex)))
        .find((t) => !completed[`video:${t.id}`]) ?? null;
    return (
      <VideoLesson
        key={videoTopic.id}
        topic={videoTopic}
        onExit={() => setVideoTopic(null)}
        onEnded={markVideoWatched}
        nextTopic={nextTopic}
        onSelectTopic={setVideoTopic}
      />
    );
  }

  // ---- Completion summary ------------------------------------------------
  if (lesson && summary) {
    const perfect = summary.total > 0 && summary.correct === summary.total;
    const next = nextIdx !== null ? lessons[nextIdx] : null;
    const recap = lesson.steps.filter((candidate) => candidate.kind === "core").map((candidate) => candidate.takeaway);
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
                  <RichText className="text-sm text-success">{`✓ ${m.answer}`}</RichText>
                  <RichText className="mt-1 text-ink3">{m.body}</RichText>
                  <RichText className="mt-2 text-ink2">{m.explanation}</RichText>
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

          {recap.length ? (
            <div className="text-left space-y-3 pt-4 border-t border-line">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Lesson recap</p>
                <p className="text-sm text-ink2 mt-1">Keep these ideas together; they are the spine of your answer.</p>
              </div>
              <ol className="space-y-2">
                {recap.map((point, index) => (
                  <li key={`${lesson.id}:recap:${index}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accentsoft text-[11px] font-semibold text-accent">
                      {index + 1}
                    </span>
                    <RichText className="text-sm text-ink2">{point}</RichText>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {next ? (
            <div className="pt-2 border-t border-line">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Next up</p>
              <p className="text-sm font-medium text-ink mt-1">{next.lesson.title}</p>
              <p className="text-xs text-ink3 mt-0.5">{next.topic.title}</p>
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
    const stepMeta = STEP_META[step.kind];
    const selectedCorrect = Boolean(step.check && chosen === step.check.correctIndex);
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Lesson</p>
            <h2 className="text-lg font-semibold">{lesson.title}</h2>
            <p className="text-xs text-ink3 mt-1 max-w-xl">{lesson.intro}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={exitLesson}>
            Exit
          </Button>
        </div>
        <ProgressBar value={(stepIdx + 1) / lesson.steps.length} label="Lesson progress" />

        {/* keyed by step id so each new step re-mounts and plays the enter animation */}
        <Panel key={step.id} className="space-y-4 app-enter">
          <div className="flex items-center justify-between gap-3">
            <Pill tone={stepMeta.tone}>{stepMeta.label}</Pill>
            <span className="text-[11px] text-ink3 tabular-nums">
              {stepIdx === 0 ? "Orientation" : `Step ${stepIdx} of ${lesson.steps.length - 1}`}
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold tracking-tight text-ink">{step.title}</h3>

          <RichText className="text-base text-ink">{step.body}</RichText>

          <div className="pt-4 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Break it down</p>
            <ol className="mt-2 space-y-2.5">
              {step.explanationSteps.map((line, index) => (
                <li key={`${step.id}:explanation:${index}`} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-semibold text-ink3">
                    {index + 1}
                  </span>
                  <RichText className="text-sm text-ink2">{line}</RichText>
                </li>
              ))}
            </ol>
          </div>

          {step.examLink ? (
            <div className="rounded-[8px] border border-line bg-surface2/50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">Exam link</p>
              <RichText className="text-xs text-ink2 mt-1">{step.examLink}</RichText>
            </div>
          ) : null}

          <div className="rounded-[8px] border border-accent/30 bg-accentsoft/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-accent font-semibold">Remember this</p>
            <RichText className="text-sm text-ink mt-1">{step.takeaway}</RichText>
          </div>

          {step.check ? (
            <div className="space-y-3 pt-4 border-t border-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Check your understanding</p>
                  <p className="text-xs text-ink3 mt-0.5">Choose the best answer, then read the explanation.</p>
                </div>
                <Pill tone="accent">Quick check</Pill>
              </div>
              <RichText className="text-sm font-medium text-ink">{step.check.question}</RichText>
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
                        <span className="min-w-0 flex-1">{option}</span>
                        {reveal && isCorrect ? <span className="ml-auto shrink-0">✓</span> : null}
                        {reveal && isChosen && !isCorrect ? <span className="ml-auto shrink-0">✗</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {reveal ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={cx(
                    "rounded-[8px] border px-3 py-2.5",
                    selectedCorrect ? "border-success/40 bg-successsoft/50" : "border-review/40 bg-reviewsoft/50",
                  )}
                >
                  <p className={cx("text-sm font-semibold", selectedCorrect ? "text-success" : "text-review")}>
                    {selectedCorrect ? "Correct — you have the idea." : "Not quite — let’s fix it."}
                  </p>
                  <RichText className="text-sm text-ink2 mt-1">{step.check.explanation}</RichText>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[8px] border border-line bg-surface2/50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">Pause and say it back</p>
              <p className="text-sm text-ink2 mt-1">
                Explain the idea aloud or in your head without looking. When it feels clear, continue to the next step.
              </p>
            </div>
          )}
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

  // ---- Learning roadmap ---------------------------------------------------
  const doneCount = lessons.filter(isEntryComplete).length;
  // Mirror the summary's "Next up" on the roadmap: one glanceable resume card
  // instead of making the student scan for the first unfinished lesson. A
  // topic counts as complete once either its guided lesson or video is done.
  const firstIncomplete = lessons.findIndex((entry) => !isEntryComplete(entry));
  const resumeIdx = firstIncomplete === -1 ? 0 : firstIncomplete;
  const resumeLabel =
    doneCount === 0
      ? "Start your first lesson"
      : firstIncomplete === -1
        ? "Review from the start"
        : "Continue where you left off";
  const overallProgress = lessons.length ? doneCount / lessons.length : 0;
  const roadmapTitle = currentSubjectId ? `${getSubject(currentSubjectId)?.name ?? "Subject"} roadmap` : "Learning roadmap";
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Subject roadmap</p>
          <h2 className="text-lg font-semibold">{roadmapTitle}</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border-2 border-accent/30 bg-surface2 shadow-sm">
        <div className="bg-accent px-4 py-4 text-onaccent sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] font-bold opacity-75">Your learning path</p>
              <h3 className="mt-1 text-xl font-bold tracking-tight">{roadmapTitle}</h3>
              <p className="mt-1 max-w-xl text-sm opacity-85">
                Follow the path from foundations to exam-ready ideas. Each node opens a short, step-by-step lesson.
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border-2 border-onaccent/30 px-3 py-2 text-center">
              <p className="text-2xl font-bold leading-none tabular-nums">{doneCount}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-75">of {lessons.length}</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <ProgressBar value={overallProgress} label={`${doneCount} of ${lessons.length} lessons complete`} tone="success" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              Completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border-2 border-accent bg-surface" aria-hidden="true" />
              Recommended next
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-surface2" aria-hidden="true" />
              Ready when you are
            </span>
          </div>
        </div>
      </section>

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

      <button
        type="button"
        onClick={() => startLesson(resumeIdx)}
        className="group w-full rounded-2xl border-2 border-accent/50 bg-surface2 px-4 py-4 text-left shadow-sm transition hover:border-accent hover:bg-surface sm:px-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-onaccent shadow-[0_3px_0_var(--accent)]" aria-hidden="true">
              {firstIncomplete === -1 ? "↻" : "▶"}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-bold">{resumeLabel}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-ink">{lessons[resumeIdx]?.lesson.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink2">
                {lessons[resumeIdx]?.topic.title} · {lessons[resumeIdx]?.lesson.focus}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-bold text-ink transition-transform group-hover:translate-x-0.5">
            {firstIncomplete === -1 ? "Review" : "Start"} <span aria-hidden="true">→</span>
          </span>
        </div>
      </button>

      <ul className="space-y-6" aria-label="Learning roadmap units">
        {roadmapUnits.map(({ unit, entries }, unitIndex) => {
          const unitDone = entries.filter(({ entry }) => isEntryComplete(entry)).length;
          const unitCurrent = entries.some(({ index }) => index === firstIncomplete);
          const unitComplete = unitDone === entries.length;
          const unitProgress = entries.length ? unitDone / entries.length : 0;
          return (
            <li key={unit.id}>
              <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <header className="flex items-start justify-between gap-4 bg-accent px-4 py-4 text-onaccent sm:px-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] uppercase tracking-[0.14em] font-bold opacity-75">Unit {unitIndex + 1}</p>
                      <span className="rounded-full border border-onaccent/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        {unitComplete ? "Complete" : unitCurrent ? "Your next unit" : "In your path"}
                      </span>
                    </div>
                    <h3 className="mt-1 text-lg font-bold tracking-tight">{unit.title}</h3>
                    <p className="mt-0.5 text-xs opacity-80">
                      {unitDone} of {entries.length} lessons complete · follow this unit in order
                    </p>
                  </div>
                  <div className="w-24 shrink-0 pt-1 sm:w-32">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-onaccent/20"
                      role="progressbar"
                      aria-label={`Unit ${unitIndex + 1} progress`}
                      aria-valuenow={Math.round(unitProgress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-full rounded-full bg-onaccent transition-[width] duration-700" style={{ width: `${Math.round(unitProgress * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[10px] font-semibold opacity-80">{Math.round(unitProgress * 100)}%</p>
                  </div>
                </header>

                <div className="relative px-3 py-6 sm:px-8 sm:py-8">
                  <div
                    className="pointer-events-none absolute bottom-8 left-8 top-8 w-1 rounded-full bg-line sm:left-1/2 sm:-translate-x-1/2"
                    aria-hidden="true"
                  />
                  <ol className="relative space-y-6 sm:space-y-8">
                  {entries.map(({ entry, index }, lessonNumber) => {
                    const done = isEntryComplete(entry);
                    const current = index === firstIncomplete;
                    const coreSteps = entry.lesson.steps.filter((candidate) => candidate.kind === "core");
                    const checks = entry.lesson.steps.filter((candidate) => candidate.check).length;
                    const supportingSteps = entry.lesson.steps.filter(
                      (candidate) => candidate.kind === "trap" || candidate.kind === "misconception",
                    ).length;
                    const estimatedMinutes = Math.max(5, Math.round(entry.lesson.steps.length * 1.5));
                    const cardTone = current
                      ? "border-accent bg-surface2"
                      : done
                        ? "border-line bg-surface2/70"
                        : "border-line bg-surface";
                    const nodeTone = done
                      ? "border-accent bg-accent text-onaccent shadow-[0_4px_0_var(--accent)]"
                      : current
                        ? "border-accent bg-surface text-accent shadow-[0_4px_0_var(--accent)] ring-4 ring-surface2"
                        : "border-line bg-surface2 text-ink3 shadow-[0_4px_0_var(--line)]";
                    return (
                      <li key={entry.lesson.id} className="relative grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:items-center sm:gap-0">
                        <div
                          className={cx(
                            "order-2 min-w-0 overflow-hidden rounded-2xl border-2 shadow-sm transition-colors sm:order-none sm:row-start-1",
                            cardTone,
                            lessonNumber % 2 === 0
                              ? "sm:col-start-1 sm:justify-self-end sm:mr-5"
                              : "sm:col-start-3 sm:justify-self-start sm:ml-5",
                          )}
                        >
                          <div className="flex items-stretch gap-1.5 p-1.5">
                            <button
                              type="button"
                              onClick={() => startLesson(index)}
                              className="group min-w-0 flex-1 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-surface2 sm:px-3"
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[10px] uppercase tracking-wide text-ink3 font-bold">
                                      {current ? "Up next" : done ? "Complete" : `Lesson ${lessonNumber + 1}`}
                                    </p>
                                    {current ? <Pill tone="accent">Recommended next</Pill> : null}
                                  </div>
                                  <h4 className="mt-1 text-sm font-bold text-ink">{entry.lesson.title}</h4>
                                  <p className="mt-0.5 line-clamp-2 text-xs text-ink2">
                                    {entry.topic.title} · checkpoint {entry.lesson.checkpointIndex} of {entry.lesson.checkpointTotal}
                                  </p>
                                  <p className="mt-0.5 line-clamp-2 text-xs text-ink2">{entry.lesson.focus}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink3">
                                    <span>{entry.lesson.steps.length} steps</span>
                                    <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
                                    <span>{checks} checks</span>
                                    <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
                                    <span>~{estimatedMinutes} min</span>
                                  </div>
                                </div>
                                <span className="shrink-0 pt-0.5 text-xs font-bold text-ink transition-transform group-hover:translate-x-0.5">
                                  {done ? "Review" : "Open"} <span aria-hidden="true">→</span>
                                </span>
                              </div>
                            </button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="self-center px-2 sm:px-2.5"
                              onClick={() => setVideoTopic(entry.topic)}
                              aria-label={`Play the video lesson for ${entry.topic.title}`}
                            >
                              <VideoIcon size={ICON_SIZE.sm} /> <span className="hidden sm:inline">Video</span>
                            </Button>
                          </div>

                          <details className="border-t border-line">
                            <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs font-bold text-ink2 transition hover:bg-surface2 hover:text-ink">
                              <span className="inline-flex items-center gap-2">
                                <span className="text-ink" aria-hidden="true">＋</span>
                                See detailed lesson outline
                              </span>
                            </summary>
                            <div className="space-y-3 px-3.5 pb-3.5">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-ink3 font-bold">What you will learn</p>
                                <ol className="mt-2 space-y-2">
                                  {coreSteps.map((candidate, coreIndex) => (
                                    <li key={`${entry.lesson.id}:outline:${candidate.id}`} className="flex items-start gap-2.5">
                                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-bold text-ink">
                                        {coreIndex + 1}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-ink">{candidate.title}</p>
                                        <RichText className="mt-0.5 text-xs text-ink2">{candidate.takeaway}</RichText>
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              {supportingSteps ? (
                                <p className="border-t border-line pt-3 text-xs text-ink2">
                                  The lesson also covers {supportingSteps} {supportingSteps === 1 ? "common trap" : "common traps"} or
                                  misconception{supportingSteps === 1 ? "" : "s"}, with feedback that shows what to say instead.
                                </p>
                              ) : null}
                              <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
                                <p className="text-[10px] uppercase tracking-wide text-ink font-bold">Lesson rhythm</p>
                                <p className="mt-1 text-xs text-ink2">
                                  Read the explanation, say the idea back without looking, then answer the quick checks before moving on.
                                </p>
                              </div>
                            </div>
                          </details>
                        </div>

                        <div className="order-1 flex flex-col items-center sm:order-none sm:col-start-2 sm:row-start-1 sm:justify-self-center">
                          <button
                            type="button"
                            onClick={() => startLesson(index)}
                            className={cx(
                              "flex h-14 w-14 items-center justify-center rounded-full border-4 text-base font-extrabold transition hover:scale-105 focus-visible:scale-105",
                              nodeTone,
                            )}
                            aria-label={`${done ? "Review" : "Open"} lesson ${lessonNumber + 1}: ${entry.topic.title}`}
                          >
                            {done ? "✓" : lessonNumber + 1}
                          </button>
                          <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-ink3">
                            {done ? "Done" : current ? "Start" : "Next"}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  </ol>
                </div>
              </section>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
