"use client";

import Link from "next/link";
import { relearnCheckpointFor } from "@/domain/practice-next-step";
import { getTopic } from "@/domain/curriculum";
import { TAUGHT_SPEC_POINT_IDS } from "@/content/teaching/taught-spec-points";
import type { Attempt, Question } from "@/domain/types";
import { CreditedIcon, ICON_SIZE } from "./icons";
import { Button, cx } from "./ui";

const TAUGHT = new Set(TAUGHT_SPEC_POINT_IDS);

/**
 * The bar that rises after a question is marked: the mark in one line, the
 * lesson for the lost point when Revise has written one, and the way on. The
 * full feedback stays in the marked result above it; this only makes the next
 * move reachable with a thumb. A provisional mark says so here too.
 */
export function AnswerFeedbackSheet({
  question,
  attempt,
  continueLabel,
  onContinue,
  disabled,
}: {
  question: Question;
  attempt: Attempt;
  continueLabel: string;
  onContinue: () => void;
  disabled?: boolean;
}) {
  const full = attempt.max > 0 && attempt.awarded >= attempt.max;
  const provisional = attempt.markAssessment?.provisional ?? false;
  const relearn = full ? null : relearnCheckpointFor({ question, marked: attempt.marked, taught: TAUGHT, topicFor: getTopic });

  return (
    <div
      className={cx(
        "sheet-enter sticky bottom-20 lg:bottom-4 z-10 rounded-cardlg border p-3 shadow-lg",
        full ? "border-success bg-successsoft" : "border-line bg-surface",
      )}
      data-testid="answer-feedback-sheet"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink tabular-nums">
            {full ? <CreditedIcon size={ICON_SIZE.md} aria-hidden="true" /> : null}
            {full ? "Full marks" : `${attempt.awarded} of ${attempt.max} marks`}
            {provisional ? <span className="font-normal text-ink3">· provisional</span> : null}
          </p>
          {relearn ? (
            <Link href={relearn.href} className="mt-0.5 inline-flex min-h-11 items-center text-xs font-medium text-ink2 underline underline-offset-4 hover:text-ink">
              Explain why: {relearn.ref}
            </Link>
          ) : (
            <p className="text-xs text-ink3">{full ? "Feedback is above if you want it." : "The feedback above shows where the marks went."}</p>
          )}
        </div>
        <Button variant="primary" className="shrink-0 min-h-[3rem] px-5" onClick={onContinue} disabled={disabled}>
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
