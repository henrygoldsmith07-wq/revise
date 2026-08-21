"use client";

import { useEffect, useMemo, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import {
  examClockState,
  formatExamTime,
  secondsRemaining,
} from "@/domain/exam-conditions";
import {
  selectQuickSessionQuestions,
  quickSessionQuestionLimit,
  type QuickSessionMinutes,
} from "@/domain/quick-session";
import type { Attempt, Question } from "@/domain/types";
import { useStore } from "@/state/store";
import { QuestionRunner } from "./QuestionRunner";
import { Button, EmptyState, Panel, Pill, ProgressBar, SectionHeading } from "./ui";
import { ICON_SIZE, TimerIcon } from "./icons";

interface QuickSessionResult {
  reason: "completed" | "timed-out";
  startedAt: number;
  endedAt: number;
}

export function QuickSessionMode({
  minutes,
  subjectId,
  topicId,
  onExit,
}: {
  minutes: QuickSessionMinutes;
  subjectId: string;
  topicId: string;
  onExit: () => void;
}) {
  const store = useStore();
  const subject = getSubject(subjectId);
  const [questionIds] = useState(() => {
    const pool = store.questions.filter(
      (question) => question.subjectId === subjectId && (!topicId || question.topicIds.includes(topicId)),
    );
    return selectQuickSessionQuestions(
      pool,
      store.attempts,
      new Map(store.mastery.map((row) => [row.topicId, row.mastery])),
      minutes,
    ).map((question) => question.id);
  });
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState<QuickSessionResult | null>(null);
  const [exitRequested, setExitRequested] = useState(false);

  const questionsById = useMemo(
    () => new Map(store.questions.map((question) => [question.id, question] as const)),
    [store.questions],
  );
  const queue = useMemo(
    () => questionIds.map((id) => questionsById.get(id)).filter((question): question is Question => Boolean(question)),
    [questionIds, questionsById],
  );
  const current = queue[index];
  const currentCompleted = current ? attempts.some((attempt) => attempt.questionId === current.id) : false;
  const allowedSeconds = minutes * 60;
  const remaining = startedAt ? secondsRemaining(startedAt, now, minutes) : allowedSeconds;
  const clockState = examClockState(remaining, 60);

  useEffect(() => {
    if (!startedAt || finished) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (secondsRemaining(startedAt, timestamp, minutes) <= 0) {
        setFinished({ reason: "timed-out", startedAt, endedAt: timestamp });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished, minutes, startedAt]);

  function start() {
    const timestamp = Date.now();
    setStartedAt(timestamp);
    setNow(timestamp);
  }

  function end(reason: QuickSessionResult["reason"]) {
    setFinished({ reason, startedAt: startedAt ?? Date.now(), endedAt: Date.now() });
  }

  if (!queue.length) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <SectionHeading title={`I Have ${minutes} Minutes`} hint="A focused question sprint" />
        <EmptyState
          title="No questions ready"
          body={
            topicId
              ? "There are no questions stored for this topic yet. Choose another topic or generate a question set first."
              : "There are no questions stored for this subject yet. Generate questions or upload a paper first."
          }
          action={<Button onClick={onExit}>Back to practice</Button>}
        />
      </div>
    );
  }

  if (finished) {
    return (
      <QuickSessionSummary
        minutes={minutes}
        result={finished}
        attempts={attempts}
        queue={queue}
        onExit={onExit}
      />
    );
  }

  if (!startedAt) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SectionHeading title={`I Have ${minutes} Minutes`} hint="A focused question sprint" />
        <Panel className="space-y-5">
          <div>
            <p className="text-lg font-semibold text-ink">Use the time you actually have.</p>
            <p className="text-sm text-ink3 mt-1">
              {subject?.name ?? subjectId}{topicId ? ` · ${getTopic(topicId)?.title ?? topicId}` : ""} · {queue.length} question{queue.length === 1 ? "" : "s"} selected
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="card card-2 p-3">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Time budget</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{formatExamTime(allowedSeconds)}</p>
            </div>
            <div className="card card-2 p-3">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Question set</p>
              <p className="text-xl font-semibold mt-1">{quickSessionQuestionLimit(minutes)} max</p>
            </div>
          </div>

          <div className="card card-2 p-3 text-sm text-ink2">
            <p><span className="font-semibold">Selected for you:</span> unseen questions and weaker topics first.</p>
            <p className="mt-1.5"><span className="font-semibold">How it works:</span> answer one question, see the marking, then move on. Only completed answers count.</p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={onExit}>Back to practice</Button>
            <Button variant="primary" className="w-full sm:flex-1 sm:min-w-48" onClick={start}>Start {minutes}-minute sprint</Button>
          </div>
        </Panel>
      </div>
    );
  }

  const clockTone = clockState === "warning" ? "review" : undefined;

  return (
    <div className="space-y-4">
      <header className="sticky top-14 lg:top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-bg/95 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Question sprint</p>
          <h1 className="text-sm font-semibold truncate">I Have {minutes} Minutes</h1>
          <p className="text-[11px] text-ink3">Question {index + 1} of {queue.length} · {subject?.name ?? subjectId}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill className="text-sm px-3 py-1.5 tabular-nums" tone={clockTone}>
            <TimerIcon size={ICON_SIZE.sm} aria-hidden />
            <span aria-label={`${formatExamTime(remaining)} remaining`}>{formatExamTime(remaining)}</span>
          </Pill>
          <Button size="sm" variant="ghost" className="min-h-10" onClick={() => setExitRequested(true)}>End sprint</Button>
        </div>
      </header>

      {clockState === "warning" ? (
        <div className="card card-2 p-3 text-sm text-review" role="status">One minute left. Finish the answer on screen, then move on.</div>
      ) : null}

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
            onClick={() => (index >= queue.length - 1 ? end("completed") : setIndex((value) => value + 1))}
          >
            {index >= queue.length - 1 ? "Finish sprint" : "Next question"}
          </Button>
        </>
      ) : null}

      {exitRequested ? (
        <Panel className="border-danger space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">End this sprint?</p>
            <p className="text-xs text-ink3 mt-1">Completed answers stay in your history. The question currently on screen will not count unless you submit it.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={() => setExitRequested(false)}>Keep going</Button>
            <Button variant="primary" className="w-full sm:w-auto" onClick={() => onExit()}>End sprint</Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function QuickSessionSummary({
  minutes,
  result,
  attempts,
  queue,
  onExit,
}: {
  minutes: QuickSessionMinutes;
  result: QuickSessionResult;
  attempts: Attempt[];
  queue: Question[];
  onExit: () => void;
}) {
  const awarded = attempts.reduce((total, attempt) => total + attempt.awarded, 0);
  const maximum = attempts.reduce((total, attempt) => total + attempt.max, 0);
  const accuracy = maximum ? Math.round((awarded / maximum) * 100) : 0;
  const usedSeconds = Math.min(minutes * 60, Math.max(0, (result.endedAt - result.startedAt) / 1000));

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <SectionHeading
        title={result.reason === "timed-out" ? "Time is up" : "Sprint complete"}
        hint={`I Have ${minutes} Minutes`}
      />
      <Panel className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{attempts.length}</p>
            <p className="text-[11px] text-ink3">answered</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{accuracy}%</p>
            <p className="text-[11px] text-ink3">accuracy</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{formatExamTime(usedSeconds)}</p>
            <p className="text-[11px] text-ink3">time used</p>
          </div>
        </div>
        <ProgressBar value={queue.length ? attempts.length / queue.length : 0} label={`${attempts.length} of ${queue.length} questions completed`} />
        <p className="text-xs text-ink3">
          {result.reason === "timed-out"
            ? "The clock ended the sprint. Your completed answers have still been marked and added to your review history."
            : "Your completed answers have been marked and any dropped marks have joined the review queue."}
        </p>
      </Panel>
      <Button variant="primary" className="w-full" onClick={onExit}>Back to practice</Button>
    </div>
  );
}

export function QuickSessionPicker({ onSelect }: { onSelect: (minutes: QuickSessionMinutes) => void }) {
  return (
    <section>
      <SectionHeading title="Short on time?" hint="A focused set with a real clock. No setup beyond choosing your minutes." />
      <div className="grid sm:grid-cols-2 gap-3">
        {([5, 10] as const).map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => onSelect(minutes)}
            className="card p-4 text-left hover:border-ink3 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">I Have {minutes} Minutes</p>
                <p className="text-xs text-ink3 mt-1">Up to {quickSessionQuestionLimit(minutes)} focused questions · stops at {minutes}:00</p>
              </div>
              <Pill tone="accent"><TimerIcon size={ICON_SIZE.sm} aria-hidden /> {minutes}m</Pill>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
