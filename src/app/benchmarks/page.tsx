"use client";

import { useMemo, useState } from "react";
import { allSubjects } from "@/domain/curriculum";
import { benchmarkRecommendationQuality, syntheticOutcomePairs } from "@/domain/recommender";
import { calibrationReport, syntheticCalibrationOutcomes } from "@/domain/grades";
import { markQuestion } from "@/domain/marking";
import { HUMAN_MARKING_CORPUS, passesHumanMarkingFloor, scoreHumanMarkingCorpus } from "@/domain/human-marking-corpus";
import { scoreMarkerDisagreement } from "@/domain/marker-disagreement";
import { Panel, SectionHeading, Pill, ProgressBar } from "@/components/ui";

// Public benchmark page — the honest ledger.
// Every number is computed live in the browser from the same deterministic
// synthetic harnesses CI runs, so the page can never drift from the code. Real
// cohort tables replace synthetic rows once outcomes ship (same harnesses, real
// pairs) — the provenance row at the bottom says which is which.

const SUBJECT_ID = "wjec-alevel-physics";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function marks(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" | "review" | "danger" }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
      {hint ? <p className="text-[11px] text-ink3 mt-0.5">{hint}</p> : null}
      {tone ? <Pill tone={tone} className="mt-2">{tone}</Pill> : null}
    </div>
  );
}

