"use client";

// What a marked answer that lost marks shows before its next step:
//
//   1. WhyMarksWent: a reading of the answer the student actually wrote
//      (src/domain/answer-gap.ts): blank, the opposite of the scheme, a
//      division the wrong way round, a power of ten out, points left unsaid.
//      It says how sure it is and never changes a mark.
//   2. RepairTeaching: the teaching written for the specification point the
//      lost part tests (src/content/teaching), in place: the idea, the usual
//      trap, a worked example of a different problem revealed a step at a
//      time, and one check question. It used to be a link to a nine-minute
//      lesson below a re-quiz; the repair is now where the mistake is.
//
// Authored teaching is not teacher-reviewed and says so. Reading it, and
// answering its check, is recorded nowhere: it is not evidence, and the
// answer above is already marked.

import Link from "next/link";
import { useState } from "react";
import type { AnswerGapRepair, PartAnswerGap } from "@/domain/answer-gap";
import { teachingLinesFor } from "@/domain/hints";
import type { RelearnCheckpoint } from "@/domain/practice-next-step";
import type { Question } from "@/domain/types";
import type { CheckpointTeaching } from "@/content/teaching/types";
import { RichText } from "./RichText";
import { CreditedIcon, ICON_SIZE, MissedIcon } from "./icons";
import { Button, cx } from "./ui";

export function WhyMarksWent({ gaps, multiPart }: { gaps: readonly PartAnswerGap[]; multiPart: boolean }) {
  const lead = gaps[0];
  if (!lead) return null;
  const others = gaps.slice(1).filter((row) => row.gap.certainty !== "unsure" || lead.gap.certainty === "unsure").slice(0, 2);
  return (
    <section className="rounded-lg border border-line bg-surface2 px-3 py-2.5" aria-label="Why the marks went" data-testid="why-marks-went" data-gap-kind={lead.gap.kind} data-gap-certainty={lead.gap.certainty}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink3">Why the marks went</h3>
      <GapLines row={lead} showLabel={multiPart} lead />
      {others.map((row) => <GapLines key={row.partId} row={row} showLabel={multiPart} />)}
      {lead.gap.certainty === "unsure" ? (
        <p className="mt-1.5 text-[11px] text-ink3">This is a reading of what you wrote, not a certainty. The mark above does not depend on it.</p>
      ) : null}
    </section>
  );
}

function GapLines({ row, showLabel, lead = false }: { row: PartAnswerGap; showLabel: boolean; lead?: boolean }) {
  return (
    <div className={lead ? "mt-1" : "mt-2 border-t border-line pt-2"}>
      <p className="text-sm font-medium text-ink">
        {showLabel && row.label ? <span className="text-ink3">{row.label} </span> : null}
        {row.gap.happened}
      </p>
      <p className="mt-0.5 text-sm text-ink2">{row.gap.fix}</p>
    </div>
  );
}

type Section = "idea" | "example" | "check";

/** Which piece opens first for this kind of gap; the rest stay one tap away. */
function openingSection(repair: AnswerGapRepair | null): Section | null {
  if (repair === "learn") return "idea";
  if (repair === "example") return "example";
  // A slip or an unstated point is not a gap in the idea: offer it, closed.
  return null;
}

