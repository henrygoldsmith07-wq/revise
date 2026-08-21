"use client";

import Link from "next/link";
import { getTopic } from "@/domain/curriculum";
import { useStore } from "@/state/store";
import { Panel, Pill, ProgressBar, SectionHeading, StatTile } from "./ui";

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function signedPercent(value: number | null): string {
  if (value == null) return "—";
  const pct = Math.round(value * 100);
  return `${pct >= 0 ? "+" : ""}${pct}pp`;
}

export function LearningControlsCard() {
  const store = useStore();
  const confidence = store.sparseEvidenceConfidence;
  const prediction = store.predictionOutcome;
  const forgetting = store.forgettingCalibration;
  const roots = store.rootPrerequisiteRemediation.slice(0, 5);
  const adaptive = store.adaptiveDifficulty;
  const exposure = store.questionExposure;
  const overpractised = exposure.rows.filter((row) => row.status === "overpractised").slice(0, 5);
  const questionById = new Map(store.questions.map((question) => [question.id, question] as const));
  const confidenceTone = confidence.status === "confident" ? "success" : confidence.status === "mixed" ? "review" : "neutral";
  const predictionTone = prediction.status === "calibrated" ? "success" : prediction.status === "insufficient" ? "neutral" : "review";
  const forgettingTone = forgetting.verdict === "well-calibrated" ? "success" : forgetting.verdict === "insufficient-data" ? "neutral" : "review";
  const adaptiveTone = adaptive.status === "stable" ? "success" : adaptive.status === "insufficient" ? "neutral" : "review";

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <SectionHeading title="Sparse-evidence confidence" hint="Mastery intervals widen when evidence is thin or conflicting." />
          <Pill tone={confidenceTone}>{confidence.status === "confident" ? "Confident" : confidence.status === "mixed" ? "Mixed" : "Needs evidence"}</Pill>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Confidence" value={percent(confidence.confidence)} sub="interval-derived" />
          <StatTile label="Reliable" value={confidence.reliableTopics} sub={`of ${confidence.totalTopics} topics`} />
          <StatTile label="Wide" value={confidence.highUncertainty} sub="high uncertainty" tone={confidence.highUncertainty ? "review" : undefined} />
        </div>
        <p className="text-xs text-ink2 mt-3">{confidence.narrative}</p>
        {confidence.intervals.filter((row) => row.uncertainty === "high").slice(0, 4).map((row) => (
          <div key={row.topicId} className="mt-2 flex items-center justify-between gap-2 text-xs">
            <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="truncate text-ink2 hover:underline">
              {getTopic(row.topicId)?.title ?? row.topicId}
            </Link>
            <span className="shrink-0 text-ink3 tabular-nums">{percent(row.lower)}–{percent(row.upper)}</span>
          </div>
        ))}
      </Panel>

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <SectionHeading title="Prediction vs outcome" hint="Out-of-sample paper predictions compared with actual marks." />
          <Pill tone={predictionTone}>{prediction.status === "calibrated" ? "Calibrated" : prediction.status === "insufficient" ? "Needs evidence" : prediction.status === "underpredicting" ? "Pessimistic" : "Optimistic"}</Pill>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Papers" value={prediction.n} sub="measured outcomes" />
          <StatTile label="Actual" value={percent(prediction.actualRate)} sub={`${prediction.actualMarks}/${prediction.marksAvailable} marks`} />
          <StatTile label="Bias" value={signedPercent(prediction.bias)} sub={prediction.mae == null ? "MAE —" : `MAE ${Math.round(prediction.mae * 100)}pp`} tone={prediction.bias != null && Math.abs(prediction.bias) > 0.05 ? "review" : undefined} />
        </div>
        <p className="text-xs text-ink2 mt-3">{prediction.narrative}</p>
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Calibration curves</p>
          {prediction.curve.length ? (
            <ul className="space-y-1.5">
              {prediction.curve.map((bin) => (
                <li key={bin.index} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-ink3">{bin.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${Math.round(bin.actual * 100)}%` }} />
                  </div>
                  <span className="w-20 text-right tabular-nums text-ink2">{percent(bin.actual)} · n={bin.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-ink3">Complete timed papers to populate predicted and observed bands.</p>}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Prerequisite knowledge graph" hint="Repair a weak foundation before repeatedly drilling a blocked dependent topic." />
        {roots.length ? (
          <ul className="space-y-2">
            {roots.map((row) => (
              <li key={row.rootTopicId} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <Link href={`/practice?topic=${encodeURIComponent(row.rootTopicId)}`} className="font-semibold text-ink2 hover:underline">
                    {getTopic(row.rootTopicId)?.title ?? row.rootTopicId}
                  </Link>
                  <p className="text-ink3 mt-0.5">{row.reason}</p>
                </div>
                <span className="shrink-0 tabular-nums text-danger">{Math.round(row.rootMastery * 100)}%</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink3">No weak topic is currently blocked by a weak prerequisite.</p>}
      </Panel>

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <SectionHeading title="Forgetting calibration" hint="Measured recall against the forgetting curve used by the scheduler." />
          <Pill tone={forgettingTone}>{forgetting.verdict === "well-calibrated" ? "Calibrated" : forgetting.verdict === "insufficient-data" ? "Needs evidence" : forgetting.verdict === "under-confident" ? "Under-confident" : "Over-confident"}</Pill>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Reviews" value={forgetting.n} sub="measured recalls" />
          <StatTile label="ECE" value={`${Math.round(forgetting.ece * 100)}pp`} sub="curve error" />
          <StatTile label="Bias" value={signedPercent(forgetting.bias)} sub="actual − predicted" />
        </div>
        {forgetting.buckets.length ? (
          <ul className="mt-3 space-y-1.5">
            {forgetting.buckets.slice(0, 5).map((bucket) => (
              <li key={bucket.label} className="flex justify-between gap-2 text-xs">
                <span className="text-ink3">{bucket.label}</span>
                <span className="tabular-nums text-ink2">{percent(bucket.actualRecall)} actual · {signedPercent(bucket.gap)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink3 mt-3">Twenty reviews are needed before the forgetting curve can be judged.</p>}
      </Panel>

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <SectionHeading title="Adaptive difficulty calibration" hint="Moves secure items up and struggling items down one level." />
          <Pill tone={adaptiveTone}>{adaptive.status === "adapting" ? "Adapting" : adaptive.status === "stable" ? "Stable" : "Needs evidence"}</Pill>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Stretch" value={adaptive.stretch} sub="harder next" tone={adaptive.stretch ? "success" : undefined} />
          <StatTile label="Consolidate" value={adaptive.consolidate} sub="easier next" tone={adaptive.consolidate ? "review" : undefined} />
          <StatTile label="Hold" value={adaptive.hold} sub="same level" />
        </div>
        <p className="text-xs text-ink2 mt-3">{adaptive.narrative}</p>
        {adaptive.rows.filter((row) => row.action !== "hold" && row.action !== "insufficient").slice(0, 4).map((row) => (
          <div key={row.questionId} className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-ink2">{questionById.get(row.questionId)?.stem ?? row.questionId}</span>
            <Pill tone={row.action === "stretch" ? "success" : "review"}>{row.authoredDifficulty} → {row.targetDifficulty}</Pill>
          </div>
        ))}
      </Panel>

      <Panel>
        <SectionHeading title="Question exposure control" hint="Unseen questions first; secure repeats are flagged as overpractice." />
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Unseen" value={exposure.unseen} sub="surface next" tone={exposure.unseen ? "success" : undefined} />
          <StatTile label="Balanced" value={exposure.balanced} sub="normal exposure" />
          <StatTile label="Overpractice" value={exposure.overpractised} sub="4+ secure repeats" tone={exposure.overpractised ? "review" : undefined} />
        </div>
        <p className="text-xs text-ink2 mt-3">{exposure.narrative}</p>
        {overpractised.length ? (
          <ul className="mt-3 space-y-1.5">
            {overpractised.map((row) => (
              <li key={row.questionId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink2">{questionById.get(row.questionId)?.stem ?? row.questionId}</span>
                <span className="shrink-0 tabular-nums text-ink3">n={row.exposures} · {percent(row.accuracy)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
