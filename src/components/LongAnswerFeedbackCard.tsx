"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildLongAnswerFeedback } from "@/domain/long-answer-feedback";
import type { MarkedPart, Question, QuestionPart } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import { Pill } from "./ui";

const MIN_MARKS = 4;

/** Ordered feedback for extended answers: earned, lost, why, best fix, then a different question. */
export function LongAnswerFeedbackCard({
  question,
  part,
  marked,
  answer,
  markConfidence,
  escalated,
}: {
  question: Question;
  part: QuestionPart;
  marked: MarkedPart;
  answer: string;
  markConfidence: number | null;
  escalated: boolean;
}) {
  const store = useStoreFields("questions", "attempts");
  const feedback = useMemo(() => buildLongAnswerFeedback({
    question, part, marked, answer,
    attempt: { markedBy: "ai", ...(markConfidence !== null ? { markConfidence } : {}), ...(escalated ? { markEscalation: { status: "pending" as const } } : {}) },
    candidates: store.questions,
    attemptedQuestionIds: new Set(store.attempts.map((attempt) => attempt.questionId)),
  }), [question, part, marked, answer, markConfidence, escalated, store.questions, store.attempts]);

  if (marked.max < MIN_MARKS || !answer.trim()) return null;
  return (
    <div className="mt-3 card card-2 p-3 bg-surface2 space-y-2" aria-label="Long answer feedback">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={feedback.lost.marks ? "review" : "success"}>{feedback.earned.marks}/{feedback.earned.of} earned</Pill>
        {feedback.lost.marks ? <Pill tone="danger">{feedback.lost.marks} lost</Pill> : null}
        {feedback.confidence.level === "low" ? <Pill tone="review">Provisional mark</Pill> : null}
      </div>
      {feedback.confidence.note ? <p className="text-xs text-review">{feedback.confidence.note}</p> : null}
      {feedback.why.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Why marks were lost</p>
          <ul className="mt-1 space-y-1 list-disc pl-4 text-xs text-ink2">{feedback.why.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      ) : null}
      <p className="text-xs text-ink2"><span className="font-semibold text-ink">Highest-impact fix:</span> {feedback.highestImpact}</p>
      {feedback.rewrite ? <p className="text-xs text-ink2"><span className="font-semibold text-ink">Rewrite only this:</span> {feedback.rewrite.instruction}</p> : null}
      {feedback.equivalentQuestionId ? (
        <Link className="inline-block text-xs font-medium text-accent underline" href={`/practice?question=${encodeURIComponent(feedback.equivalentQuestionId)}`}>
          Try a new, equivalent question
        </Link>
      ) : (
        <p className="text-[11px] text-ink3">No unseen equivalent question is available yet.</p>
      )}
      <p className="text-[11px] text-ink3">Writing checks are simple text patterns and never change your marks.</p>
    </div>
  );
}