export function RepairTeaching({ question, relearn, repair, teaching }: { question: Question; relearn: RelearnCheckpoint; repair: AnswerGapRepair | null; teaching: CheckpointTeaching }) {
  const [open, setOpen] = useState<Section | null>(() => openingSection(repair));
  // The lines that bear on this question first; the rest of the point one tap away.
  const [allLines, setAllLines] = useState(false);
  const focused = teachingLinesFor(question, teaching.explain);
  const lines = allLines ? teaching.explain : focused;
  const hidden = teaching.explain.length - focused.length;
  const toggle = (section: Section) => setOpen((current) => (current === section ? null : section));
  const heading = repair === "learn" ? "Learn it here" : repair === "example" ? "See it done" : "Refresh the idea";
  return (
    <section className="rounded-lg border border-accent bg-accentsoft" aria-label={`${heading}: ${relearn.ref}`} data-testid="repair-teaching" data-repair={repair ?? "none"}>
      <div className="px-3 pt-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink3">{heading}</h3>
        <p className="mt-0.5 text-sm font-semibold text-ink">{relearn.ref} · {relearn.topicTitle}</p>
      </div>

      <Fold title="The idea" hint={focused.length === 1 ? "one short point" : `${focused.length} short points`} open={open === "idea"} onToggle={() => toggle("idea")}>
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line}><RichText className="text-sm text-ink">{line}</RichText></li>
          ))}
        </ul>
        {hidden > 0 && !allLines ? (
          <button type="button" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-ink2 underline underline-offset-2 hover:text-ink" onClick={() => setAllLines(true)}>
            Show the rest of this point ({hidden} more)
          </button>
        ) : null}
        {teaching.trap ? (
          <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">The usual trap</p>
            <p className="flex gap-1.5 text-sm text-ink2"><MissedIcon size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0 text-danger" /><span>{teaching.trap.wrong}</span></p>
            <p className="flex gap-1.5 text-sm text-ink"><CreditedIcon size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0 text-success" /><span>{teaching.trap.right}</span></p>
          </div>
        ) : null}
      </Fold>

      <Fold title="A similar problem, worked" hint="different numbers, same method" open={open === "example"} onToggle={() => toggle("example")}>
        <WorkedSteps worked={teaching.worked} />
      </Fold>

      <Fold title="Check you have it" hint="one question, not recorded" open={open === "check"} onToggle={() => toggle("check")}>
        <QuickCheck check={teaching.check} />
      </Fold>

      <p className="px-3 pb-2.5 pt-1 text-[11px] text-ink3">
        Written by Revise and not yet teacher-reviewed; if it disagrees with your notes, go with your notes.{" "}
        <Link href={relearn.href} className="font-medium text-ink2 underline underline-offset-2 hover:text-ink">Open the full lesson</Link>
      </p>
    </section>
  );
}

function Fold({ title, hint, open, onToggle, children }: { title: string; hint: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink3">
          {open ? null : hint}
          <svg viewBox="0 0 12 12" aria-hidden="true" className={cx("h-3 w-3 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </span>
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}

/** The example a step at a time, so each step can be predicted before it is shown. */
function WorkedSteps({ worked }: { worked: CheckpointTeaching["worked"] }) {
  const [shown, setShown] = useState(1);
  const done = shown > worked.steps.length;
  return (
    <div className="space-y-2">
      <RichText className="text-sm text-ink">{worked.prompt}</RichText>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink2" aria-live="polite">
        {worked.steps.slice(0, shown).map((step) => (
          <li key={step}><RichText className="text-sm text-ink2">{step}</RichText></li>
        ))}
      </ol>
      {done ? (
        <div className="flex gap-1.5 text-sm">
          <span className="shrink-0 font-semibold text-ink">Answer:</span>
          <RichText className="min-w-0 flex-1 text-sm text-ink">{worked.answer}</RichText>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setShown((count) => count + 1)}>
            {shown >= worked.steps.length ? "Show the answer" : "Show the next step"}
          </Button>
          <span className="text-[11px] text-ink3">Say what comes next before you look.</span>
        </div>
      )}
    </div>
  );
}

function QuickCheck({ check }: { check: CheckpointTeaching["check"] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <div className="space-y-2">
      <RichText className="text-sm text-ink">{check.question}</RichText>
      <ul className="space-y-1.5" role="radiogroup" aria-label="Choose one answer">
        {check.options.map((option, index) => {
          const correct = answered && index === check.correctIndex;
          const wrongPick = answered && index === picked && index !== check.correctIndex;
          return (
            <li key={option}>
              <button
                type="button"
                role="radio"
                aria-checked={picked === index}
                disabled={answered}
                onClick={() => setPicked(index)}
                className={cx(
                  "card flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                  correct && "border-success bg-successsoft",
                  wrongPick && "border-danger bg-dangersoft",
                )}
              >
                <span className="mt-0.5 text-xs font-semibold text-ink3">{String.fromCharCode(65 + index)}</span>
                <span className="sr-only">{correct ? "Correct answer. " : wrongPick ? "Your incorrect pick. " : ""}</span>
                <RichText className="min-w-0 flex-1 text-sm">{option}</RichText>
              </button>
            </li>
          );
        })}
      </ul>
      {answered ? (
        <div role="status">
          <p className="text-sm font-medium text-ink">{picked === check.correctIndex ? "Right." : "Not this time."}</p>
          <RichText className="text-sm text-ink2">{check.explanation}</RichText>
          <p className="mt-1 text-[11px] text-ink3">Not recorded. The question in your next step is the one that counts.</p>
        </div>
      ) : null}
    </div>
  );
}
