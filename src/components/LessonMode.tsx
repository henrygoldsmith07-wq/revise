"use client";

import { useMemo, useState } from "react";
import { buildLesson } from "@/content/lessons";
import type { Topic } from "@/domain/types";
import { Button, EmptyState, Panel, Pill, ProgressBar } from "./ui";

// Lesson mode: learn a topic from zero before drilling it with flashcards.
// Steps are derived from authored curriculum data; each check question gates
// progress so reading stays active instead of passive. Completion is tracked
// per topic in localStorage — light-weight, offline-first, per-device.

const STORAGE_KEY = "revise.lessons.completed";

function readCompleted(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCompleted(map: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private browsing: completion tracking is best-effort only */
  }
}

export function LessonMode({ topics, onExit }: { topics: Topic[]; onExit: () => void }) {
  const lessons = useMemo(
    () => topics.map((t) => ({ topic: t, lesson: buildLesson(t) })).filter((x): x is { topic: typeof topics[number]; lesson: NonNullable<ReturnType<typeof buildLesson>> } => x.lesson !== null),
    [topics],
  );
  const [completed, setCompleted] = useState<Record<string, boolean>>(readCompleted);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, number>>({}); // stepId -> chosen option

  if (!lessons.length) {
    return (
      <div className="max-w-2xl mx-auto">
        <EmptyState title="No lessons available" body="Pick a topic with authored key points first." />
      </div>
    );
  }

  const active = activeIdx !== null ? lessons[activeIdx] : null;
  if (active?.lesson) {
    const lesson = active.lesson;
    const step = lesson.steps[stepIdx];
    const chosen = step?.id ? checked[step.id] : undefined;
    const isLast = stepIdx === lesson.steps.length - 1;
    const checkAnswered = chosen !== undefined;

    const finishLesson = () => {
      const next = { ...completed, [lesson.id]: true };
      setCompleted(next);
      writeCompleted(next);
      setActiveIdx(null);
      setStepIdx(0);
    };

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Lesson</p>
            <h2 className="text-lg font-semibold">{lesson.title}</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setActiveIdx(null); setStepIdx(0); }}>
            Exit
          </Button>
        </div>
        <ProgressBar value={(stepIdx + 1) / lesson.steps.length} label={`Step ${stepIdx + 1} of ${lesson.steps.length}`} />

        <Panel className="space-y-4">
          <p className="text-sm text-ink whitespace-pre-line">{step.body}</p>

          {step.check ? (
            <div className="space-y-2 pt-3 border-t border-line">
              <p className="text-sm font-medium">{step.check.question}</p>
              <ul className="space-y-2">
                {step.check.options.map((option, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = oi === step.check!.correctIndex;
                  const reveal = checkAnswered;
                  return (
                    <li key={oi}>
                      <button
                        disabled={reveal}
                        onClick={() => setChecked((prev) => ({ ...prev, [step.id]: oi }))}
                        className={
                          "w-full text-left text-sm px-3 py-2 rounded-[8px] border transition-colors " +
                          (reveal
                            ? isCorrect
                              ? "border-success text-success"
                              : isChosen
                                ? "border-danger text-danger"
                                : "border-line text-ink3"
                            : "border-line hover:border-ink3 text-ink2")
                        }
                      >
                        {option}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Panel>

        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {isLast ? (
            <Button variant="primary" onClick={finishLesson} disabled={!checkAnswered}>
              Finish lesson
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!checkAnswered}
              onClick={() => setStepIdx((s) => Math.min(lesson.steps.length - 1, s + 1))}
            >
              {checkAnswered ? "Next" : "Answer to continue"}
            </Button>
          )}
        </div>
      </div>
    );
  }

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

      <ul className="space-y-2">
        {lessons.map((entry, idx) => {
          const done = completed[entry.lesson.id] === true;
          return (
            <li key={entry.lesson.id}>
              <button
                onClick={() => { setActiveIdx(idx); setStepIdx(0); setChecked({}); }}
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
