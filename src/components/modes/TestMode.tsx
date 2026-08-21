"use client";

import { useMemo, useState } from "react";
import { buildTest, DEFAULT_TEST_SPEC, gradeTest } from "@/domain/study-modes";
import type { TestQuestion, TestSpec } from "@/domain/study-modes";
import type { Card, Id } from "@/domain/types";
import { RichText } from "../RichText";
import { Button, EmptyState, Field, Panel, Pill, ProgressBar, cx } from "../ui";
import { CreditedIcon, ICON_SIZE, MissedIcon } from "../icons";

// Test mode: a fixed paper, answered end to end, graded only at the finish.
// The delay is the point — knowing you got the last one right changes how you
// approach the next, and the real exam gives you no such feedback.

export function TestMode({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const [spec, setSpec] = useState<TestSpec>(DEFAULT_TEST_SPEC);
  const [started, setStarted] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 100000));
  const [answers, setAnswers] = useState<Record<Id, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const questions = useMemo(() => (started ? buildTest(cards, spec, seed) : []), [started, cards, spec, seed]);
  const result = useMemo(() => (submitted ? gradeTest(questions, answers) : null), [submitted, questions, answers]);
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim()).length;

  if (!cards.length) {
    return <EmptyState title="Nothing to test" body="No cards match this selection." action={<Button onClick={onExit}>Back</Button>} />;
  }

  if (!started) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Panel className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Set the test</h2>
            <p className="text-xs text-ink3 mt-0.5">
              Answer everything, then it is marked in one go — as an exam would be.
            </p>
          </div>
          <div className="space-y-1.5">
            {(
              [
                ["multipleChoice", "Multiple choice"],
                ["written", "Written answers"],
                ["trueFalse", "True or false"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer min-h-[2.25rem]">
                <input
                  type="checkbox"
                  checked={spec[key]}
                  onChange={(e) => setSpec({ ...spec, [key]: e.target.checked })}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                {label}
              </label>
            ))}
          </div>
          <Field label={`Questions — ${spec.limit}`}>
            <input
              type="range"
              min={5}
              max={Math.min(40, Math.max(5, cards.length))}
              step={5}
              value={spec.limit}
              onChange={(e) => setSpec({ ...spec, limit: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            disabled={!spec.multipleChoice && !spec.written && !spec.trueFalse}
            onClick={() => setStarted(true)}
          >
            Start test
          </Button>
        </Panel>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Panel>
          <p className="text-3xl font-semibold tabular-nums">
            {result.correct}
            <span className="text-ink3 text-xl">/{result.total}</span>
          </p>
          <div className="mt-2">
            <ProgressBar
              value={result.percent / 100}
              tone={result.percent >= 80 ? "success" : result.percent >= 50 ? "review" : "danger"}
            />
          </div>
          <p className="text-sm text-ink3 mt-2">{result.percent}% — every wrong answer is listed below.</p>
        </Panel>

        <ul className="space-y-2">
          {result.rows.map(({ question, given, correct }) => (
            <Panel as="li" key={question.id} className={cx(!correct && "border-danger")}>
              <div className="flex items-start gap-2">
                {correct ? (
                  <CreditedIcon size={ICON_SIZE.md} aria-hidden className="text-success shrink-0 mt-0.5" />
                ) : (
                  <MissedIcon size={ICON_SIZE.md} aria-hidden className="text-danger shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <RichText className="text-sm text-ink">{question.prompt}</RichText>
                  {!correct ? (
                    <>
                      <p className="text-xs text-danger mt-1.5">
                        You put: {formatGiven(question, given) || "(blank)"}
                      </p>
                      <div className="mt-1">
                        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Answer</p>
                        <RichText className="text-sm">{question.answer}</RichText>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </Panel>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
              setStarted(false);
            }}
          >
            Take another
          </Button>
          <Button className="flex-1" onClick={onExit}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Pill>{questions.length} questions</Pill>
        <Button size="sm" variant="ghost" onClick={onExit}>
          End
        </Button>
      </div>
      <ProgressBar value={questions.length ? answeredCount / questions.length : 0} label={`${answeredCount} answered`} />

      <ul className="space-y-3">
        {questions.map((question, index) => (
          <Panel as="li" key={question.id}>
            <p className="text-[11px] text-ink3 font-semibold mb-1.5">Question {index + 1}</p>
            <RichText className="text-sm text-ink">{question.prompt}</RichText>

            {question.options ? (
              <ul className="mt-3 space-y-1.5">
                {question.options.map((option, optionIndex) => (
                  <li key={optionIndex}>
                    <button
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: String(optionIndex) }))}
                      className={cx(
                        "w-full text-left card px-3 py-2.5 min-h-[2.75rem] transition-colors",
                        answers[question.id] === String(optionIndex)
                          ? "border-ink3 bg-surface2"
                          : "hover:border-ink3",
                      )}
                    >
                      <RichText className="text-sm">{option}</RichText>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <input
                value={answers[question.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                placeholder="Your answer…"
                className="field mt-3"
              />
            )}
          </Panel>
        ))}
      </ul>

      <Button variant="primary" className="w-full" onClick={() => setSubmitted(true)}>
        {answeredCount < questions.length
          ? `Submit — ${questions.length - answeredCount} unanswered`
          : "Submit test"}
      </Button>
    </div>
  );
}

function formatGiven(question: TestQuestion, given: string): string {
  if (!question.options) return given;
  const index = Number(given);
  return Number.isFinite(index) ? (question.options[index] ?? "") : "";
}
