"use client";

// The single next step under a practice answer that lost marks, plus the
// rest of the help, collapsed. See src/domain/practice-next-step.ts for the
// precedence. Nothing here changes marks, mastery or proof.

import Link from "next/link";
import { useState } from "react";
import { choosePracticeNextStep } from "@/domain/practice-next-step";
import { INTERVENTION_STEP_LABEL } from "@/domain/intervention-engine";
import type { RemediationAction, RemediationPlan } from "@/domain/remediation";
import type { TechniqueRepair, TechniqueShapeSuggestion } from "@/domain/technique-repair";
import type { MarkedPart, Question } from "@/domain/types";
import { captureProductEvent } from "@/lib/product-telemetry";
import { useInterventionPrescription } from "./InterventionPrescriptionPanel";
import { SocraticExaminerPanel } from "./SocraticExaminerPanel";
import { CreditedIcon, ICON_SIZE, MissedIcon } from "./icons";
import { ButtonLink, Pill } from "./ui";

export function PracticeNextStep({
  question,
  marked,
  answers,
  remediation,
  actions,
  nextAction,
  uncertainCause,
  techniqueRepair,
  techniqueShapeSuggestion,
  showSocratic,
  showMistakesLogged,
}: {
  question: Question;
  marked: MarkedPart[];
  answers?: Record<string, string>;
  remediation: RemediationPlan;
  /** Deduplicated "How to fix it" actions, highest confidence first. */
  actions: RemediationAction[];
  nextAction: { label: string; why: string };
  uncertainCause: string | null;
  techniqueRepair: TechniqueRepair | null;
  techniqueShapeSuggestion: TechniqueShapeSuggestion | null;
  showSocratic: boolean;
  showMistakesLogged: boolean;
}) {
  const prescribed = useInterventionPrescription(question.topicIds[0] ?? question.subjectId);
  const plan = prescribed ? prescribed.prescription.steps.slice(0, 4) : [];
  const step = choosePracticeNextStep({
    techniqueRepair,
    prescription: prescribed ? { headline: prescribed.prescription.headline, topicTitle: prescribed.topicTitle, firstStep: plan[0] } : null,
    fallback: nextAction,
  });
  // The guiding-question panel may call the opted-in AI as soon as it
  // mounts, so it is mounted only once the student opens "More help".
  const [moreOpen, setMoreOpen] = useState(false);
  const aos = [...new Set(
    question.parts
      .filter((p) => marked.some((m) => m.partId === p.id && m.missedPoints.length))
      .map((p) => p.aos?.[0])
      .filter((ao): ao is NonNullable<typeof ao> => Boolean(ao)),
  )];
  // The plan steps not already offered as the primary button.
  const otherPlanSteps = step.kind === "prescription" ? plan.slice(1) : plan;
  const answerShowed = step.kind === "none" ? null : nextAction;
  const fixList = question.kind !== "mcq" && actions.length > 0;
  const fixHeadline = !fixList && remediation.headline ? remediation.headline : null;

  return (
    <>
      <section
        className="rounded-[8px] border border-accent bg-accentsoft px-3 py-2.5"
        aria-labelledby={`next-step-${question.id}`}
        data-testid="practice-next-step"
        data-step-kind={step.kind}
      >
        <h3 id={`next-step-${question.id}`} className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Your next step</h3>
        <p className="text-sm font-semibold text-ink mt-0.5">{step.title}</p>
        <p className="text-xs text-ink2 mt-0.5">{step.why}</p>
        {step.note ? <p className="text-[11px] text-ink3 mt-1">{step.note}</p> : null}
        {step.kind === "technique" ? (
          <div data-testid="technique-repair">
            <ButtonLink href={step.href} size="sm" variant="primary" className="mt-2">{step.cta}</ButtonLink>
          </div>
        ) : step.kind === "prescription" ? (
          <ButtonLink
            href={step.href}
            size="sm"
            variant="primary"
            className="mt-2"
            onClick={() => captureProductEvent("intervention.started", { kind: step.stepKind })}
          >
            {step.cta}
          </ButtonLink>
        ) : null}
      </section>

      <details
        className="rounded-[8px] border border-line"
        data-testid="practice-more-help"
        onToggle={(event) => setMoreOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 text-sm text-ink2">
          More help with this answer
        </summary>
        <div className="space-y-4 px-3 pb-3">
          {answerShowed || uncertainCause ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What this answer showed</p>
              {answerShowed ? <p className="text-xs text-ink2 mt-1"><span className="font-medium text-ink">{answerShowed.label}</span> {answerShowed.why}</p> : null}
              {uncertainCause ? (
                <p className="text-xs text-ink2 mt-1">
                  <span className="font-medium text-ink">Possible cause, not certain: </span>
                  {uncertainCause}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Mounted only when opened, so an opted-in AI call is never made for a closed panel. */}
          {showSocratic && moreOpen ? <SocraticExaminerPanel question={question} marked={marked} answers={answers ?? {}} /> : null}

          {fixList ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">How to fix it</p>
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
            </div>
          ) : fixHeadline ? (
            <div className="card card-2 p-3 bg-surface2">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="review">Remediation</Pill>
                <span className="text-xs text-ink2">{fixHeadline.misconception}</span>
              </div>
              <p className="text-sm text-ink mt-2">{fixHeadline.action}</p>
              <p className="text-[11px] text-ink3 mt-1.5">Evidence: {fixHeadline.evidence}</p>
              {fixHeadline.targetKeyPoint ? <p className="text-[11px] text-ink3 mt-1">Restudy: {fixHeadline.targetKeyPoint}</p> : null}
            </div>
          ) : null}

          {techniqueShapeSuggestion ? (
            <div data-testid="technique-shape-suggestion">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Optional response-shape practice</p>
              <p className="text-xs text-ink2 mt-1">{techniqueShapeSuggestion.why}</p>
              <p className="text-[11px] text-ink3 mt-1">A fictional writing exercise, not a diagnosis, mark or proof of improvement.</p>
              <ButtonLink href={techniqueShapeSuggestion.href} size="sm" className="mt-2">{techniqueShapeSuggestion.title}</ButtonLink>
            </div>
          ) : null}

          {prescribed && otherPlanSteps.length ? (
            <div aria-label="Your repair plan">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
                {step.kind === "prescription" ? "Then, in your repair plan" : `Repair plan for ${prescribed.topicTitle}`}
              </p>
              <ol className="mt-1.5 space-y-1.5" aria-label="Repair steps">
                {otherPlanSteps.map((item) => (
                  <li key={item.kind} className="text-xs text-ink2">
                    <Link href={item.href} className="font-medium text-ink underline inline-flex min-h-11 items-center">{INTERVENTION_STEP_LABEL[item.kind]}</Link>
                    {" — "}
                    {item.why}
                    {item.countsAsProof ? "" : " (practice, not proof)"}
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-ink3 mt-1.5">
                Help never counts as proof. Only an unaided answer on a new question — at least 3 days
                on, where reviewed questions exist — counts. {prescribed.prescription.totalMinutes} minutes for the whole plan
                {prescribed.row.daysToExam !== null ? ` · exam in ${prescribed.row.daysToExam} days` : ""}.
              </p>
            </div>
          ) : null}

          {aos.length ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Assessment objectives missed">
              {aos.map((ao) => <Pill key={ao} tone="danger">{ao}</Pill>)}
              <Pill>Lvl {question.difficulty}</Pill>
            </div>
          ) : null}

          {showMistakesLogged ? (
            <p className="text-[11px] text-ink3">
              The dropped marks have been logged as mistakes — with AO, command word and timing — and turned into cards that will reappear until you can answer them. See <span className="font-semibold">Progress</span> for expected marks per hour.
            </p>
          ) : null}
        </div>
      </details>
    </>
  );
}
