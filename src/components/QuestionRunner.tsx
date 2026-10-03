"use client";

import { validateCommandWord, type CommandWordValidation } from "@/domain/command-word-validation";
import { getSubject } from "@/domain/curriculum";
import { formatHint, nextHint, type HintTier } from "@/domain/hints";
import { type DelayedFarTransferRetest } from "@/domain/delayed-far-transfer";

import { shouldOfferMathInput } from "@/domain/math-input";

import { EditorialBadge } from "./EditorialBadge";

import type { Attempt, Id, InterventionAttemptContext, Mistake, Question } from "@/domain/types";

import { AnswerInput } from "./AnswerInput";
import { RichText } from "./RichText";
import { Button, Panel, Pill, cx } from "./ui";

import { useQuestionExecution, type QuestionDraft } from "@/state/question-execution";
export type { QuestionDraft } from "@/state/question-execution";
import { MarkedResult } from "./QuestionMarkedResult";
const TIER_HINT_CTA: Record<HintTier, string> = {
  cue: "Reveal a small cue",
  prompt: "Reveal what to think about",
  scaffold: "Reveal the answer structure",
  "worked-solution": "Reveal a worked solution",
};

export function QuestionRunner({
  question,
  mode = "practice",
  paperId,
  paperSpecId,
  paperRunId,
  retestMistake,
  farTransfer,
  draft,
  onDraftChange,
  onFinished,
  hintBudget,
  externalHintTier,
  repairTeachingSeen = false,
  intervention,
  mission,
}: {
  question: Question;
  mode?: Attempt["mode"];
  paperId?: Id;
  paperSpecId?: Id;
  paperRunId?: Id;
  retestMistake?: Mistake;
  farTransfer?: DelayedFarTransferRetest;
  draft?: QuestionDraft;
  onDraftChange?: (draft: QuestionDraft) => void;
  onFinished?: (attempt: Attempt) => void;
  /**
   * Hint tiers available for this question. Defaults to the full ladder;
   * the independent rung passes 0 so the evidence stays unaided.
   */
  hintBudget?: number;
  externalHintTier?: HintTier | null;
  repairTeachingSeen?: boolean;
  intervention?: InterventionAttemptContext;
  mission?: Attempt["mission"];
}) {
  const { answers, setAnswers, choice, setChoice, marking, result, awarded, topic, needsWjecHumanReview, isMcq, hintsOpen, setHintsOpen, visibleHints, upcoming, usedTiers, setUsedTiers, evidenceSource, ladder, submit } = useQuestionExecution({ question, mode, paperId, paperSpecId, paperRunId, retestMistake, farTransfer, draft, onDraftChange, onFinished, hintBudget, externalHintTier, repairTeachingSeen, intervention, mission });
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill>{question.totalMarks} marks</Pill>
          <Pill>{topic?.title ?? question.subjectId}</Pill>
          {retestMistake ? <Pill tone="review">Retest</Pill> : null}
          {question.origin === "past-paper" ? <Pill tone="review">Past paper</Pill> : null}
          <EditorialBadge source={question.source ?? null}
            verification={needsWjecHumanReview ? "unverified" : question.verification ?? null}
            origin={question.origin} reviewer={question.reviewer ?? null} contentTier={getSubject(question.subjectId)?.contentTier} />
          {needsWjecHumanReview ?
            <span className="text-xs text-muted-foreground">Needs human review · practice evidence only</span> : null}
          {!question.calculatorAllowed ? <Pill tone="danger">No calculator</Pill> : null}
          {farTransfer ? <Pill tone="accent">Delayed far-transfer</Pill> : null}
        </div>

        {farTransfer ? (
          <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-2.5 mb-4 text-sm text-ink2">
            <p className="font-semibold text-ink">A different-context transfer check</p>
            <p className="text-xs mt-1">
              This question tests the same mapped learning claim after a {farTransfer.delayDays}-day delay. It is
              scored separately from the original answer.
            </p>
          </div>
        ) : null}

        <RichText className="text-base leading-7 text-ink">{question.stem}</RichText>

        {isMcq ? (
          <ul className="mt-4 space-y-1.5" role="radiogroup" aria-label="Choose one answer">
            {question.options?.map((option, index) => {
              const correct = result && index === question.correctIndex;
              const wrongPick = result && index === choice && index !== question.correctIndex;
              return (
                <li key={index}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={choice === index}
                    disabled={Boolean(result)}
                    onClick={() => {
                      setChoice(index);
                      onDraftChange?.({ answers, choice: index });
                    }}
                    className={cx(
                      "w-full min-h-12 sm:min-h-0 text-left card px-3 py-3 sm:py-2.5 flex gap-2.5 items-start transition-colors",
                      choice === index && !result && "border-ink3 bg-surface2",
                      correct && "border-success bg-successsoft",
                      wrongPick && "border-danger bg-dangersoft",
                    )}
                  >
                    <span className="text-xs font-semibold text-ink3 mt-0.5">
                      {String.fromCharCode(65 + index)}
                      {correct ? " ✓" : wrongPick ? " ✗" : ""}
                    </span>
                    <span className="sr-only">
                      {correct ? "Correct answer. " : wrongPick ? "Your incorrect pick. " : ""}
                      {choice === index ? "Selected." : ""}
                    </span>
                    <RichText className="text-sm flex-1">{option}</RichText>
                  </button>
                </li>
              );
            })}
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
                <CommandWordCheck validation={validateCommandWord(question, part, answers[part.id] ?? "")} />
                {result ? (
                  <div className="card card-2 p-3 text-sm text-ink2 whitespace-pre-wrap break-words">
                    {answers[part.id]?.trim() || "(no answer given)"}
                  </div>
                ) : (
                  <AnswerInput
                    id={part.id}
                    value={answers[part.id] ?? ""}
                    onChange={(value) => {
                      const nextAnswers = { ...answers, [part.id]: value };
                      setAnswers(nextAnswers);
                      onDraftChange?.({ answers: nextAnswers, choice });
                    }}
                    rows={Math.min(10, Math.max(3, part.marks + 1))}
                    mathMode={shouldOfferMathInput({
                      questionKind: question.kind,
                      subjectName: getSubject(question.subjectId)?.name,
                      stem: question.stem,
                      prompt: part.prompt,
                    })}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {!result && retestMistake?.resolved ? (
          <p className="text-xs text-success mt-5">This mistake is already resolved. Return to Progress to choose another repair.</p>
        ) : null}
        {!result && upcoming ? (
          <div className="mt-5">
            <Button
              variant="secondary"
              className="w-full min-h-11"
              aria-expanded={hintsOpen}
              onClick={() => {
                const next = nextHint(ladder, usedTiers);
                if (next) {
                  setHintsOpen(true);
                  setUsedTiers((prev) => (prev.includes(next.tier) ? prev : [...prev, next.tier]));
                }
              }}
            >
              {TIER_HINT_CTA[upcoming.tier]}
            </Button>
          </div>
        ) : null}
        {hintsOpen && visibleHints.length ? (
          <div className="mt-2 space-y-2" aria-live="polite">
            {visibleHints.map((hint) => (
              <p key={hint.tier} className="card card-2 p-3 text-sm text-ink2">
                {formatHint(hint)}
              </p>
            ))}
            {evidenceSource !== "independent" ? (
              <p className="text-[11px] text-ink3">
                Hint used — evidence: {evidenceSource}. The mark is kept, but mastery counts it at reduced weight.
              </p>
            ) : null}
          </div>
        ) : null}
        {!result && !retestMistake?.resolved ? (
          <Button
            variant="primary"
            className="w-full min-h-11 mt-5"
            disabled={marking || (isMcq ? choice === null : !Object.values(answers).some((a) => a.trim()))}
            onClick={() => void submit()}
          >
            {marking ? "Marking…" : "Submit for marking"}
          </Button>
        ) : null}
      </Panel>

      {result ? (
        <MarkedResult
          question={question}
          result={result}
          awarded={awarded}
          answers={answers}
          improvableAnswers={mode === "practice" && !farTransfer && !retestMistake ? answers : undefined}
        />
      ) : null}
    </div>
  );
}

function CommandWordCheck({ validation }: { validation: CommandWordValidation }) {
  if (validation.status === "not-applicable") return null;
  const tone = validation.status === "aligned" ? "success" : validation.status === "needs-attention" ? "review" : "neutral";
  const status = validation.status === "aligned" ? "Verb covered" : validation.status === "empty" ? "Start with the verb" : "Check the verb";
  return (
    <div className="flex items-start gap-2 mt-2 text-[11px] text-ink3">
      <Pill tone={tone}>{validation.label}</Pill>
      <p className="pt-0.5 leading-relaxed">
        <span className="font-semibold text-ink2">{status}.</span> {validation.message}
      </p>
    </div>
  );
}
