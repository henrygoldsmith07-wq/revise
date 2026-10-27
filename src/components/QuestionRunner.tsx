"use client";

import { validateCommandWord, type CommandWordValidation } from "@/domain/command-word-validation";
import { stemRepeatsOnlyPart } from "@/domain/question-display";
import { getSubject } from "@/domain/curriculum";
import { learnerEvidenceTrusted } from "@/domain/content-trust";
import { formatHint, nextHint, type HintTier } from "@/domain/hints";
import { type DelayedFarTransferRetest } from "@/domain/delayed-far-transfer";

import { shouldOfferMathInput } from "@/domain/math-input";

import { EditorialBadge } from "./EditorialBadge";
import { TrustDetails } from "./TrustDetails";

import type { Attempt, Id, InterventionAttemptContext, Mistake, Question } from "@/domain/types";

import { AnswerInput } from "./AnswerInput";
import { RichText } from "./RichText";
import { Button, Panel, Pill, cx } from "./ui";
import { CreditedIcon, ICON_SIZE, MissedIcon } from "./icons";
import { ProofCheckBanner } from "./ProofCheckBanner";

import { useQuestionExecution, type QuestionDraft } from "@/state/question-execution";
export type { QuestionDraft } from "@/state/question-execution";
import { MarkedResult } from "./QuestionMarkedResult";
import { ExamPaceTimer } from "./ExamPaceTimer";
import type { PracticeStepMode } from "@/domain/practice-step-mode";
import { marksLabel } from "@/domain/plural";
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
  onConfidence,
  inDiagnostic = false,
  stepMode = null,
}: {
  /**
   * The repair-plan step this question was opened for (/practice?guided=1,
   * ?timed=1, ?unaided=1). Guided shows the hint steps before the answer
   * box; timed shows an exam-pace clock. The page sets hintBudget to 0 for
   * timed and unaided, so neither offers help.
   */
  stepMode?: PracticeStepMode | null;
  question: Question;
  /** Answered inside a diagnostic check; see MarkedResult's `inDiagnostic`. */
  inDiagnostic?: boolean;
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
  /**
   * Ask how sure the student is as part of submitting, before the mark is
   * revealed. A confidence rating given after seeing the mark is a judgement
   * of the mark, not of the answer, so calibration data must be captured
   * here. When set, "Submit for marking" becomes two submit buttons.
   */
  onConfidence?: (confident: boolean) => void;
}) {
  const { answers, setAnswers, choice, setChoice, marking, result, awarded, topic, needsWjecHumanReview, isMcq, hintsOpen, setHintsOpen, visibleHints, upcoming, usedTiers, setUsedTiers, evidenceSource, ladder, submit, submitError } = useQuestionExecution({ question, mode, paperId, paperSpecId, paperRunId, retestMistake, farTransfer, draft, onDraftChange, onFinished, hintBudget, externalHintTier, repairTeachingSeen, intervention, mission, guided: stepMode === "guided" });
  const guided = stepMode === "guided";
  // The banner promises the answer "will count as evidence", so a far-transfer
  // check shows it only on a question that can carry learner evidence; on an
  // unreviewed one the check still runs unaided but is practice.
  const isProofContext = hintBudget === 0 && (mission?.stage === "delayed-proof" || (Boolean(farTransfer) && learnerEvidenceTrusted(question)));
  return (
    <div className="space-y-4">
      {isProofContext && !result ? (
        <ProofCheckBanner topicTitle={topic?.title} href={`/practice?topic=${encodeURIComponent(question.topicIds[0] ?? question.subjectId)}`} state="due" />
      ) : null}
      <Panel>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill>{marksLabel(question.totalMarks)}</Pill>
          <Pill>{topic?.title ?? question.subjectId}</Pill>
          {retestMistake ? <Pill tone="review">Retest</Pill> : null}
          {question.origin === "past-paper" ? <Pill tone="review">Past paper</Pill> : null}
          <EditorialBadge source={question.source ?? null}
            verification={needsWjecHumanReview ? "unverified" : question.verification ?? null}
            origin={question.origin} reviewer={question.reviewer ?? null} contentTier={getSubject(question.subjectId)?.contentTier} />
          {needsWjecHumanReview ?
            <span className="text-xs text-ink3">Needs human review · practice evidence only</span> : null}
          {!question.calculatorAllowed ? <Pill tone="danger">No calculator</Pill> : null}
          {farTransfer ? <Pill tone="accent">Delayed check · new context</Pill> : null}
        </div>

        <TrustDetails question={question} />

        {stepMode === "timed" ? <ExamPaceTimer marks={question.totalMarks} stopped={Boolean(result)} /> : null}
        {stepMode === "unaided" && !result ? (
          // What the mark will be recorded as depends on this question's
          // review state (learnerEvidenceTrusted), not on the step: an unaided
          // answer on an unreviewed question is labelled "practice evidence
          // only" above, so it must not be promised as evidence here.
          <p className="text-xs text-ink3 mb-3" data-testid="unaided-step-note" data-evidence={learnerEvidenceTrusted(question) ? "reviewed" : "practice"}>
            {learnerEvidenceTrusted(question)
              ? "Unaided: no hints on this one, so the mark counts as your own evidence."
              : "Unaided: no hints on this one, so the mark shows what you can do on your own. This question has not been checked by a teacher yet, so it counts as practice, not proof."}
          </p>
        ) : null}

        {farTransfer ? (
          <div className="rounded-lg border border-accent bg-accentsoft px-3 py-2.5 mb-4 text-sm text-ink2">
            <p className="font-semibold text-ink">Does it hold in a new context?</p>
            <p className="text-xs mt-1">
              This checks the same idea, {farTransfer.delayDays} days later, on a question set in a different context. It is
              marked separately from your original answer.
            </p>
          </div>
        ) : null}

        {stemRepeatsOnlyPart(question) ? null : <RichText className="text-base leading-7 text-ink">{question.stem}</RichText>}

        {guided && !result ? (
          <div className="rounded-lg border border-accent bg-accentsoft px-3 py-2.5 mt-4 space-y-2" data-testid="guided-steps" aria-live="polite">
            <p className="text-sm font-semibold text-ink">Guided try: use these steps as you write</p>
            {visibleHints.length ? (
              <ol className="space-y-1.5 list-decimal pl-5">
                {visibleHints.map((hint) => (
                  <li key={hint.tier} className="text-sm text-ink2">{formatHint(hint)}</li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink2">This question has no step-by-step support yet; answer it as normal.</p>
            )}
            <p className="text-[11px] text-ink3">
              Practice, not proof: a guided answer is marked as normal but counts at reduced weight. Only an unaided answer on a teacher-reviewed question can count as proof.
            </p>
          </div>
        ) : null}

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
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink3 mt-0.5">
                      {String.fromCharCode(65 + index)}
                      {correct ? <CreditedIcon size={ICON_SIZE.sm} aria-hidden className="text-success" /> : wrongPick ? <MissedIcon size={ICON_SIZE.sm} aria-hidden className="text-danger" /> : null}
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
                {/* A live check while writing. Once marked, the mark supersedes it:
                    "Verb covered" beside a 0/2 read as a contradiction. */}
                {result ? null : <CommandWordCheck validation={validateCommandWord(question, part, answers[part.id] ?? "")} />}
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
        {hintsOpen && visibleHints.length && !(guided && !result) ? (
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
        {!result && !retestMistake?.resolved && onConfidence ? (
          <div className="mt-5 space-y-2" role="group" aria-labelledby={`confidence-${question.id}`}>
            <p id={`confidence-${question.id}`} className="text-sm font-semibold text-ink">Before you see the mark: how sure are you?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="w-full min-h-11"
                disabled={marking || (isMcq ? choice === null : !Object.values(answers).some((a) => a.trim()))}
                onClick={() => {
                  onConfidence(false);
                  void submit();
                }}
              >
                {marking ? "Marking…" : "Not sure · submit"}
              </Button>
              <Button
                variant="primary"
                className="w-full min-h-11"
                disabled={marking || (isMcq ? choice === null : !Object.values(answers).some((a) => a.trim()))}
                onClick={() => {
                  onConfidence(true);
                  void submit();
                }}
              >
                {marking ? "Marking…" : "Confident · submit"}
              </Button>
            </div>
          </div>
        ) : !result && !retestMistake?.resolved ? (
          <Button
            variant="primary"
            className="w-full min-h-11 mt-5"
            disabled={marking || (isMcq ? choice === null : !Object.values(answers).some((a) => a.trim()))}
            onClick={() => void submit()}
          >
            {marking ? "Marking…" : "Submit for marking"}
          </Button>
        ) : null}
        {submitError && !result && !marking ? (
          <p className="mt-3 text-sm text-danger" role="alert">{submitError}</p>
        ) : null}
      </Panel>

      {result ? (
        <MarkedResult
          question={question}
          result={result}
          awarded={awarded}
          answers={answers}
          attempt={result.lastAttempt}
          inDiagnostic={inDiagnostic}
          improvableAnswers={mode === "practice" && !farTransfer && !retestMistake && !inDiagnostic ? answers : undefined}
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
