"use client";

import { useMemo, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildWeakTopicExam, type WeakTopicExam } from "@/domain/weak-topic-exam";
import type { Attempt, Question } from "@/domain/types";
import { useStore } from "@/state/store";
import { QuestionRunner } from "./QuestionRunner";
import { Button, EmptyState, Panel, Pill, ProgressBar, SectionHeading } from "./ui";

// ---------------------------------------------------------------------------
// Weak-topic exam — the questions behind the last 7 days of misses, re-sat
// now that the mark scheme is known, plus a fill of the same weak topics.
// No clock: the point is repairing dropped marks, not rehearsing exam timing.
// ---------------------------------------------------------------------------

export function WeakTopicExamMode({ onExit }: { onExit: () => void }) {
  const store = useStore();
  const [exam] = useState<WeakTopicExam>(() =>
    buildWeakTopicExam({ mistakes: store.mistakes, questions: store.questions }),
  );
  const questionsById = useMemo(
    () => new Map(store.questions.map((question) => [question.id, question] as const)),
    [store.questions],
  );
  const queue = useMemo(
    () => exam.questionIds.map((id) => questionsById.get(id)).filter((q): q is Question => Boolean(q)),
    [exam.questionIds, questionsById],
  );
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);

  const current = queue[index];
  const currentCompleted = current ? attempts.some((attempt) => attempt.questionId === current.id) : false;

  if (!queue.length) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <SectionHeading
          title="Weak-topic exam"
          hint={`Built from your misses in the last ${exam.windowDays} days`}
        />
        <EmptyState
          title="Nothing to repair yet"
          body="Answer some practice questions and every dropped mark from the last 7 days will be gathered here as a short exam."
          action={<Button onClick={onExit}>Back to practice</Button>}
        />
      </div>
    );
  }

  if (finished) {
    return (
      <WeakExamSummary exam={exam} attempts={attempts} onExit={onExit} />
    );
  }

  if (!started) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SectionHeading title="Weak-topic exam" hint="Rebuild this week's dropped marks" />
        <Panel className="space-y-4">
          <div>
            <p className="text-lg font-semibold text-ink">From your last {exam.windowDays} days of misses.</p>
            <p className="text-sm text-ink3 mt-1">
              {exam.questionIds.length} question{exam.questionIds.length === 1 ? "" : "s"} · {exam.totalMarks}{" "}
              marks · the topics where you lost the most come first.
            </p>
          </div>

          <ul className="card divide-y divide-line cv-list">
            {exam.topics.map((topic) => {
              const name = getTopic(topic.topicId)?.title ?? topic.topicId;
              return (
                <li key={topic.topicId} className="px-3 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-ink truncate">{name}</span>
                  <span className="text-[11px] text-ink3 shrink-0 tabular-nums">
                    {topic.misses} {topic.misses === 1 ? "miss" : "misses"} · ~{topic.marksLost} marks lost
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="card card-2 p-3 text-sm text-ink2">
            <p>
              <span className="font-semibold">Why re-sit them:</span> the questions behind this week&apos;s misses
              come first — now with the mark scheme in view, they are the fastest way to turn those marks from lost to
              recovered.
            </p>
            <p className="mt-1.5">
              <span className="font-semibold">How it works:</span> answer one question, see the marking, then move on.
              Dropped marks join the mistake queue again.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={onExit}>
              Back to practice
            </Button>
            <Button variant="primary" className="w-full sm:flex-1 sm:min-w-48" onClick={() => setStarted(true)}>
              Start exam
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="sticky top-14 lg:top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-bg/95 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Weak-topic exam</p>
          <h1 className="text-sm font-semibold truncate">
            {getTopic(queue[0]?.topicIds[0] ?? "")?.title ?? "This week's misses"}
          </h1>
          <p className="text-[11px] text-ink3">
            Question {index + 1} of {queue.length} · misses from the last {exam.windowDays} days
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill tone="accent">{queue[index] ? getSubject(queue[index].subjectId)?.name : ""}</Pill>
          <Button size="sm" variant="ghost" className="min-h-10" onClick={() => setExitRequested(true)}>
            End exam
          </Button>
        </div>
      </header>

      <ProgressBar value={attempts.length / queue.length} label={`${attempts.length} of ${queue.length} answered`} />

      {current ? (
        <>
          <QuestionRunner
            key={current.id}
            question={current}
            mode="practice"
            onFinished={(attempt) => setAttempts((previous) => [...previous, attempt])}
          />
          <Button
            variant="primary"
            className="w-full min-h-11"
            disabled={!currentCompleted}
            onClick={() => (index >= queue.length - 1 ? setFinished(true) : setIndex((value) => value + 1))}
          >
            {index >= queue.length - 1 ? "Finish exam" : "Next question"}
          </Button>
        </>
      ) : null}

      {exitRequested ? (
        <Panel className="border-danger space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">End this exam?</p>
            <p className="text-xs text-ink3 mt-1">
              Completed answers stay in your history. The question on screen will not count unless you submit it.
            </p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={() => setExitRequested(false)}>
              Keep going
            </Button>
            <Button variant="primary" className="w-full sm:w-auto" onClick={onExit}>
              End exam
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function WeakExamSummary({
  exam,
  attempts,
  onExit,
}: {
  exam: WeakTopicExam;
  attempts: Attempt[];
  onExit: () => void;
}) {
  const awarded = attempts.reduce((total, attempt) => total + attempt.awarded, 0);
  const maximum = attempts.reduce((total, attempt) => total + attempt.max, 0);
  const accuracy = maximum ? Math.round((awarded / maximum) * 100) : 0;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <SectionHeading title="Exam complete" hint="Weak topics from your last 7 days of misses" />
      <Panel className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{attempts.length}</p>
            <p className="text-[11px] text-ink3">answered</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{accuracy}%</p>
            <p className="text-[11px] text-ink3">this paper</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{awarded}</p>
            <p className="text-[11px] text-ink3">marks earned</p>
          </div>
        </div>
        <ProgressBar
          value={exam.questionIds.length ? attempts.length / exam.questionIds.length : 0}
          label={`${attempts.length} of ${exam.questionIds.length} questions completed`}
        />
        <p className="text-xs text-ink3">
          {attempts.length < exam.questionIds.length
            ? "You left before the paper was finished. What you answered has been marked; anything still dropped has joined the mistake queue."
            : "Every answer was marked. Marks still dropped have joined the mistake queue — they become the next week's weak-topic exam if they stay lost."}
        </p>
      </Panel>
      <Button variant="primary" className="w-full" onClick={onExit}>
        Back to practice
      </Button>
    </div>
  );
}
