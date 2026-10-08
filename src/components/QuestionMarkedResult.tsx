"use client";

import { useEffect, useMemo } from "react";

import type { RetestEvaluation } from "@/domain/mistakes";

import type { LowConfidenceMarkDecision } from "@/domain/mark-escalation";
import { type RemediationAction } from "@/domain/remediation";
import type { RemediationPlan } from "@/domain/remediation";

import type { Attempt, AttemptWorkingEvidence, MarkedPart, Question } from "@/domain/types";

import { confidenceWord } from "@/domain/plain-numbers";
import { markAssessmentLabel, type MarkConfidenceAssessment } from "@/domain/marking-confidence";
import { ImproveAnswer } from "./ImproveAnswer";
import { FlagThisMark } from "./FlagThisMark";
import { LongAnswerFeedbackCard } from "./LongAnswerFeedbackCard";
import { ProofCheckBanner } from "./ProofCheckBanner";
import { RichText } from "./RichText";
import { ButtonLink, Panel, Pill, ProgressBar, SourceBadge, cx } from "./ui";
import { SocraticExaminerPanel } from "./SocraticExaminerPanel";
import { captureProductEvent } from "@/lib/product-telemetry";
import { CreditedIcon, ICON_SIZE, MissedIcon } from "./icons";

export function MarkedResult({
  question,
  result,
  awarded,
  improvableAnswers,
  answers,
  attempt,
}: {
  /** Submitted answers by part id, used for long-answer feedback. */
  answers?: Record<string, string>;
  /** The persisted attempt. Set when one exists, which is what makes a mark disputable. */
  attempt?: Attempt;
  question: Question;
  /** Original answers by part id. When set, parts that lost marks offer a guided rewrite. */
  improvableAnswers?: Record<string, string>;
  result: {
    marked: MarkedPart[];
    feedback: string;
    /** Present when the attempt is persisted; gates the "flag this mark" control. */
    attemptId?: string;
    source: "ai" | "fallback";
    note?: string;
    withheld?: string;
    retest?: RetestEvaluation;
    remediation: RemediationPlan;
    confidence: number | null;
    copiedAnswer?: boolean;
    workingAnalysis?: AttemptWorkingEvidence[];
    escalation?: LowConfidenceMarkDecision;
    /** Confidence-aware marking result; provisional marks are labelled and disputable. */
    assessment?: MarkConfidenceAssessment;
    farTransfer?: Attempt["farTransfer"];
    nextAction: { label: string; href: null; why: string };
  };
  awarded: number;
}) {
  const pct = question.totalMarks ? awarded / question.totalMarks : 0;
  // A reloaded or re-graded attempt carries only the stored record.
  const stored = attempt?.markAssessment;
  const provisional = result.assessment?.provisional ?? stored?.provisional ?? false;
  const markLabel = result.assessment?.label ?? (stored ? markAssessmentLabel(stored) : null);
  const plan = result.remediation;
  useEffect(() => {
    if (result.retest?.status === "resolved") {
      captureProductEvent("mistake.repaired", { count: 1 });
    }
    // Once per marked result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.retest?.status]);
  const showSocratic = question.kind !== "mcq" && awarded < question.totalMarks && Boolean(answers);
  const actions = useMemo(() => {
    const seen = new Map<string, RemediationAction>();
    for (const part of plan.parts) {
      for (const action of part.actions) {
        const key = action.misconception.toLowerCase();
        const prev = seen.get(key);
        if (!prev || action.confidence > prev.confidence) seen.set(key, action);
      }
    }
    return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
  }, [plan]);
  return (
    <Panel className="fade-in">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Examiner marking</p>
          <p className="text-2xl font-semibold tabular-nums">
            {awarded}
            <span className="text-ink3 text-lg">/{question.totalMarks}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <SourceBadge source={result.source} note={result.note} />
          {result.withheld ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink2 border border-line rounded-full px-2 py-0.5">
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="w-3 h-3 shrink-0 text-ink3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 1l4.2 1.6v2.6c0 2.6-1.7 4.5-4.2 5.4-2.5-.9-4.2-2.8-4.2-5.4V2.6L6 1z" />
                <path d="M4.4 6l1.1 1.1 2.2-2.4" />
              </svg>
              {result.withheld} withheld before sending
            </span>
          ) : null}
          {result.farTransfer ? (
            <Pill
              tone={
                result.farTransfer.role === "retest"
                  ? result.farTransfer.outcome?.passed
                    ? "success"
                    : "danger"
                  : "accent"
              }
            >
              {result.farTransfer.role === "retest"
                ? `Transfer ${Math.round((result.farTransfer.outcome?.percentage ?? 0) * 100)}%`
                : `Transfer check due ${result.farTransfer.scheduledFor}`}
            </Pill>
          ) : null}
          {markLabel ? (
            <Pill tone={provisional ? "review" : "success"}>{markLabel}</Pill>
          ) : result.source === "ai" ? (
            <Pill tone={result.escalation ? "review" : "success"}>
              {result.confidence === null ? "AI confidence unavailable" : `AI confidence: ${confidenceWord(result.confidence)}`}
            </Pill>
          ) : null}
          {result.copiedAnswer ? <Pill tone="review">Model answer matched — no independent credit</Pill> : null}
        </div>
      </div>
      {provisional ? (
        <div className="mb-3 rounded-[8px] border border-review bg-reviewsoft px-3 py-2.5 text-sm text-ink2" role="status">
          <p className="font-semibold text-review">Provisional mark</p>
          <p className="text-xs mt-1">
            {result.assessment?.explanation ??
              "This mark is provisional, not an examiner's decision. If you think it is wrong, use “Flag this mark”."}
          </p>
        </div>
      ) : null}
      {result.escalation ? (
        <div className="rounded-[8px] border border-review bg-reviewsoft px-3 py-2.5 text-sm text-ink2" role="status">
          <p className="font-semibold text-review">Human review requested</p>
          <p className="text-xs mt-1">{result.escalation.message}</p>
          <p className="text-[11px] text-ink3 mt-1">This pending escalation is saved with the attempt for a second-marker decision.</p>
        </div>
      ) : null}
      {result.farTransfer?.role === "source" ? (
        <p className="text-xs text-ink3 mb-3">
          You have another question scheduled for {result.farTransfer.scheduledFor} to check whether this learning
          transfers to a new context.
        </p>
      ) : null}
      <ProgressBar value={pct} tone={pct >= 0.8 ? "success" : pct >= 0.5 ? "review" : "danger"} />

      {/* Below full marks on a written answer: one guiding question before the
          mark scheme. MCQs are excluded — marking already reveals the key. */}
      {showSocratic ? <SocraticExaminerPanel question={question} marked={result.marked} answers={answers ?? {}} /> : null}

      {result.retest ? (
        <div
          className={cx(
            "mt-4 card card-2 p-3",
            result.retest.status === "resolved"
              ? "border-success bg-successsoft"
              : result.retest.status === "still-open"
                ? "border-danger bg-dangersoft"
                : "bg-surface2",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill
              tone={
                result.retest.status === "resolved"
                  ? "success"
                  : result.retest.status === "still-open"
                    ? "danger"
                    : "review"
              }
            >
              {result.retest.status === "resolved"
                ? "Retest passed"
                : result.retest.status === "still-open"
                  ? "Retest still open"
                  : "Retest not linked"}
            </Pill>
            <span className="text-xs text-ink2">{result.retest.feedback}</span>
          </div>
          {result.retest.status === "resolved" ? (
            <p className="text-[11px] text-success mt-2">The mistake has been removed from your open repair queue.</p>
          ) : result.retest.status === "still-open" ? (
            <p className="text-[11px] text-ink2 mt-2">Continue your adaptive session for the next evidence check.</p>
          ) : null}
        </div>
      ) : null}

      {result.remediation.headline ? (
        <div className="mt-4 card card-2 p-3 bg-surface2">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="review">Remediation</Pill>
            <span className="text-xs text-ink2">{result.remediation.headline.misconception}</span>
          </div>
          <p className="text-sm text-ink mt-2">{result.remediation.headline.action}</p>
          <p className="text-[11px] text-ink3 mt-1.5">Evidence: {result.remediation.headline.evidence}</p>
          {result.remediation.headline.targetKeyPoint ? (
            <p className="text-[11px] text-ink3 mt-1">
              Restudy: {result.remediation.headline.targetKeyPoint}
            </p>
          ) : null}
        </div>
      ) : null}

      {result.workingAnalysis?.some((row) => row.firstIncorrectStep != null || row.methodMarksAwarded + row.unitMarksAwarded + row.precisionMarksAwarded + row.followThroughMarksAwarded > 0) ? (
        <div className="mt-4 card card-2 p-3 bg-surface2" role="status">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Working check</p>
          {result.workingAnalysis.filter((row) => row.firstIncorrectStep != null || row.methodMarksAwarded + row.unitMarksAwarded + row.precisionMarksAwarded + row.followThroughMarksAwarded > 0).map((row) => (
            <p key={row.partId} className="text-xs text-ink2 mt-1">
              {row.firstIncorrectStep != null ? `First divergence at step ${row.firstIncorrectStep + 1}: ${row.firstErrorKind.replace(/-/g, " ")}. ` : "Working is consistent. "}
              {[row.methodMarksAwarded ? `${row.methodMarksAwarded} method` : "", row.followThroughMarksAwarded ? `${row.followThroughMarksAwarded} follow-through` : "", row.errorCarriedForward ? "error carried forward" : "", row.unitMarksAwarded ? `${row.unitMarksAwarded} unit` : "", row.precisionMarksAwarded ? `${row.precisionMarksAwarded} precision` : ""].filter(Boolean).join(", ")}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {result.marked.map((marked) => {
          const part = question.parts.find((p) => p.id === marked.partId);
          return (
            <div key={marked.partId}>
              <p className="text-sm font-semibold text-ink">
                {part?.label || "Answer"} — {marked.awarded}/{marked.max}
              </p>
              {marked.creditedPoints.length ? (
                <ul className="mt-1.5 space-y-1">
                  {marked.creditedPoints.map((point, i) => (
                    <li key={i} className="text-xs text-success flex gap-1.5">
                      <CreditedIcon size={ICON_SIZE.sm} aria-hidden className="shrink-0 mt-px" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {marked.missedPoints.length ? (
                <ul className="mt-1.5 space-y-1">
                  {marked.missedPoints.map((point, i) => (
                    <li key={i} className="text-xs text-danger flex gap-1.5">
                      <MissedIcon size={ICON_SIZE.sm} aria-hidden className="shrink-0 mt-px" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {answers && part && question.kind !== "mcq" && marked.max >= 4 ? (
                <LongAnswerFeedbackCard
                  question={question}
                  part={part}
                  marked={marked}
                  answer={answers[part.id] ?? ""}
                  markConfidence={result.confidence}
                  escalated={Boolean(result.escalation)}
                />
              ) : null}
              {improvableAnswers && part && question.kind !== "mcq" && marked.awarded < marked.max ? (
                <ImproveAnswer question={question} part={part} marked={marked} original={improvableAnswers[part.id] ?? ""} />
              ) : null}
              {marked.comment ? <p className="text-xs text-ink3 mt-1.5">{marked.comment}</p> : null}
              {attempt ? <FlagThisMark attempt={attempt} part={marked} /> : null}
              {marked.evidence?.length ? (
                <details className="mt-2" open={marked.missedPoints.length > 0}>
                  <summary className="text-xs text-ink2 cursor-pointer select-none">Evidence for each mark</summary>
                  <p className="text-[11px] text-ink3 mt-1.5">Matched locally against your answer and the mark scheme.</p>
                  <ul className="mt-2 space-y-2">
                    {marked.evidence.map((item, i) => {
                      const tone = item.status === "credited" ? "success" : item.status === "missed" ? "danger" : "review";
                      const label = item.status === "credited" ? "awarded" : item.status === "missed" ? "not awarded" : "unreported";
                      return (
                        <li key={`${item.point}:${i}`} className="card card-2 p-2.5 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Pill tone={tone}>{label}</Pill>
                            <Pill>{item.evidenceStrength} evidence</Pill>
                          </div>
                          <p className="text-ink2 mt-1.5">{item.point}</p>
                          <p className="text-ink3 mt-1">{item.explanation}</p>
                          {item.evidence ? (
                            <p className="text-ink3 mt-1">
                              Submitted text: <span className="text-ink2">“{item.evidence}”</span>
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ) : null}
              {part?.modelAnswer ? (
                <details className="mt-2">
                  <summary className="text-xs text-ink2 cursor-pointer select-none">Model answer</summary>
                  <RichText className="mt-1.5 text-sm">{part.modelAnswer}</RichText>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>

      {question.kind !== "mcq" && actions.length ? (
        <details className="mt-4 pt-4 border-t border-line" open={!showSocratic}>
          <summary className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2 cursor-pointer select-none">How to fix it</summary>
          <ul className="space-y-2.5">
            {actions.map((action) => (
              <li key={action.misconception} className="card card-2 p-3">
                <div className="flex items-start gap-2">
                  <MissedIcon size={ICON_SIZE.sm} aria-hidden className="shrink-0 mt-0.5 text-danger" />
                  <p className="text-sm font-semibold text-ink">{action.misconception}</p>
                </div>
                {action.misconceptionEntry ? (
                  <>
                    <p className="text-xs text-ink3 mt-2">
                      <span className="font-semibold">What it looks like: </span>
                      {action.misconceptionEntry.example}
                    </p>
                    <p className="text-sm text-ink2 mt-1.5">{action.misconceptionEntry.explanation}</p>
                    <div className="flex items-start gap-2 mt-1.5">
                      <CreditedIcon size={ICON_SIZE.sm} aria-hidden className="shrink-0 mt-0.5 text-success" />
                      <p className="text-sm text-ink2 flex-1">{action.misconceptionEntry.correction}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink2 mt-1.5">{action.action}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-4 pt-4 border-t border-line space-y-3">
        <RichText className="text-sm">{result.feedback}</RichText>
        <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What this taught us</p>
          <p className="text-sm font-semibold text-ink mt-0.5">{result.nextAction.label}</p>
          <p className="text-xs text-ink2 mt-0.5">{result.nextAction.why}</p>
        </div>
        {awarded < question.totalMarks ? (
          <div className="rounded-[8px] border border-line px-3 py-2.5 space-y-2" aria-label="Repair path">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Repair path — one flow</p>
            <ol className="text-xs text-ink2 space-y-1 list-decimal pl-4">
              <li>Your answer above is preserved. Read the cause below, then repair with help.</li>
              <li>Try a new related question on the same skill.</li>
              <li>Prove it on an unseen transfer question with no hints.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                href={`/tutor?topic=${encodeURIComponent(question.topicIds[0] ?? question.subjectId)}`}
                size="sm"
                variant="secondary"
                onClick={() => captureProductEvent("intervention.started", { kind: "misconception-repair" })}
              >
                Repair with tutor
              </ButtonLink>
              <ButtonLink
                href={`/practice?topic=${encodeURIComponent(question.topicIds[0] ?? question.subjectId)}`}
                size="sm"
                variant="secondary"
                onClick={() => captureProductEvent("intervention.started", { kind: "exam-style-question" })}
              >
                New related question
              </ButtonLink>
              <ButtonLink
                href={`/adaptive-session?topic=${encodeURIComponent(question.topicIds[0] ?? question.subjectId)}&start=1&proof=1`}
                size="sm"
                variant="primary"
                onClick={() => captureProductEvent("proof.attempted", { kind: "delayed-proof" })}
              >
                Unseen proof check
              </ButtonLink>
            </div>
            <p className="text-[11px] text-ink3">Help never counts as proof. Only an unaided answer on a new question does.</p>
          </div>
        ) : (
          <ProofCheckBanner
            topicTitle={question.topicIds[0]}
            href={`/adaptive-session?topic=${encodeURIComponent(question.topicIds[0] ?? question.subjectId)}&start=1&proof=1`}
            state="passed"
          />
        )}
        {/* Ask: what did this one attempt teach us? */}
        {result.marked.some((m) => m.missedPoints.length) ? (
          <div className="flex flex-wrap gap-1.5">
            {result.marked.flatMap((m) => m.missedPoints).slice(0, 3).map((point, i) => {
              const part = question.parts.find((p) => result.marked.some((mm) => mm.partId === p.id && mm.missedPoints.includes(point)));
              const ao = part?.aos?.[0];
              const difficulty = question.difficulty;
              return (
                <span key={i} className="inline-flex gap-1">
                  {ao ? <Pill tone="danger">{ao}</Pill> : null}
                  <Pill>Lvl {difficulty}</Pill>
                </span>
              );
            })}
          </div>
        ) : null}
        {!result.retest && awarded < question.totalMarks ? (
          <p className="text-[11px] text-ink3">
            The dropped marks have been logged as mistakes — with AO, command word and timing — and turned into cards that will reappear until you can answer them. See <span className="font-semibold">Progress</span> for expected marks per hour.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
