"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { nextGradeTarget } from "@/domain/grades";
import { QUESTION_DIFFICULTY_MIN_SAMPLES } from "@/domain/knowledge-tracing";
import type { QuestionDiscriminationBand } from "@/domain/types";
import { useStore } from "@/state/store";
import { Button, ButtonLink, Panel, Pill, ProgressBar, SectionHeading, StatTile } from "./ui";

// The assessment view — every panel answers a concrete question a
// student would ask about an exam, not about the app.

function EmptyHint({ children }: { children: string }) {
  return <p className="text-xs text-ink3">{children}</p>;
}

export function NextGradeView() {
  const store = useStore();
  const rows = store.predictions
    .map((prediction) => {
      const subject = getSubject(prediction.subjectId);
      return subject ? { subject, prediction, target: nextGradeTarget(subject, prediction) } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <Panel>
      <SectionHeading
        title="What Gets Me to the Next Grade?"
        hint="A boundary gap, then the topics with enough modelled headroom to close it. Treat the route as a ranked plan, not a promise."
      />
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map(({ subject, prediction, target }) => {
            const first = target.route[0];
            const firstTopic = first ? getTopic(first.topicId) : undefined;
            const confidence = Math.round(prediction.confidence * 100);
            return (
              <li key={prediction.subjectId} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{subject.name}</p>
                    <p className="text-xs text-ink3 mt-0.5">
                      Predicted {prediction.grade} at {prediction.percent}% · confidence {confidence}%
                    </p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums shrink-0">
                    {target.nextGrade ? `→ ${target.nextGrade.grade}` : "Highest"}
                  </p>
                </div>

                {target.nextGrade ? (
                  <>
                    <div className="mt-3">
                      <ProgressBar
                        value={prediction.percent / target.nextGrade.percent}
                        label={`Progress to ${target.nextGrade.grade}`}
                      />
                    </div>
                    <p className="text-xs text-ink2 mt-2">
                      {prediction.percent}% now · {target.nextGrade.percent}% needed for {target.nextGrade.grade}. Need{" "}
                      <span className="font-semibold">+{target.gapPercent} percentage points</span>. The ranked route models
                      +{target.modeledGainPercent}pp from the topics below.
                    </p>
                    {target.route.length ? (
                      <ul className="mt-3 space-y-2">
                        {target.route.slice(0, 3).map((route, index) => (
                          <li key={route.topicId} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-ink2 truncate">
                                {index === 0 ? "Start with " : "Then "}
                                {getTopic(route.topicId)?.title ?? route.topicId}
                              </p>
                              <p className="text-[11px] text-ink3">
                                Up to +{route.potentialPercent}pp headroom
                              </p>
                            </div>
                            <span className="text-xs text-accent font-semibold tabular-nums shrink-0">
                              +{route.contributionPercent}pp
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-ink3 mt-3">
                        No topic has enough measured headroom yet. Add marked timed work to replace this estimate with a
                        firmer route.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-line">
                      <p className="text-[11px] text-ink3">
                        {confidence < 45
                          ? "Low confidence — add marked questions before treating the target as reliable."
                          : "Keep checking the gap after each marked set."}
                      </p>
                      <ButtonLink href={first ? `/practice?topic=${encodeURIComponent(first.topicId)}` : "/practice"} size="sm">
                        {firstTopic ? `Practise ${firstTopic.title}` : "Practise a timed set"}
                      </ButtonLink>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-ink2">
                      Already at the highest predicted boundary. Protect it with timed papers and mistake retests.
                    </p>
                    <ButtonLink href="/practice" size="sm">
                      Practise a timed set
                    </ButtonLink>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyHint>Pick a subject and complete marked work to see a grade target.</EmptyHint>
      )}
    </Panel>
  );
}

export function ExpectedMarksCard() {
  const store = useStore();
  const insight = store.assessment;
  if (!insight || !insight.expectedMarksPerHour.length) {
    return (
      <Panel>
        <SectionHeading
          title="Expected exam marks per study hour"
          hint="The headline metric. Answer a few exam questions and the numbers appear here."
        />
        <EmptyHint>Do a set of marked questions in each subject — every dropped mark teaches the engine where an hour of work converts fastest.</EmptyHint>
      </Panel>
    );
  }
  const top = insight.expectedMarksPerHour.slice(0, 6);
  const max = Math.max(0.5, ...top.map((r) => r.value));
  return (
    <Panel>
      <SectionHeading
        title="Expected exam marks per study hour"
        hint="If you spend the next hour on one topic, how many exam marks does the model think it buys? Ranked, not averaged."
      />
      <ul className="space-y-2.5">
        {top.map((row) => {
          const topic = getTopic(row.topicId);
          const subject = topic ? getSubject(topic.subjectId) : null;
          return (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-sm text-ink truncate hover:underline">
                    {topic?.title ?? row.topicId}
                  </Link>
                  <span className="text-[11px] text-ink3 shrink-0">{subject?.name}</span>
                </div>
                <div className="mt-1.5 max-w-sm">
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full bar-anim" style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-accent shrink-0">+{row.value.toFixed(1)}</span>
              <ButtonLink href={`/practice?topic=${encodeURIComponent(row.topicId)}`} size="sm">
                Fix
              </ButtonLink>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-ink3 mt-3">
        Built from your real dropped marks and current mastery. A topic at 40% with 6 lost marks converts faster than one at 85% with one slip.
      </p>
    </Panel>
  );
}

export function MarksLostByCause() {
  const insight = useStore().assessment;
  if (!insight) return null;
  const byCategory = [
    ...Object.entries(insight.byMisconception).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)),
    ...Object.entries(insight.byCommand).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 2),
  ];
  const total = Object.values(insight.byMisconception).reduce((a, v) => a + (v as number), 0) +
    Object.values(insight.byCommand).reduce((a, v) => a + (v as number), 0);
  if (!total) return null;
  // Show misconception + command breakdown in one card so the student sees both without two panels.
  const misconRows = Object.entries(insight.byMisconception).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number));
  const commandRows = Object.entries(insight.byCommand).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number));
  void byCategory;
  return (
    <Panel>
      <SectionHeading title="Marks lost by cause" hint="Command words, misconception types, and timing." />
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Misconception</p>
          {misconRows.length ? (
            <ul className="space-y-1.5">
              {misconRows.slice(0, 6).map(([tag, marks]) => (
                <li key={tag} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2">{tag}</span>
                  <span className="tabular-nums text-danger font-semibold">{marks as number} marks</span>
                </li>
              ))}
            </ul>
          ) : <EmptyHint>Not enough classified mistakes yet.</EmptyHint>}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Command word</p>
          {commandRows.length ? (
            <ul className="space-y-1.5">
              {commandRows.slice(0, 6).map(([word, marks]) => (
                <li key={word} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2">{word}</span>
                  <span className="tabular-nums text-review font-semibold">{marks as number} marks</span>
                </li>
              ))}
            </ul>
          ) : <EmptyHint>Answer a question with a verb-led prompt to populate this.</EmptyHint>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-line">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">By assessment objective</p>
        <div className="flex flex-wrap gap-1.5">
          {(["AO1", "AO2", "AO3"] as const).map((ao) => (
            <Pill key={ao} tone={(insight.marksLostByAo[ao] ?? 0) > 0 ? "danger" : "neutral"}>
              {ao}: {(insight.marksLostByAo[ao] ?? 0)} marks
            </Pill>
          ))}
        </div>
      </div>
      {/* timing */}
      <div className="mt-3">
        <TimingBreakdown />
      </div>
    </Panel>
  );
}

function accuracyLabel(accuracy: number | null): string {
  return accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`;
}

export function CalculationMasteryCard() {
  const store = useStore();
  const report = store.calculationMastery;
  const tone = report.status === "secure" ? "success" : report.status === "developing" ? "review" : "neutral";
  const statusLabel = report.status === "secure" ? "Secure" : report.status === "developing" ? "Developing" : "Needs evidence";
  const topics = report.byTopic.slice(0, 6);
  const errorPatterns = report.errorPatterns.slice(0, 5);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <SectionHeading title="Calculation mastery" hint="Marks-weighted performance on calculation questions only." />
        <Pill tone={tone}>{statusLabel}</Pill>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatTile label="Accuracy" value={accuracyLabel(report.accuracy)} sub={`${report.attempts} question${report.attempts === 1 ? "" : "s"}`} tone={report.status === "secure" ? "success" : report.status === "developing" ? "review" : undefined} />
        <StatTile label="Marks" value={`${report.marksAwarded}/${report.marksAvailable}`} sub="calculation marks" />
        <StatTile label="Recent" value={accuracyLabel(report.recent.accuracy)} sub={report.trend == null ? "latest window" : `${report.trend >= 0 ? "+" : ""}${Math.round(report.trend * 100)} pp`} tone={report.trend != null && report.trend < 0 ? "danger" : report.trend != null && report.trend > 0 ? "success" : undefined} />
        <StatTile label="Threshold" value={`${report.minimumAttempts}`} sub="questions for reliability" />
      </div>
      <ProgressBar
        value={report.accuracy ?? 0}
        label={report.accuracy == null ? "No calculation evidence yet" : "Overall calculation accuracy"}
        tone={report.status === "secure" ? "success" : report.status === "developing" ? "review" : "accent"}
      />
      <p className="text-xs text-ink2 mt-3">{report.nextAction}</p>

      {(report.calculator.attempts || report.noCalculator.attempts) ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Calculator context</p>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="accent">Allowed: {accuracyLabel(report.calculator.accuracy)} · n={report.calculator.attempts}</Pill>
            <Pill>Not allowed: {accuracyLabel(report.noCalculator.accuracy)} · n={report.noCalculator.attempts}</Pill>
          </div>
        </div>
      ) : null}

      {topics.length ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">By topic</p>
          <ul className="space-y-2">
            {topics.map((row) => (
              <li key={row.topicId}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-ink2 truncate hover:underline">
                    {getTopic(row.topicId)?.title ?? row.topicId}
                  </Link>
                  <span className="text-ink3 tabular-nums shrink-0">{accuracyLabel(row.accuracy)} · n={row.attempts}</span>
                </div>
                {row.accuracy != null ? <ProgressBar value={row.accuracy} tone={row.status === "secure" ? "success" : "review"} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {errorPatterns.length ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Calculation errors</p>
          <div className="flex flex-wrap gap-1.5">
            {errorPatterns.map((pattern) => (
              <Pill key={pattern.key} tone="danger">{pattern.label} · {pattern.marksLost}m</Pill>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

const TECHNIQUE_DRIVER_LABELS: Record<string, string> = {
  "exam-technique": "exam technique",
  "knowledge-gap": "knowledge gap",
  mixed: "mixed signal",
  rushing: "rushing",
  "time-management": "time management",
};

export function TechniqueVsKnowledgeCard() {
  const insight = useStore().assessment;
  const split = insight?.techniqueVsKnowledge;
  if (!split) return null;

  const knowledgePercent = Math.round(split.knowledgeShare * 100);
  const techniquePercent = Math.round(split.techniqueShare * 100);
  const techniqueLead = split.techniqueShare > split.knowledgeShare;
  const actionHref = techniqueLead ? "/papers" : "/review?mode=mistakes";
  const actionLabel = techniqueLead ? "Practise timed papers" : "Review knowledge gaps";

  return (
    <Panel>
      <SectionHeading
        title="Exam technique vs knowledge"
        hint="Separates marks lost through missing understanding from marks lost under exam conditions."
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <StatTile
          label="Knowledge gaps"
          value={`${knowledgePercent}%`}
          sub={`${split.knowledgeLost} marks lost`}
          tone={knowledgePercent >= techniquePercent ? "danger" : undefined}
        />
        <StatTile
          label="Exam technique"
          value={`${techniquePercent}%`}
          sub={`${split.techniqueLost} marks lost`}
          tone={techniquePercent > knowledgePercent ? "review" : undefined}
        />
      </div>
      <div
        className="mt-4"
        role="img"
        aria-label={`Lost marks split: ${knowledgePercent}% knowledge gaps and ${techniquePercent}% exam technique`}
      >
        <div className="flex h-2 overflow-hidden rounded-full bg-surface2">
          {knowledgePercent ? <div className="h-full bg-danger" style={{ width: `${knowledgePercent}%` }} /> : null}
          {techniquePercent ? <div className="h-full bg-review" style={{ width: `${techniquePercent}%` }} /> : null}
        </div>
        <div className="flex justify-between gap-3 mt-1 text-[11px] text-ink3">
          <span>Knowledge {knowledgePercent}%</span>
          <span>Technique {techniquePercent}%</span>
        </div>
      </div>
      <p className="text-xs text-ink2 mt-3">{split.narrative}</p>
      {split.drivers.length ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {split.drivers.map((driver) => (
            <Pill
              key={driver}
              tone={driver === "knowledge-gap" ? "danger" : driver === "exam-technique" || driver === "rushing" ? "review" : "neutral"}
            >
              {TECHNIQUE_DRIVER_LABELS[driver] ?? driver}
            </Pill>
          ))}
        </div>
      ) : null}
      <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink3">
          {split.reliable ? "Reliable split from at least eight marked mistakes." : "Early signal — mark more questions to make this split reliable."}
        </p>
        <Link href={actionHref}>
          <Button size="sm">{actionLabel}</Button>
        </Link>
      </div>
    </Panel>
  );
}

export function RecallMasteryCard() {
  const store = useStore();
  const rows = store.recallMastery.filter((row) => row.cardsTotal > 0);
  if (!rows.length) {
    return (
      <Panel>
        <SectionHeading
          title="Recall mastery"
          hint="A recall-only view of memory strength, separate from exam-question performance."
        />
        <EmptyHint>Review a few flashcards to start measuring what you can retrieve from memory.</EmptyHint>
      </Panel>
    );
  }

  const totalCards = rows.reduce((sum, row) => sum + row.cardsTotal, 0);
  const weighted = (selector: (row: typeof rows[number]) => number) =>
    rows.reduce((sum, row) => sum + selector(row) * row.cardsTotal, 0) / totalCards;
  const overall = weighted((row) => row.mastery);
  const currentRetention = weighted((row) => row.currentRetention);
  const reviews = rows.reduce((sum, row) => sum + row.reviews, 0);
  const recalled = rows.reduce((sum, row) => sum + row.recalled, 0);
  const trueRetention = reviews ? recalled / reviews : null;
  const due = rows.reduce((sum, row) => sum + row.cardsDue, 0);
  const weakest = [...rows].sort((a, b) => a.mastery - b.mastery).slice(0, 6);
  const masteryTone = overall >= 0.8 ? "success" : overall >= 0.55 ? "review" : "danger";

  return (
    <Panel>
      <SectionHeading
        title="Recall mastery"
        hint="Memory strength from card stability and current retrievability — exam marks are deliberately excluded."
        action={
          <Link href="/review">
            <Button size="sm">Review cards</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Recall mastery" value={`${Math.round(overall * 100)}%`} sub={`${totalCards} cards`} tone={masteryTone} />
        <StatTile label="Current retention" value={`${Math.round(currentRetention * 100)}%`} sub="FSRS estimate now" tone={currentRetention < 0.8 ? "review" : "success"} />
        <StatTile label="Observed recall" value={trueRetention == null ? "—" : `${Math.round(trueRetention * 100)}%`} sub={`${reviews} reviews`} tone={trueRetention != null && trueRetention < 0.8 ? "danger" : undefined} />
        <StatTile label="Due cards" value={due} sub={due ? "retrieval practice waiting" : "Nothing due"} tone={due ? "review" : "success"} />
      </div>
      <div className="mt-4">
        <ProgressBar value={overall} label="Recall mastery across studied cards" tone={masteryTone} />
      </div>
      <div className="mt-4 pt-3 border-t border-line">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Topics needing retrieval</p>
        <ul className="space-y-2">
          {weakest.map((row) => (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/review?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                  {getTopic(row.topicId)?.title ?? row.topicId}
                </Link>
                <ProgressBar value={row.mastery} tone={row.mastery < 0.55 ? "danger" : "review"} />
              </div>
              <span className="text-xs tabular-nums text-ink3 shrink-0">
                {Math.round(row.mastery * 100)}%{row.cardsDue ? ` · ${row.cardsDue} due` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-ink3 mt-3">
        Observed recall counts every grade except “again”; the mastery score remains model-based so a thin review history cannot overstate certainty.
      </p>
    </Panel>
  );
}

export function ApplicationMasteryCard() {
  const store = useStore();
  const rows = store.applicationMastery.filter((row) => row.attempts > 0);
  if (!rows.length) {
    return (
      <Panel>
        <SectionHeading
          title="Application mastery"
          hint="How well you apply knowledge in marked exam questions, separate from flashcard recall."
        />
        <EmptyHint>Answer a few marked exam questions to measure application rather than memory alone.</EmptyHint>
      </Panel>
    );
  }

  const marksAvailable = rows.reduce((sum, row) => sum + row.marksAvailable, 0);
  const marksAwarded = rows.reduce((sum, row) => sum + row.marksAwarded, 0);
  const overall = marksAvailable ? marksAwarded / marksAvailable : 0;
  const recentRows = rows.filter((row) => row.recentAccuracy != null);
  const recentAccuracy = recentRows.length
    ? recentRows.reduce((sum, row) => sum + (row.recentAccuracy ?? 0) * row.marksAvailable, 0) /
      recentRows.reduce((sum, row) => sum + row.marksAvailable, 0)
    : null;
  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const reliable = rows.filter((row) => row.evidence === "reliable").length;
  const weakest = [...rows].sort((a, b) => a.mastery - b.mastery).slice(0, 6);
  const masteryTone = overall >= 0.8 ? "success" : overall >= 0.55 ? "review" : "danger";

  return (
    <Panel>
      <SectionHeading
        title="Application mastery"
        hint="Mark-weighted performance on practice and paper questions — active-recall attempts and provisional marks are excluded."
        action={
          <Link href="/practice">
            <Button size="sm">Practise questions</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Application mastery" value={`${Math.round(overall * 100)}%`} sub={`${Math.round(marksAwarded * 10) / 10}/${Math.round(marksAvailable * 10) / 10} marks`} tone={masteryTone} />
        <StatTile label="Recent accuracy" value={recentAccuracy == null ? "—" : `${Math.round(recentAccuracy * 100)}%`} sub="last five topic attempts" tone={recentAccuracy != null && recentAccuracy < overall ? "review" : "success"} />
        <StatTile label="Topic attempts" value={attempts} sub="marked application evidence" />
        <StatTile label="Reliable topics" value={`${reliable}/${rows.length}`} sub="10+ eligible attempts" tone={reliable === rows.length ? "success" : "review"} />
      </div>
      <div className="mt-4">
        <ProgressBar value={overall} label="Application mastery across marked work" tone={masteryTone} />
      </div>
      <div className="mt-4 pt-3 border-t border-line">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Topics needing application practice</p>
        <ul className="space-y-2">
          {weakest.map((row) => (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                  {getTopic(row.topicId)?.title ?? row.topicId}
                </Link>
                <ProgressBar value={row.mastery} tone={row.mastery < 0.55 ? "danger" : "review"} />
              </div>
              <span className="text-xs tabular-nums text-ink3 shrink-0">
                {Math.round(row.mastery * 100)}% · {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-ink3 mt-3">
        Application evidence is mark-weighted. A topic becomes reliable after ten eligible attempts; use the recent figure to spot a change in form.
      </p>
    </Panel>
  );
}

export function MasteryUncertaintyCard() {
  const store = useStore();
  const rows = store.masteryUncertainty;
  if (!rows.length) return null;

  const uncertain = rows.filter((row) => row.needsMoreEvidence);
  const high = rows.filter((row) => row.uncertainty === "high");
  const widest = rows.slice(0, 6);

  return (
    <Panel>
      <SectionHeading
        title="Mastery uncertainty"
        hint="Shows where the mastery estimate is still wide, so a high score is not mistaken for certainty."
        action={
          <Link href="/practice">
            <Button size="sm">Collect evidence</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Need more evidence" value={uncertain.length} sub="below 8 weighted trials" tone={uncertain.length ? "review" : "success"} />
        <StatTile label="High uncertainty" value={high.length} sub="widest estimates" tone={high.length ? "danger" : "success"} />
        <StatTile label="Measured topics" value={rows.length - uncertain.length} sub={`of ${rows.length}`} tone="success" />
      </div>
      <ul className="mt-4 pt-3 border-t border-line space-y-2">
        {widest.map((row) => {
          const topic = getTopic(row.topicId);
          const title = topic?.title ?? row.topicId;
          const uncertaintyTone = row.uncertainty === "high" ? "danger" : row.uncertainty === "medium" ? "review" : "success";
          const lower = Math.round(row.lower * 100);
          const upper = Math.round(row.upper * 100);
          const rangeWidth = Math.max(2, upper - lower);
          return (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                  {title}
                </Link>
                <div
                  className="relative mt-1.5 h-1.5 rounded-full bg-surface2"
                  role="img"
                  aria-label={`${title}: mastery range ${lower} to ${upper} percent`}
                >
                  <div className="absolute h-full rounded-full bg-review" style={{ left: `${lower}%`, width: `${rangeWidth}%` }} />
                  <div className="absolute top-[-2px] h-2.5 w-0.5 bg-ink" style={{ left: `${row.mastery * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Pill tone={uncertaintyTone}>{lower}–{upper}%</Pill>
                <span className="text-[11px] text-ink3">{row.needsMoreEvidence ? "more evidence" : `${row.evidence} trials`}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-ink3 mt-3">
        The band is a conservative 95% estimate; practice narrows it only as evidence accumulates.
      </p>
    </Panel>
  );
}

export function RecurringMisconceptions() {
  const store = useStore();
  const rows = store.recurringMisconceptions;
  if (!rows.length) {
    return (
      <Panel>
        <SectionHeading
          title="Recurring misconceptions"
          hint="Specific wrong beliefs you keep losing marks on, drawn from the misconception library."
        />
        <EmptyHint>Answer some questions — matched misconceptions appear here with their explanations.</EmptyHint>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionHeading
        title="Recurring misconceptions"
        hint="The specific wrong beliefs that cost you the most marks, linked to their full explanation."
      />
      <ul className="card divide-y divide-line">
        {rows.slice(0, 5).map(({ entry, count, marksLost }) => {
          const subject = getSubject(entry.subjectId);
          const topic = getTopic(entry.topicIds[0] ?? "");
          return (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/library?topic=${encodeURIComponent(entry.topicIds[0] ?? "")}&misconception=${encodeURIComponent(entry.id)}`}
                  className="text-sm font-semibold text-ink hover:underline"
                >
                  {entry.statement}
                </Link>
                <Pill tone="danger">{marksLost} marks</Pill>
              </div>
              <p className="text-[11px] text-ink3 mt-1">
                {subject?.name ?? entry.subjectId}
                {topic ? ` · ${topic.title}` : ""}
                {` · ${count}×`}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function TimingBreakdown() {
  const store = useStore();
  const byTiming: Record<string, number> = { ok: 0, rushed: 0, slow: 0, unknown: 0 };
  for (const m of store.mistakes.filter((x) => !x.resolved)) byTiming[m.timing ?? "unknown"] = (byTiming[m.timing ?? "unknown"] ?? 0) + m.marksLost;
  const total = (byTiming.rushed ?? 0) + (byTiming.slow ?? 0) + (byTiming.ok ?? 0);
  if (!total) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mr-1">Timing</span>
      <Pill tone={byTiming.rushed ? "danger" : "neutral"}>Rushed {byTiming.rushed}m</Pill>
      <Pill tone={byTiming.slow ? "review" : "neutral"}>Slow {byTiming.slow}m</Pill>
      <Pill>On time {byTiming.ok}m</Pill>
    </div>
  );
}

export function DifficultyAndSubtopics() {
  const store = useStore();
  const insight = store.assessment;
  const questionTraces = store.questionTraces;
  const calibration = store.difficultyCalibration;
  const weakRepeated = insight?.repeatedWeakSubtopics ?? [];
  const difficultyRows = calibration.levels;
  const driftedQuestions = questionTraces
    .filter((row) => row.reliable && row.gap !== 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 4);
  const questionById = new Map(store.questions.map((question) => [question.id, question]));
  const calibrationStatus = calibration.status;
  const hasDifficulty = calibration.totalAttempts > 0;
  const hasRepeated = weakRepeated.length > 0;

  if (!hasDifficulty && !hasRepeated) return null;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <SectionHeading title="Difficulty calibration" hint="Observed challenge compared with each question's authored level." />
          <Pill tone={calibrationStatus === "aligned" ? "success" : calibrationStatus === "drifting" ? "review" : "neutral"}>
            {calibrationStatus === "aligned" ? "Aligned" : calibrationStatus === "drifting" ? "Drifting" : "Needs evidence"}
          </Pill>
        </div>
        {hasDifficulty ? (
          <>
            <ul className="space-y-1.5">
            {difficultyRows.map((row) => {
              return (
                <li key={row.level} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-ink3">Level {row.level}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-review bar-anim rounded-full" style={{ width: `${Math.round((row.empiricalDifficulty / 5) * 100)}%` }} />
                  </div>
                  <span className="tabular-nums w-20 text-right text-ink2">
                    {row.empiricalDifficulty.toFixed(1)}/5
                  </span>
                  <span className="tabular-nums w-16 text-right text-ink3">n={row.attempts}</span>
                  <span className={row.gap > 0 ? "tabular-nums w-12 text-right text-danger" : row.gap < 0 ? "tabular-nums w-12 text-right text-success" : "tabular-nums w-12 text-right text-ink3"}>
                    {row.gap > 0 ? "+" : ""}{row.gap.toFixed(1)}
                  </span>
                </li>
              );
            })}
            </ul>
            <p className="text-[11px] text-ink3 mt-3">
              {QUESTION_DIFFICULTY_MIN_SAMPLES} attempts are needed before an item can move away from its authored level; sparse evidence stays at the authored prior.
            </p>
            {driftedQuestions.length ? (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">Largest item shifts</p>
                <ul className="space-y-1">
                  {driftedQuestions.map((row) => (
                    <li key={row.questionId} className="flex justify-between gap-2 text-xs">
                      <span className="text-ink2 truncate">{questionById.get(row.questionId)?.stem ?? row.questionId}</span>
                      <span className={row.gap > 0 ? "text-danger tabular-nums shrink-0" : "text-success tabular-nums shrink-0"}>
                        {row.intrinsicDifficulty} → {row.empiricalDifficulty.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : <EmptyHint>Answer a few questions across difficulties.</EmptyHint>}
      </Panel>
      <Panel>
        <SectionHeading title="Repeated weak subtopics" hint="Topics that cost marks again and again — not a one-off slip." />
        {hasRepeated ? (
          <ul className="space-y-1">
            {weakRepeated.slice(0, 8).map((id) => {
              const t = getTopic(id);
              return (
                <li key={id} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink truncate">{t?.title ?? id}</span>
                  <ButtonLink href={`/practice?topic=${encodeURIComponent(id)}`} size="sm" className="shrink-0">
                    Practise
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        ) : <EmptyHint>No topic has cost you marks three times while still weak. That is a good sign.</EmptyHint>}
        {insight?.marksLostByTopic.length ? (
          <div className="mt-3 pt-3 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">Marks lost by topic</p>
            <ul className="space-y-1">
              {insight.marksLostByTopic.slice(0, 6).map((row) => (
                <li key={row.topicId} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2 truncate">{getTopic(row.topicId)?.title ?? row.topicId}</span>
                  <span className="tabular-nums shrink-0 text-danger">{row.lost} lost · {row.recoverable} recoverable</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function discriminationTone(band: QuestionDiscriminationBand): "neutral" | "success" | "review" | "danger" | "accent" {
  if (band === "strong") return "success";
  if (band === "acceptable") return "accent";
  if (band === "weak") return "review";
  if (band === "reverse") return "danger";
  return "neutral";
}

function discriminationLabel(band: QuestionDiscriminationBand): string {
  if (band === "insufficient-data") return "Insufficient data";
  if (band === "no-variance") return "No variance";
  return band[0].toUpperCase() + band.slice(1);
}

export function QuestionDiscriminationCard() {
  const store = useStore();
  const rows = (store.assessment?.questionDiscrimination ?? [])
    .filter((measurement) => measurement.sampleSize > 0)
    .slice(0, 8);

  return (
    <Panel>
      <SectionHeading
        title="Question discrimination"
        hint="Whether each question separates stronger from weaker learners."
      />
      {!rows.length ? (
        <EmptyHint>Complete marked questions to start measuring the question bank.</EmptyHint>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((measurement) => {
              const question = store.questions.find((candidate) => candidate.id === measurement.questionId);
              const label = question?.paperQuestionNumber
                ? `Question ${question.paperQuestionNumber}`
                : question?.stem?.replace(/\s+/g, " ").slice(0, 62) || measurement.questionId;
              return (
                <li key={measurement.questionId} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-ink" title={question?.stem}>{label}</span>
                  <span className="tabular-nums text-ink2 shrink-0">
                    r={measurement.discrimination == null ? "—" : measurement.discrimination.toFixed(2)}
                  </span>
                  <Pill tone={discriminationTone(measurement.band)}>{discriminationLabel(measurement.band)}</Pill>
                  <span className="tabular-nums text-ink3 shrink-0">n={measurement.usableSampleSize}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-ink3 mt-3">
            Positive r is useful separation; negative r flags a question for review. Results need five usable learners and exclude the target question from derived ability.
          </p>
        </>
      )}
    </Panel>
  );
}

export function PaperSimulationCard() {
  const store = useStore();
  const subjects = store.settings.subjectIds.map((id) => {
    const s = getSubject(id);
    return s ? { id: s.id, name: s.name, papers: s.papers } : null;
  }).filter(Boolean) as Array<{ id: string; name: string; papers: { id: string; name: string; durationMinutes: number }[] }>;
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [paperSpecId, setPaperSpecId] = useState(subjects[0]?.papers[0]?.id ?? "");
  const subject = subjects.find((s) => s.id === subjectId);
  const questions = store.questions.filter((q) => q.subjectId === subjectId);
  const simulation = useMemo(() => {
    if (!subjectId || !paperSpecId || !questions.length) return null;
    // Simulate against a full-paper-sized slice (up to 40 marks worth)
    const slice: string[] = [];
    let marks = 0;
    for (const q of questions) {
      slice.push(q.id);
      marks += q.totalMarks;
      if (marks >= 40) break;
    }
    return store.previewPaper(subjectId, paperSpecId, slice);
  }, [store, subjectId, paperSpecId, questions]);

  if (!subjects.length) return null;

  return (
    <Panel>
      <SectionHeading title="Exam-paper simulation" hint="Predicted marks for a timed paper, with calibration for your optimism." />
      <div className="flex flex-wrap gap-2 mb-3">
        <select aria-label="Subject for exam-paper simulation" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); const s = subjects.find((x) => x.id === e.target.value); setPaperSpecId(s?.papers[0]?.id ?? ""); }} className="field field-inline text-sm">
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Paper for exam-paper simulation" value={paperSpecId} onChange={(e) => setPaperSpecId(e.target.value)} className="field field-inline text-sm">
          {(subject?.papers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.durationMinutes}m</option>)}
        </select>
      </div>
      {!simulation ? <EmptyHint>Need at least one question in this subject to simulate a paper.</EmptyHint> : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatTile label="Predicted" value={`${simulation.predictedMarks}/${simulation.totalMarks}`} sub={`Grade ${simulation.predictedGrade}`} tone={simulation.predictedMarks / Math.max(1, simulation.totalMarks) >= 0.7 ? "success" : "review"} />
            <StatTile label="Time allowed" value={`${simulation.timeMinutes}m`} sub={subject?.papers.find((p) => p.id === paperSpecId)?.name ?? ""} />
            <StatTile label="Recoverable" value={`+${simulation.recoverableMarks}`} sub="with 1h per weak topic" tone="success" />
          </div>
          <div>
            <ProgressBar value={simulation.totalMarks ? simulation.predictedMarks / simulation.totalMarks : 0} tone={simulation.predictedMarks / Math.max(1, simulation.totalMarks) >= 0.7 ? "success" : "review"} />
          </div>
          {simulation.marksByTopic.length ? (
            <ul className="mt-3 space-y-1">
              {simulation.marksByTopic.slice(0, 8).map((row) => (
                <li key={row.topicId} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2 truncate">{getTopic(row.topicId)?.title ?? row.topicId}</span>
                  <span className="tabular-nums shrink-0">{row.expected}/{row.available} expected</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] text-ink3 mt-3">
            Uses your current topic mastery, re-weighted by calibration (see below). <Link href="/papers" className="underline">Sit a real paper</Link> to tighten the prediction.
          </p>
        </>
      )}
    </Panel>
  );
}

export function CalibrationCard() {
  const store = useStore();
  const rows = [...store.calibrations.values()].filter((c) => c.sampleSize > 0);
  return (
    <Panel>
      <SectionHeading title="Actual vs predicted — calibration" hint="How honest the predictions are. Needs three sat papers per subject." />
      {!rows.length ? (
        <EmptyHint>Sit three papers in the same subject and the calibration appears here — bias, slope and mean error are then shown per subject.</EmptyHint>
      ) : (
        <ul className="divide-y divide-line card overflow-hidden">
          {rows.map((c) => {
            const subject = getSubject(c.subjectId);
            return (
              <li key={c.subjectId} className="px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-ink min-w-[7rem]">{subject?.name ?? c.subjectId}</span>
                <Pill>n={c.sampleSize}</Pill>
                <span className="text-ink2">bias {c.bias >= 0 ? "+" : ""}{c.bias.toFixed(1)}</span>
                <span className="text-ink2">slope {c.slope.toFixed(2)}</span>
                <span className="text-ink3">MAE {c.mae.toFixed(1)}</span>
                {Math.abs(c.bias) < 1 && Math.abs(c.slope - 1) < 0.15 ? <Pill tone="success">Well calibrated</Pill> : <Pill tone="review">Drifting</Pill>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
