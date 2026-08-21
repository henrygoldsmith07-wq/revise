"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiMark } from "@/ai/client";
import { getSubject, getTopic } from "@/domain/curriculum";
import {
  examClockState,
  examQuestionProgress,
  formatExamTime,
  secondsRemaining,
  unansweredQuestionCount,
  questionHasAnswer,
} from "@/domain/exam-conditions";
import { markMcq } from "@/domain/marking";
import type { Attempt, MarkedPart, Paper, PaperSpec, Question } from "@/domain/types";
import { useStore } from "@/state/store";
import { RichText } from "./RichText";
import { Button, Panel, Pill, ProgressBar, SectionHeading, cx } from "./ui";
import { ICON_SIZE, TimerIcon } from "./icons";

interface ExamResult {
  attempts: Attempt[];
  timedOut: boolean;
  elapsedMs: number;
  allowedSeconds: number;
  unanswered: number;
  paperSpecName: string;
}

const FALLBACK_PAPER_SPEC: PaperSpec = {
  id: "default-exam-paper",
  name: "Timed paper",
  weight: 1,
  durationMinutes: 90,
  calculatorAllowed: false,
};

export function ExamConditionMode({ paper, onExit }: { paper: Paper; onExit: () => void }) {
  const store = useStore();
  const subject = getSubject(paper.subjectId);
  const initialPaperSpecId = paper.paperSpecId && subject?.papers.some((candidate) => candidate.id === paper.paperSpecId)
    ? paper.paperSpecId
    : subject?.papers[0]?.id ?? FALLBACK_PAPER_SPEC.id;
  const [paperSpecId, setPaperSpecId] = useState(initialPaperSpecId);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [markingIndex, setMarkingIndex] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [questionElapsed, setQuestionElapsed] = useState<Record<string, number>>({});
  const questionStartedAt = useRef<number | null>(null);
  const finishing = useRef(false);
  const finishExamRef = useRef<(timedOut?: boolean) => Promise<void>>(async () => undefined);

  const questions = useMemo(
    () => paper.questionIds.map((id) => store.questions.find((question) => question.id === id)).filter((question): question is Question => Boolean(question)),
    [paper.questionIds, store.questions],
  );
  const current = questions[index];
  const paperSpec = subject?.papers.find((candidate) => candidate.id === paperSpecId) ?? subject?.papers[0] ?? FALLBACK_PAPER_SPEC;
  const totalMarks = questions.reduce((total, question) => total + question.totalMarks, 0);
  const allowedSeconds = paperSpec.durationMinutes * 60;
  const remaining = startedAt ? secondsRemaining(startedAt, now, paperSpec.durationMinutes) : allowedSeconds;
  const clockState = examClockState(remaining);
  const unanswered = unansweredQuestionCount(questions, answers);

  useEffect(() => {
    if (!startedAt || result || submitting) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (secondsRemaining(startedAt, timestamp, paperSpec.durationMinutes) <= 0) void finishExamRef.current(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paperSpec.durationMinutes, result, startedAt, submitting]);

  const recordCurrentTime = useCallback(() => {
    if (!startedAt || !questionStartedAt.current || !current) return;
    const elapsed = Math.max(0, Date.now() - questionStartedAt.current);
    setQuestionElapsed((previous) => ({
      ...previous,
      [current.id]: (previous[current.id] ?? 0) + elapsed,
    }));
    questionStartedAt.current = null;
  }, [current, startedAt]);

  const finishExam = async (timedOut = false) => {
      if (!startedAt || !questions.length || finishing.current) return;
      finishing.current = true;
      setSubmitting(true);
      setSessionError(null);
      setMarkingIndex(0);

      const elapsedByQuestion = { ...questionElapsed };
      if (current && questionStartedAt.current) {
        elapsedByQuestion[current.id] = (elapsedByQuestion[current.id] ?? 0) + Math.max(0, Date.now() - questionStartedAt.current);
        questionStartedAt.current = null;
      }
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const attempts: Attempt[] = [];

      try {
        for (const [questionIndex, question] of questions.entries()) {
          setMarkingIndex(questionIndex);
          const isMcq = question.kind === "mcq";
          let marked: MarkedPart[];
          let feedback: string;
          let source: "ai" | "fallback" = "fallback";
          const answerForQuestion: Record<string, string> = {};

          if (isMcq) {
            const chosen = Number.parseInt(answers[question.id] ?? "", 10);
            const single = markMcq(question, Number.isInteger(chosen) ? chosen : -1);
            marked = [single];
            feedback =
              single.awarded > 0
                ? `Correct. ${question.parts[0]?.modelAnswer ?? ""}`
                : `${single.comment} ${question.parts[0]?.modelAnswer ?? ""}`;
            answerForQuestion[question.parts[0]?.id ?? question.id] = Number.isInteger(chosen) ? String(chosen) : "";
          } else {
            for (const part of question.parts) answerForQuestion[part.id] = answers[part.id] ?? "";
            const envelope = await aiMark(question, answerForQuestion);
            marked = envelope.data.marked;
            feedback = envelope.data.feedback;
            source = envelope.source;
          }

          const attempt: Attempt = {
            id: crypto.randomUUID(),
            userId: store.userId,
            questionId: question.id,
            subjectId: question.subjectId,
            topicIds: question.topicIds,
            answers: answerForQuestion,
            marked,
            awarded: marked.reduce((total, part) => total + part.awarded, 0),
            max: marked.reduce((total, part) => total + part.max, 0),
            feedback,
            markedBy: source === "ai" ? "ai" : "rubric",
            elapsedMs: elapsedByQuestion[question.id] ?? 0,
            mode: "paper",
            createdAt: new Date().toISOString(),
          };

          await store.recordAttempt(attempt, question);
          attempts.push(attempt);
        }

        await store.addPaper({ ...paper, paperSpecId, status: "practised" });
        setResult({
          attempts,
          timedOut,
          elapsedMs,
          allowedSeconds,
          unanswered,
          paperSpecName: paperSpec.name,
        });
      } catch (error) {
        finishing.current = false;
        setSessionError(error instanceof Error ? error.message : "The marked answers could not be saved. Try submitting again.");
      } finally {
        setSubmitting(false);
      }
  };
  useEffect(() => {
    finishExamRef.current = finishExam;
  });

  function startExam() {
    const timestamp = Date.now();
    setSessionError(null);
    setStartedAt(timestamp);
    setNow(timestamp);
    setIndex(0);
    setReviewing(false);
    setExitRequested(false);
    questionStartedAt.current = timestamp;
  }

  function goToQuestion(nextIndex: number) {
    recordCurrentTime();
    setIndex(nextIndex);
    setReviewing(false);
    questionStartedAt.current = Date.now();
  }

  function openReview() {
    recordCurrentTime();
    setReviewing(true);
  }

  if (!questions.length) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <SectionHeading title="Full exam conditions" hint={paper.title} />
        <Panel className="space-y-3">
          <p className="text-sm text-ink2">This paper has no extracted questions yet, so it cannot be sat under exam conditions.</p>
          <Button onClick={onExit}>Back to papers</Button>
        </Panel>
      </div>
    );
  }

  if (result) return <ExamResultView paper={paper} result={result} onExit={onExit} />;

  if (!startedAt) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SectionHeading title="Full exam conditions" hint={paper.title} />
        <Panel className="space-y-5">
          <div>
            <p className="text-lg font-semibold text-ink">Set up your desk before the clock starts.</p>
            <p className="text-sm text-ink3 mt-1">
              {subject?.name ?? paper.subjectId} · {questions.length} questions · {totalMarks} marks
            </p>
          </div>

          {subject?.papers.length ? (
            <label className="block text-xs font-semibold text-ink2">
              Paper format
              <select value={paperSpecId} onChange={(event) => setPaperSpecId(event.target.value)} className="field text-sm mt-1">
                {subject.papers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.durationMinutes} minutes
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="card card-2 p-3">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Time allowed</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{formatExamTime(allowedSeconds)}</p>
            </div>
            <div className="card card-2 p-3">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Equipment</p>
              <p className="text-xl font-semibold mt-1">{paperSpec.calculatorAllowed ? "Calculator" : "No calculator"}</p>
            </div>
          </div>

          <div className="card card-2 p-3">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Exam rules</p>
            <ul className="space-y-2 text-sm text-ink2">
              <li className="flex gap-2"><span className="text-accent">•</span><span>The timer starts when you press Start and answers auto-submit at zero.</span></li>
              <li className="flex gap-2"><span className="text-accent">•</span><span>No hints, command-word prompts, dictation, photo tools, model answers or feedback appear during the paper.</span></li>
              <li className="flex gap-2"><span className="text-accent">•</span><span>You can move between questions. Blank questions are submitted as blank answers.</span></li>
              <li className="flex gap-2"><span className="text-accent">•</span><span>Leaving ends this run without saving or marking it.</span></li>
            </ul>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={onExit}>Back to papers</Button>
            <Button variant="primary" onClick={startExam} className="w-full sm:flex-1 sm:min-w-48">Start full exam</Button>
          </div>
        </Panel>
      </div>
    );
  }

  const clockTone = clockState === "time-up" ? "danger" : clockState === "warning" ? "review" : undefined;

  return (
    <div className="space-y-4">
      <header className="sticky top-14 lg:top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-bg/95 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Full exam conditions</p>
          <h1 className="text-sm font-semibold truncate">{paper.title}</h1>
          <p className="text-[11px] text-ink3">Question {index + 1} of {questions.length} · {paperSpec.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill className="text-sm px-3 py-1.5 tabular-nums" tone={clockTone}>
            <TimerIcon size={ICON_SIZE.sm} aria-hidden />
            <span aria-label={`${formatExamTime(remaining)} remaining`}>{formatExamTime(remaining)}</span>
          </Pill>
          <Button size="sm" variant="ghost" className="min-h-10" disabled={submitting} onClick={() => setExitRequested(true)}>End session</Button>
        </div>
      </header>

      {clockState === "warning" ? (
        <div className="card card-2 p-3 text-sm text-review" role="status">Five minutes or less remain. Submit any unfinished answers before the clock reaches zero.</div>
      ) : null}

      <ProgressBar value={examQuestionProgress(index, questions.length)} label={`Question ${index + 1} of ${questions.length}`} />

      {reviewing ? (
        <ReviewAnswers
          questions={questions}
          answers={answers}
          unanswered={unanswered}
          submitting={submitting}
          onSelect={goToQuestion}
          onBack={() => {
            setReviewing(false);
            questionStartedAt.current = Date.now();
          }}
          onSubmit={() => void finishExam(false)}
        />
      ) : current ? (
        <>
          <ExamQuestion
            question={current}
            answers={answers}
            disabled={submitting}
            onChoice={(choice) => setAnswers((previous) => ({ ...previous, [current.id]: String(choice) }))}
            onAnswer={(partId, value) => setAnswers((previous) => ({ ...previous, [partId]: value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button className="w-full min-h-11" disabled={index === 0 || submitting} onClick={() => goToQuestion(index - 1)}>Previous</Button>
            <Button variant="primary" className="w-full min-h-11" disabled={submitting} onClick={() => (index === questions.length - 1 ? openReview() : goToQuestion(index + 1))}>
              {index === questions.length - 1 ? "Review and submit" : "Next question"}
            </Button>
          </div>
        </>
      ) : null}

      {sessionError ? <p className="text-sm text-danger" role="alert">{sessionError}</p> : null}
      {submitting ? <p className="text-xs text-ink3 text-center" role="status">Marking question {markingIndex + 1} of {questions.length}…</p> : null}

      {exitRequested ? (
        <Panel className="border-danger space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">End this exam without submitting?</p>
            <p className="text-xs text-ink3 mt-1">Your answers will be discarded and this run will not be counted.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={() => setExitRequested(false)}>Keep working</Button>
            <Button variant="primary" className="w-full sm:w-auto" onClick={onExit}>End session</Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function ExamQuestion({
  question,
  answers,
  disabled,
  onChoice,
  onAnswer,
}: {
  question: Question;
  answers: Record<string, string>;
  disabled: boolean;
  onChoice: (choice: number) => void;
  onAnswer: (partId: string, value: string) => void;
}) {
  const isMcq = question.kind === "mcq";
  const choice = answers[question.id] === undefined ? null : Number.parseInt(answers[question.id], 10);
  const topic = getTopic(question.topicIds[0] ?? "");

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Pill>{question.totalMarks} marks</Pill>
        <Pill>{topic?.title ?? question.subjectId}</Pill>
        {question.origin === "past-paper" ? <Pill tone="review">Past paper</Pill> : null}
        {!question.calculatorAllowed ? <Pill tone="danger">No calculator</Pill> : null}
      </div>

      <RichText className="text-base leading-7 text-ink">{question.stem}</RichText>

      {isMcq ? (
        <ul className="mt-4 space-y-1.5">
          {question.options?.map((option, optionIndex) => (
            <li key={optionIndex}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChoice(optionIndex)}
                className={cx(
                  "w-full min-h-12 sm:min-h-0 text-left card px-3 py-3 sm:py-2.5 flex gap-2.5 items-start transition-colors",
                  choice === optionIndex && "border-ink3 bg-surface2",
                )}
              >
                <span className="text-xs font-semibold text-ink3 mt-0.5">{String.fromCharCode(65 + optionIndex)}</span>
                <RichText className="text-sm flex-1">{option}</RichText>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-5">
          {question.parts.map((part) => (
            <div key={part.id}>
              <div className="flex items-start gap-2 mb-1.5">
                {part.label ? <span className="text-sm font-semibold text-ink">{part.label}</span> : null}
                <RichText className="text-sm leading-6 flex-1 min-w-0">{part.prompt}</RichText>
                <span className="text-xs text-ink3 shrink-0 pt-0.5">[{part.marks}]</span>
              </div>
              <label htmlFor={`exam-${part.id}`} className="sr-only">{part.label ? `${part.label} answer` : "Your answer"}</label>
              <textarea
                id={`exam-${part.id}`}
                value={answers[part.id] ?? ""}
                onChange={(event) => onAnswer(part.id, event.target.value)}
                rows={Math.min(10, Math.max(3, part.marks + 1))}
                disabled={disabled}
                placeholder="Write your answer as you would in the exam…"
                className="field nice-scroll resize-y font-normal text-base leading-6"
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink3 mt-4">Answer saved in this session. It will be marked only after the paper is submitted.</p>
    </Panel>
  );
}

function ReviewAnswers({
  questions,
  answers,
  unanswered,
  submitting,
  onSelect,
  onBack,
  onSubmit,
}: {
  questions: Question[];
  answers: Record<string, string>;
  unanswered: number;
  submitting: boolean;
  onSelect: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <Panel className="space-y-5">
      <div>
        <p className="text-lg font-semibold text-ink">Ready to submit?</p>
        <p className="text-sm text-ink3 mt-1">
          {unanswered ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} blank.` : "Every question has an answer."} You cannot change answers after submitting.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {questions.map((question, questionIndex) => {
          const answered = questionHasAnswer(question, answers);
          return (
            <Button key={question.id} size="sm" disabled={submitting} onClick={() => onSelect(questionIndex)} className="w-full min-h-11 justify-between">
              <span>Question {questionIndex + 1}</span>
              <Pill tone={answered ? "success" : "danger"}>{answered ? "Answered" : "Blank"}</Pill>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <Button className="w-full sm:w-auto" disabled={submitting} onClick={onBack}>Back to paper</Button>
        <Button variant="primary" disabled={submitting} onClick={onSubmit} className="w-full sm:flex-1 sm:min-w-48">
          {submitting ? "Submitting…" : "Submit full paper"}
        </Button>
      </div>
    </Panel>
  );
}

function ExamResultView({ paper, result, onExit }: { paper: Paper; result: ExamResult; onExit: () => void }) {
  const awarded = result.attempts.reduce((total, attempt) => total + attempt.awarded, 0);
  const maximum = result.attempts.reduce((total, attempt) => total + attempt.max, 0);
  const percentage = maximum ? awarded / maximum : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <SectionHeading title={result.timedOut ? "Time called" : "Exam submitted"} hint={paper.title} />
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Examiner marking</p>
            <p className="text-3xl font-semibold tabular-nums mt-1">{awarded}<span className="text-ink3 text-xl">/{maximum}</span></p>
          </div>
          <Pill tone={percentage >= 0.7 ? "success" : percentage >= 0.5 ? "review" : "danger"}>
            {Math.round(percentage * 100)}%
          </Pill>
        </div>
        <ProgressBar value={percentage} tone={percentage >= 0.7 ? "success" : percentage >= 0.5 ? "review" : "danger"} />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="card card-2 p-3"><span className="text-ink3">Time used</span><p className="font-semibold tabular-nums mt-0.5">{formatExamTime(result.elapsedMs / 1000)}</p></div>
          <div className="card card-2 p-3"><span className="text-ink3">Time allowed</span><p className="font-semibold tabular-nums mt-0.5">{formatExamTime(result.allowedSeconds)}</p></div>
        </div>
        <p className="text-xs text-ink3">
          {result.timedOut ? "The timer submitted the paper automatically. " : "The paper was submitted under timed conditions. "}
          {result.unanswered ? `${result.unanswered} question${result.unanswered === 1 ? " was" : "s were"} blank.` : "All questions were answered."}
        </p>
      </Panel>

      <Panel>
        <SectionHeading title="Question breakdown" hint={`${result.paperSpecName} · feedback is now available in your review history`} />
        <ul className="divide-y divide-line">
          {result.attempts.map((attempt, index) => (
            <li key={attempt.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <span className="text-ink2">Question {index + 1}</span>
              <span className={cx("font-semibold tabular-nums", attempt.awarded === attempt.max ? "text-success" : "text-ink")}>{attempt.awarded}/{attempt.max}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Button variant="primary" className="w-full" onClick={onExit}>Back to papers</Button>
    </div>
  );
}
