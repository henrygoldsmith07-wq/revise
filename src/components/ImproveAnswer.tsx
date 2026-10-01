"use client";

import { useState } from "react";
import { assessRewrite, improvementCues, type RewriteAssessment } from "@/domain/answer-improvement";
import { getSubject } from "@/domain/curriculum";
import { shouldOfferMathInput } from "@/domain/math-input";
import type { MarkedPart, Question, QuestionPart } from "@/domain/types";
import { AnswerInput } from "./AnswerInput";
import { Button, Pill } from "./ui";

const TONE: Record<RewriteAssessment["verdict"], "success" | "review" | "danger" | "neutral"> = {
  "full-marks": "success",
  improved: "success",
  "same-marks": "review",
  lower: "danger",
  copied: "danger",
  unchanged: "neutral",
};

/**
 * Rewrite a part that lost marks, guided by cues instead of the answer. The
 * rewrite is marked locally for practice and never saved as an attempt.
 */
export function ImproveAnswer({
  question,
  part,
  marked,
  original,
}: {
  question: Question;
  part: QuestionPart;
  marked: MarkedPart;
  original: string;
}) {
  const [open, setOpen] = useState(false);
  const [rewrite, setRewrite] = useState(original);
  const [assessment, setAssessment] = useState<RewriteAssessment | null>(null);
  const cues = assessment?.remainingCues ?? improvementCues(marked.missedPoints);

  return (
    <div className="mt-3">
      {!open ? (
        <Button size="sm" variant="secondary" aria-expanded={false} onClick={() => setOpen(true)}>
          Improve my answer
        </Button>
      ) : (
        <div className="card card-2 p-3 space-y-3" role="group" aria-label={`Improve your answer${part.label ? ` to part ${part.label}` : ""}`}>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Improve my answer</p>
            <p className="text-xs text-ink3 mt-0.5">
              Hints, not the answer. Rewrite it for more marks. This is practice only: it is not saved and does not change your mastery.
            </p>
          </div>
          {cues.length ? (
            <ul className="space-y-1" aria-label="What is still missing">
              {cues.map((cue) => (
                <li key={cue} className="text-xs text-ink2">{cue}</li>
              ))}
            </ul>
          ) : null}
          <AnswerInput
            id={`${part.id}-rewrite`}
            value={rewrite}
            onChange={(value) => {
              setRewrite(value);
              setAssessment(null);
            }}
            rows={Math.min(10, Math.max(3, part.marks + 1))}
            mathMode={shouldOfferMathInput({
              questionKind: question.kind,
              subjectName: getSubject(question.subjectId)?.name,
              stem: question.stem,
              prompt: part.prompt,
            })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={!rewrite.trim()} onClick={() => setAssessment(assessRewrite({ question, part, original, rewrite }))}>
              Re-mark my rewrite
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
          {assessment ? (
            <div className="space-y-1" role="status">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={TONE[assessment.verdict]}>
                  {assessment.after.awarded}/{assessment.after.max}
                </Pill>
                <p className="text-xs text-ink2">{assessment.message}</p>
              </div>
              <p className="text-[11px] text-ink3">
                Your first answer and the rewrite are both marked by the offline rubric, so this is a like-for-like comparison.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
