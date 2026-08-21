"use client";

import Link from "next/link";
import { useMemo } from "react";
import { seedMisconceptions } from "@/content";
import { allTopics, getTopic } from "@/domain/curriculum";
import {
  buildMistakeRootCauseReport,
  type MistakeRootCause,
  type RootCauseConfidence,
  type RootCauseQuality,
} from "@/domain/mistake-root-cause";
import { useStore } from "@/state/store";
import { Panel, Pill, ProgressBar, SectionHeading, StatTile } from "./ui";

const QUALITY_COPY: Record<RootCauseQuality, { label: string; tone: "neutral" | "review" | "success" }> = {
  "no-data": { label: "Waiting for evidence", tone: "neutral" },
  "early-signal": { label: "Early signal", tone: "review" },
  actionable: { label: "Actionable pattern", tone: "success" },
};

const CONFIDENCE_COPY: Record<RootCauseConfidence, string> = {
  "early-signal": "early signal",
  emerging: "emerging pattern",
  established: "established pattern",
};

function sourceLabel(cause: MistakeRootCause): string {
  if (cause.source === "authored") return "authored explanation";
  if (cause.source === "answer-analysis") return "answer/working analysis";
  if (cause.source === "timing") return "timing evidence";
  return "captured mistake signal";
}

function CauseRow({ cause }: { cause: MistakeRootCause }) {
  const topicId = cause.topicIds[0];
  const topic = topicId ? getTopic(topicId) : undefined;
  const practiceHref = topicId ? `/practice?topic=${encodeURIComponent(topicId)}` : "/practice";
  const tone = cause.confidence === "established" ? "success" : cause.confidence === "emerging" ? "review" : "danger";

  return (
    <li className="rounded-xl border border-line bg-surface2/30 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{cause.label}</p>
          <p className="text-[11px] text-ink3 mt-0.5">
            {cause.marksLost} mark{cause.marksLost === 1 ? "" : "s"} across {cause.occurrences} loss{cause.occurrences === 1 ? "" : "es"}
            {cause.attemptCount ? ` · ${cause.attemptCount} marked answers` : ""}
          </p>
        </div>
        <Pill tone={tone}>{CONFIDENCE_COPY[cause.confidence]}</Pill>
      </div>

      <div className="mt-2.5">
        <ProgressBar value={cause.shareOfLostMarks} label="Share of the marks in this diagnosis" tone={tone === "danger" ? "danger" : tone} />
      </div>

      <p className="text-xs text-ink2 mt-2.5">{cause.nextStep}</p>
      {cause.evidence.length ? (
        <details className="mt-2.5 text-xs">
          <summary className="cursor-pointer text-ink3 hover:text-ink">Show evidence · {sourceLabel(cause)}</summary>
          <ul className="mt-1.5 space-y-1 pl-3 list-disc text-ink3">
            {cause.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink3">
          {topic ? `Most visible in ${topic.title}` : "Topic not available"}
        </p>
        <Link href={practiceHref} className="btn btn-secondary text-xs px-2.5 py-1.5 shrink-0">
          Practise this
        </Link>
      </div>
    </li>
  );
}

export function MistakeRootCausePanel() {
  const store = useStore();
  const topics = useMemo(() => allTopics(store.settings.subjectIds), [store.settings.subjectIds]);
  const report = useMemo(
    () => buildMistakeRootCauseReport({
      mistakes: store.mistakes,
      attempts: store.attempts,
      questions: store.questions,
      topics,
      misconceptions: seedMisconceptions,
    }),
    [store.mistakes, store.attempts, store.questions, topics],
  );
  const quality = QUALITY_COPY[report.quality];
  const causes = report.rootCauses.slice(0, 3);

  return (
    <Panel>
      <SectionHeading
        title="Mistake root-cause diagnosis"
        hint="A ranked working hypothesis from your missed points, answers, timing and the authored misconception library."
        action={<Pill tone={quality.tone}>{quality.label}</Pill>}
      />

      {report.quality === "no-data" ? (
        <p className="text-sm text-ink3">
          There are no open mistakes to diagnose yet. Complete and mark an exam question — the first dropped mark
          becomes evidence for what to fix next.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <StatTile label="Marks to recover" value={report.totalMarksLost} sub={`${report.analysedMistakes} open mistakes`} tone="danger" />
            <StatTile label="Evidence base" value={report.uniqueAttempts || report.analysedMistakes} sub={report.uniqueAttempts ? "marked answers" : "logged losses"} />
          </div>
          <ul className="space-y-2.5">
            {causes.map((cause) => <CauseRow key={cause.id} cause={cause} />)}
          </ul>
          <p className="text-[11px] text-ink3 mt-3">
            Early signal means the app has a clue, not a verdict. A cause becomes actionable only when it repeats across
            marked answers.
          </p>
        </>
      )}
    </Panel>
  );
}
