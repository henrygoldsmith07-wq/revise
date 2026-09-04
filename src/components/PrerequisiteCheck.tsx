"use client";

import { diagnosisSentence, type PrerequisiteDiagnosis } from "@/domain/prerequisite-diagnosis";
import { ButtonLink, Panel, Pill } from "./ui";

// ---------------------------------------------------------------------------
// Prerequisite check — the banner that appears when a student keeps missing a
// topic whose real weakness sits upstream. Shown only when the verdict points
// away from the topic itself (prereq-first / prereq-unmeasured): if the topic
// itself is the problem, more of it is the right medicine and nothing is said.
// The copy comes from the pure domain, so it can never drift from the rules.
// ---------------------------------------------------------------------------

export function PrerequisiteCheck({
  diagnosis,
  targetTitle,
  prereq,
}: {
  diagnosis: PrerequisiteDiagnosis;
  targetTitle: string;
  /** The recommended upstream topic (present for prereq-first/unmeasured). */
  prereq: { id: string; title: string } | null;
}) {
  const verdict = diagnosis.verdict;
  if (!diagnosis.failing || !verdict || verdict.kind === "topic-itself") return null;
  if (!prereq) return null;

  const sentence = diagnosisSentence({
    diagnosis,
    targetTitle,
    prereqTitle: prereq.title,
  });
  if (!sentence) return null;

  const tone = verdict.kind === "prereq-first" ? "review" : undefined;

  return (
    <Panel className={tone === "review" ? "border-l-4 border-l-review" : "border-l-4 border-l-accent"}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={tone === "review" ? "review" : "accent"}>Prerequisite check</Pill>
        <span className="text-xs text-ink3">
          Repeated misses on {targetTitle} — the cause may be earlier in the chain
        </span>
      </div>
      <p className="text-sm text-ink mt-2">{sentence}</p>
      <div className="mt-3">
        <ButtonLink
          href={`/practice?topic=${encodeURIComponent(prereq.id)}`}
          variant="primary"
          className="inline-block"
        >
          {verdict.kind === "prereq-first" ? `Fix ${prereq.title} first` : `Establish ${prereq.title} first`}
        </ButtonLink>
      </div>
    </Panel>
  );
}
