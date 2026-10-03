"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import type { Attempt, Id, MissionAttemptContext, Question } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import { QuestionRunner } from "./QuestionRunner";
import { ButtonLink, Button, EmptyState, Panel, Pill, ProgressBar, SectionHeading } from "./ui";

// A fixed, untimed set of questions with an explained purpose. Recovery,
// paper-repair and equivalent-retest sessions all share it: the caller picks
// the questions and the framing, this runs them and reports what was earned.

export function QuestionSetSession({
  title,
  hint,
  intro,
  questionIds,
  startLabel = "Start session",
  emptyBody,
  onExit,
  renderSummary,
  hintBudgetFor,
  contextFor,
  exitLabel = "Back to practice",
  nextStep,
  resume,
  onProgress,
  onFinished,
}: {
  title: string;
  hint: string;
  intro: ReactNode;
  questionIds: Id[];
  startLabel?: string;
  emptyBody: string;
  onExit: () => void;
  renderSummary?: (attempts: Attempt[], queue: Question[]) => ReactNode;
  /** Per-question hint budget; 0 keeps the answer unaided so it counts as independent evidence. */
  hintBudgetFor?: Record<Id, number | undefined>;
  /** Mission attribution carried on each attempt. */
  contextFor?: Record<Id, MissionAttemptContext>;
  exitLabel?: string;
  /** The next best action, computed from the evidence this session just created. */
  nextStep?: { href: string; label: string; detail: string } | null;
  /** Continue a session interrupted by a refresh: skip the intro, start at `index`, keep the answers already given. */
  resume?: { index: number; attempts: Attempt[] };
  /** Called with the first unanswered position whenever it changes while the session runs. */
  onProgress?: (position: number, attempts: Attempt[]) => void;
  onFinished?: () => void;
}) {
  const store = useStoreFields("questions");
  const questionsById = useMemo(
    () => new Map(store.questions.map((question) => [question.id, question] as const)),
    [store.questions],
  );
  const queue = useMemo(
    () => questionIds.map((id) => questionsById.get(id)).filter((question): question is Question => Boolean(question)),
    [questionIds, questionsById],
  );
  const [index, setIndex] = useState(() => Math.min(resume?.index ?? 0, Math.max(0, queue.length - 1)));
  const [attempts, setAttempts] = useState<Attempt[]>(() => resume?.attempts ?? []);
  const [started, setStarted] = useState(Boolean(resume));
  const [finished, setFinished] = useState(() => Boolean(resume && queue.length > 0 && resume.index >= queue.length));
  const position = useMemo(() => {
    const next = queue.findIndex((question) => !attempts.some((attempt) => attempt.questionId === question.id));
    return next === -1 ? queue.length : next;
  }, [attempts, queue]);
  useEffect(() => {
    if (!started || !queue.length) return;
    if (finished) onFinished?.();
    else onProgress?.(position, attempts);
  }, [attempts, finished, onFinished, onProgress, position, queue.length, started]);
  const [exitRequested, setExitRequested] = useState(false);

  const current = queue[index];
  const currentCompleted = current ? attempts.some((attempt) => attempt.questionId === current.id) : false;
  const totalMarks = queue.reduce((sum, question) => sum + question.totalMarks, 0);

  if (!queue.length) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <SectionHeading title={title} hint={hint} />
        <EmptyState title="Nothing to practise yet" body={emptyBody} action={<Button onClick={onExit}>{exitLabel}</Button>} />
      </div>
    );
  }

  if (finished) {
    const awarded = attempts.reduce((sum, attempt) => sum + attempt.awarded, 0);
    const maximum = attempts.reduce((sum, attempt) => sum + attempt.max, 0);
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <SectionHeading title="Session complete" hint={title} />
        <Panel className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{attempts.length}</p>
              <p className="text-[11px] text-ink3">answered</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{maximum ? Math.round((awarded / maximum) * 100) : 0}%</p>
              <p className="text-[11px] text-ink3">this session</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{awarded}/{maximum}</p>
              <p className="text-[11px] text-ink3">marks earned</p>
            </div>
          </div>
          <ProgressBar value={queue.length ? attempts.length / queue.length : 0} label={`${attempts.length} of ${queue.length} questions completed`} />
          {renderSummary?.(attempts, queue)}
          <p className="text-xs text-ink3">
            Every answer was marked and saved. Marks still dropped stay in your mistake queue, and only a delayed retest closes them.
          </p>
        </Panel>
        {nextStep ? (
          <div className="space-y-2">
            <p className="text-sm text-ink2"><span className="font-medium text-ink">Next:</span> {nextStep.detail}</p>
            <ButtonLink href={nextStep.href} variant="primary" className="w-full">{nextStep.label}</ButtonLink>
            <Button className="w-full" onClick={onExit}>{exitLabel}</Button>
          </div>
        ) : (
          <Button variant="primary" className="w-full" onClick={onExit}>{exitLabel}</Button>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SectionHeading title={title} hint={hint} />
        <Panel className="space-y-4">
          <p className="text-sm text-ink3">
            {queue.length} question{queue.length === 1 ? "" : "s"} · {totalMarks} marks · about {Math.max(5, totalMarks)} minutes
          </p>
          <ul className="card divide-y divide-line cv-list">
            {queue.map((question) => (
              <li key={question.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-ink truncate">{getTopic(question.topicIds[0] ?? "")?.title ?? getSubject(question.subjectId)?.name ?? question.subjectId}</span>
                <span className="text-[11px] text-ink3 shrink-0 tabular-nums">{question.totalMarks} marks</span>
              </li>
            ))}
          </ul>
          <div className="card card-2 p-3 text-sm text-ink2 space-y-1.5">{intro}</div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={onExit}>{exitLabel}</Button>
            <Button variant="primary" className="w-full sm:flex-1 sm:min-w-48" onClick={() => setStarted(true)}>{startLabel}</Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="sticky top-14 lg:top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-bg/95 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{title}</p>
          <h1 className="text-sm font-semibold truncate">{getTopic(current?.topicIds[0] ?? "")?.title ?? title}</h1>
          <p className="text-[11px] text-ink3">Question {index + 1} of {queue.length}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {current ? <Pill tone="accent">{getSubject(current.subjectId)?.name}</Pill> : null}
          <Button size="sm" variant="ghost" className="min-h-10" onClick={() => setExitRequested(true)}>End session</Button>
        </div>
      </header>

      <ProgressBar value={attempts.length / queue.length} label={`${attempts.length} of ${queue.length} answered`} />

      {current ? (
        <>
          <QuestionRunner
            key={current.id}
            question={current}
            mode="practice"
            hintBudget={hintBudgetFor?.[current.id]}
            mission={contextFor?.[current.id]}
            onFinished={(attempt) => setAttempts((previous) => [...previous, attempt])}
          />
          <Button
            variant="primary"
            className="w-full min-h-11"
            disabled={!currentCompleted}
            onClick={() => (index >= queue.length - 1 ? setFinished(true) : setIndex((value) => value + 1))}
          >
            {index >= queue.length - 1 ? "Finish session" : "Next question"}
          </Button>
        </>
      ) : null}

      {exitRequested ? (
        <Panel className="border-danger space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">End this session?</p>
            <p className="text-xs text-ink3 mt-1">Completed answers stay in your history. The question on screen will not count unless you submit it.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={() => setExitRequested(false)}>Keep going</Button>
            <Button variant="primary" className="w-full sm:w-auto" onClick={onExit}>End session</Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