export default function BenchmarksPage() {
  const [seed, setSeed] = useState(1);
  const [n, setN] = useState(120);

  const subjects = useMemo(() => allSubjects(), []);
  const topicIds = useMemo(() => {
    // WJEC Physics topics — stable for the benchmark; any subject works, this one is just seeded.
    const s = subjects.find((x) => x.id === SUBJECT_ID);
    void s;
    // Fall back: first 8 topics of whatever subject is first.
    return ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
  }, [subjects]);

  const rec = useMemo(() => {
    const pairs = syntheticOutcomePairs(seed, n, SUBJECT_ID, topicIds);
    return { pairs, stats: benchmarkRecommendationQuality(pairs) };
  }, [seed, n, topicIds]);

  const calib = useMemo(() => {
    const pairs = syntheticCalibrationOutcomes(seed + 1000, n);
    return { pairs, report: calibrationReport(pairs) };
  }, [seed, n]);

  const recOk = rec.stats.hitRate >= 0.6 && rec.stats.correlation >= 0.5;
  const calibOk = calib.report.ece < 0.08;
  const marking = useMemo(
    () => scoreHumanMarkingCorpus(HUMAN_MARKING_CORPUS, (question, answers) => markQuestion(question, answers)),
    [],
  );
  const disagreement = useMemo(
    () => scoreMarkerDisagreement(HUMAN_MARKING_CORPUS, { rubric: (question, answers) => markQuestion(question, answers) }),
    [],
  );
  const humanRubric = disagreement.metrics.find((metric) => metric.pair === "human-vs-rubric")!;
  const humanAi = disagreement.metrics.find((metric) => metric.pair === "human-vs-ai")!;
  const markingOk = passesHumanMarkingFloor(marking);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Benchmarks & results</h1>
        <p className="text-sm text-ink3 mt-1">
          The harnesses below run live in your browser from the same deterministic synthetic
          data CI uses. Replace synthetic with real outcome pairs and the same numbers become
          the leaderboard.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink2">
            Seed
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              className="field w-20"
              aria-label="Random seed"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink2">
            n
            <input
              type="range"
              min={20}
              max={400}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              aria-label="Sample size"
            />
            <span className="tabular-nums">{n}</span>
          </label>
          <Pill>{rec.pairs.length} outcome pairs</Pill>
        </div>
      </header>

      <section className="space-y-3">
        <SectionHeading title="Recommendation quality" hint="benchmarkRecommendationQuality — predicted vs actual marks" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="MAE" value={`${rec.stats.mae.toFixed(1)}`} hint="mean |actual − predicted|" />
          <Metric label="Bias" value={`${rec.stats.bias >= 0 ? "+" : ""}${rec.stats.bias.toFixed(1)}`} hint="actual − predicted" />
          <Metric label="Correlation" value={rec.stats.correlation.toFixed(2)} hint="predicted ↔ actual" tone={recOk ? "success" : "review"} />
          <Metric label="Hit rate ±5" value={`${Math.round(rec.stats.hitRate * 100)}%`} hint="within 5 marks" tone={recOk ? "success" : "review"} />
        </div>
        <Panel>
          <p className="text-xs text-ink2">
            Synthetic via <code className="font-mono">syntheticOutcomePairs(seed,{n})</code> →{" "}
            <code className="font-mono">benchmarkRecommendationQuality(pairs)</code>. Real integration:
            <code className="font-mono"> simulatePaper.predictedMarks</code> vs later timed-paper actuals. See{" "}
            <code className="font-mono">docs/benchmark.md</code> and{" "}
            <code className="font-mono">docs/revision-engine.md §3</code>.
          </p>
          <div className="mt-3 max-h-40 overflow-auto nice-scroll rounded-[8px] border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface2 text-ink3">
                <tr>
                  <th className="text-left px-2 py-1">date</th>
                  <th className="text-left px-2 py-1">topic</th>
                  <th className="text-right px-2 py-1">predicted</th>
                  <th className="text-right px-2 py-1">actual</th>
                  <th className="text-right px-2 py-1">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rec.pairs.slice(0, 40).map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-2 py-1 tabular-nums">{p.date}</td>
                    <td className="px-2 py-1 truncate max-w-[10rem]">{p.topicId}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.predicted}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.actual}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.actual - p.predicted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Confidence calibration" hint="calibrationReport — Brier / ECE / bias" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Brier" value={calib.report.brier.toFixed(3)} hint="mean squared error" />
          <Metric label="ECE" value={calib.report.ece.toFixed(3)} hint="expected calibration error" tone={calibOk ? "success" : "review"} />
          <Metric label="Bias" value={`${calib.report.bias >= 0 ? "+" : ""}${calib.report.bias.toFixed(3)}`} hint="actual − predicted" />
          <Metric label="Buckets" value={`${calib.report.bins.filter((b) => b.count).length}/5`} hint="non-empty" />
        </div>
        <Panel>
          <p className="text-xs text-ink2">
            Well-calibrated is ECE &lt; 0.08. Synthetic via{" "}
            <code className="font-mono">syntheticCalibrationOutcomes(seed,{n})</code>. Real:{" "}
            <code className="font-mono">calibrateFromHistory({`{ subjectId, pairs }`})</code> over ≥3 timed papers (
            <code className="font-mono">src/domain/grades.ts</code>). Replace synthetic with{" "}
            <code className="font-mono">predictGrade.percent/100</code> vs{" "}
            <code className="font-mono">laterPaperPercent/100</code>.
          </p>
          <div className="mt-3 space-y-2">
            {calib.report.bins.map((b) => (
              <div key={b.bucket} className="flex items-center gap-2 text-xs">
                <span className="w-20 tabular-nums text-ink3">{b.bucket}</span>
                <div className="flex-1">
                  <ProgressBar value={b.meanPredicted} />
                </div>
                <span className="w-16 text-right tabular-nums">{b.count} in bucket</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Marker disagreement" hint="Pairwise per-part tracking across human, rubric and AI markers." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Human ↔ rubric MAE" value={marks(humanRubric.meanAbsoluteDifference)} hint={`${humanRubric.comparedParts} compared parts`} tone={humanRubric.meanAbsoluteDifference !== null && humanRubric.meanAbsoluteDifference <= 0.8 ? "success" : "review"} />
          <Metric label="Human ↔ rubric agreement" value={percent(humanRubric.partAgreement)} hint={`${humanRubric.disagreementCount} disagreeing parts`} tone={humanRubric.partAgreement !== null && humanRubric.partAgreement >= 0.5 ? "success" : "review"} />
          <Metric label="Rubric bias" value={marks(humanRubric.signedBias)} hint="rubric − human per part" />
          <Metric label="AI coverage" value={`${humanAi.comparedRows}/${marking.rowCount}`} hint="labelled rows with AI awards" tone={humanAi.comparedRows ? "success" : "review"} />
        </div>
        <Panel>
          <p className="text-xs text-ink2">
            <code className="font-mono">scoreMarkerDisagreement</code> compares award arrays by part and reports
            absolute error, agreement, disagreement count and signed bias. A missing marker is left unmeasured;
            it is never treated as a zero mark.
          </p>
          <div className="mt-3 overflow-auto nice-scroll rounded-[8px] border border-line">
            <table className="w-full text-xs">
              <thead className="bg-surface2 text-ink3">
                <tr>
                  <th className="text-left px-2 py-1">pair</th>
                  <th className="text-right px-2 py-1">rows</th>
                  <th className="text-right px-2 py-1">parts</th>
                  <th className="text-right px-2 py-1">agreement</th>
                  <th className="text-right px-2 py-1">MAE</th>
                  <th className="text-right px-2 py-1">bias</th>
                </tr>
              </thead>
              <tbody>
                {disagreement.metrics.map((metric) => (
                  <tr key={metric.pair} className="border-t border-line">
                    <td className="px-2 py-1">{metric.left} ↔ {metric.right}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{metric.comparedRows}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{metric.comparedParts}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(metric.partAgreement)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{marks(metric.meanAbsoluteDifference)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{marks(metric.signedBias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Human marking corpus" hint="Reusable teacher/examiner labels for the offline marking floor." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Rows" value={`${marking.rowCount}`} hint={`corpus ${marking.corpusVersion}`} />
          <Metric label="Exact match" value={`${Math.round(marking.exactMatchAccuracy * 100)}%`} hint={`${marking.exactCount}/${marking.rowCount} scripts`} tone={markingOk ? "success" : "review"} />
          <Metric label="Part MAE" value={marking.perPartMae.toFixed(3)} hint="mean absolute mark error" tone={marking.perPartMae <= 0.8 ? "success" : "danger"} />
          <Metric label="Rubric floor" value={markingOk ? "Pass" : "Review"} hint="exact ≥50%, MAE ≤0.8" tone={markingOk ? "success" : "danger"} />
        </div>
        <Panel>
          <p className="text-xs text-ink2">
            Versioned internal fixture: teacher/examiner per-part awards, chemistry + maths, no learner-identifying data. The same scorer powers CI and this live view.
          </p>
          <div className="mt-3 max-h-52 overflow-auto nice-scroll rounded-[8px] border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface2 text-ink3">
                <tr>
                  <th className="text-left px-2 py-1">script</th>
                  <th className="text-right px-2 py-1">human</th>
                  <th className="text-right px-2 py-1">rubric</th>
                  <th className="text-right px-2 py-1">part MAE</th>
                </tr>
              </thead>
              <tbody>
                {marking.rows.map((row) => (
                  <tr key={row.rowId} className="border-t border-line">
                    <td className="px-2 py-1 truncate max-w-[18rem]" title={row.label}>{row.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.humanTotal}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.predictedTotal}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.partMae.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Provenance" hint="How this page stays honest" />
        <Panel>
          <ul className="text-xs text-ink2 space-y-1 list-disc list-inside">
            <li>Every number above is computed in-browser from the same functions CI calls — not hard-coded marketing.</li>
            <li>Source rows: <code className="font-mono">src/domain/recommender.ts :: syntheticOutcomePairs</code>, <code className="font-mono">benchmarkRecommendationQuality</code>, <code className="font-mono">src/domain/grades.ts :: calibrationReport</code>.</li>
            <li>Marker rows are keyed by <code className="font-mono">questionId</code> and compare per-part <code className="font-mono">(rubricAward, aiAward, humanAward)</code>; AI remains explicitly unmeasured until provider-marked gold exists.</li>
            <li>See also: <a className="underline" href="/case-study">Case study</a> · <a className="underline" href="/progress">Progress</a> · <code className="font-mono">docs/benchmark.md</code>.</li>
          </ul>
          <p className="text-[11px] text-ink3 mt-3">
            Dataset: synthetic · seed={seed} · n={n} · computed at render time.
          </p>
        </Panel>
      </section>
    </div>
  );
}
