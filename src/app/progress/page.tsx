"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { aiDiagnose } from "@/ai/client";
import { gradeCalibrationNarrative } from "@/domain/analytics";
import { getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { delayedFarTransferReport, delayedFarTransferRetests } from "@/domain/delayed-far-transfer";
import type { GradePrediction } from "@/domain/grades";
import { ACHIEVEMENTS, levelFor } from "@/domain/gamification";
import { overallProgressNarrative } from "@/domain/analytics";
import { weakTopics } from "@/domain/mastery";
import { mistakePatterns } from "@/domain/mistakes";
import { remediationForMistake } from "@/domain/remediation";
import { markEscalationReport } from "@/domain/mark-escalation";
import { dueCountByDay, todayIso } from "@/domain/scheduling";
import type { DiagnoseResponse } from "@/ai/types";
import { useStore, useSubjects } from "@/state/store";
import { RichText } from "@/components/RichText";
import { ApplicationMasteryCard, CalculationMasteryCard, CalibrationCard, DifficultyAndSubtopics, ExpectedMarksCard, MarksLostByCause, MasteryUncertaintyCard, NextGradeView, PaperSimulationCard, QuestionDiscriminationCard, RecallMasteryCard, RecurringMisconceptions, TechniqueVsKnowledgeCard } from "@/components/AssessmentPanels";
import { ResponseTimeCalibrationPanel } from "@/components/ResponseTimeCalibration";
import { RetentionMasteryPanel } from "@/components/RetentionMasteryPanel";
import { MistakeRootCausePanel } from "@/components/MistakeRootCause";
import { CoverageCard } from "@/components/CoverageCard";
import { ResumeRevisionCard } from "@/components/ResumeRevisionCard";
import { LearningControlsCard } from "@/components/LearningControlsCard";
import { Button, ButtonLink, Panel, Pill, ProgressBar, SectionHeading, SourceBadge, StatTile, cx } from "@/components/ui";

// Analytics that answer one question — where are the marks? — rather than
// showing every number the app happens to hold. Each panel ends in an action.

function confidenceTone(confidence: number): "success" | "review" {
  return confidence >= 0.72 ? "success" : "review";
}

function confidenceLabel(confidence: number): string {
  if (confidence < 0.45) return "Early estimate";
  if (confidence < 0.72) return "Developing estimate";
  return "Well supported";
}

function PredictedGradeCard({
  prediction,
  subjectName,
  markedAnswers,
  topicTitle,
}: {
  prediction: GradePrediction;
  subjectName: string;
  markedAnswers: number;
  topicTitle: (topicId: string) => string;
}) {
  const narrative = gradeCalibrationNarrative(prediction, topicTitle);
  const next = prediction.headroom[0];
  const evidenceLabel = markedAnswers === 0 ? "No marked answers yet" : `${markedAnswers} marked ${markedAnswers === 1 ? "answer" : "answers"}`;
  const trendLabel = prediction.trend === 0
    ? null
    : `${prediction.trend > 0 ? "+" : "−"}${Math.abs(prediction.trend)}pp over 30 days`;

  return (
    <Panel as="li">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{subjectName}</p>
          <p className="text-xs text-ink3 mt-0.5">Current estimate</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-semibold tabular-nums text-ink">{prediction.grade}</p>
          <p className="text-xs text-ink3 tabular-nums">{prediction.percent}%</p>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar value={prediction.percent / 100} label="Estimated performance" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-ink3">
        <Pill tone={confidenceTone(prediction.confidence)}>{confidenceLabel(prediction.confidence)}</Pill>
        <span>{evidenceLabel}</span>
        <span>Range {prediction.worstCase}–{prediction.bestCase}</span>
        {trendLabel ? <span>{trendLabel}</span> : null}
      </div>

      <p className="text-sm text-ink2 mt-3">{narrative.paragraphs[0]}</p>

      {next ? (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Next lever</p>
          <Link
            href={`/practice?topic=${encodeURIComponent(next.topicId)}`}
            className="flex items-center justify-between gap-3 mt-1 group"
          >
            <span className="text-sm text-ink group-hover:underline truncate">{topicTitle(next.topicId)}</span>
            <span className="text-xs text-ink3 tabular-nums shrink-0">up to +{next.potentialPercent}pp →</span>
          </Link>
          <p className="text-[11px] text-ink3 mt-1">Potential gain if this topic reached full mastery.</p>
        </div>
      ) : null}

      <details className="mt-3 border-t border-line pt-2.5">
        <summary className="cursor-pointer text-[11px] font-semibold text-ink3 hover:text-ink">
          How this estimate works
        </summary>
        <p className="text-xs text-ink3 leading-5 mt-2">
          It blends marked exam-question accuracy with topic coverage. Marked answers carry more weight as evidence accumulates; the range stays wider when there is less evidence or more time for your performance to change.
        </p>
      </details>
    </Panel>
  );
}

export default function ProgressPage() {
  const store = useStore();
  const subjects = useSubjects();
  const today = todayIso();
  const [diagnosis, setDiagnosis] = useState<{ data: DiagnoseResponse; source: "ai" | "fallback"; note?: string } | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const weak = useMemo(() => weakTopics(store.mastery, 8), [store.mastery]);
  const openMistakes = useMemo(
    () =>
      store.mistakes
        .filter((mistake) => !mistake.resolved)
        .slice()
        .sort((a, b) => b.marksLost - a.marksLost || b.createdAt.localeCompare(a.createdAt)),
    [store.mistakes],
  );
  const patterns = useMemo(() => mistakePatterns(openMistakes), [openMistakes]);
  const forecast = useMemo(() => dueCountByDay(store.cards, 14, today), [store.cards, today]);
  const maxDue = Math.max(1, ...forecast.map((f) => f.count));
  const level = levelFor(store.streak.xp);
  const markReview = useMemo(() => {
    const report = markEscalationReport(store.attempts);
    const pending = store.attempts
      .filter((attempt) => attempt.markEscalation?.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { report, pending };
  }, [store.attempts]);
  const farTransfer = useMemo(() => {
    const retests = delayedFarTransferRetests({ attempts: store.attempts, questions: store.questions, today });
    return { retests, report: delayedFarTransferReport(retests) };
  }, [store.attempts, store.questions, today]);

  const totals = useMemo(() => {
    const marksMax = store.attempts.reduce((a, x) => a + x.max, 0);
    return {
      reviews: store.reviewLogs.length,
      accuracy: marksMax ? store.attempts.reduce((a, x) => a + x.awarded, 0) / marksMax : 0,
      hours: Math.round(
        (store.reviewLogs.reduce((a, l) => a + l.elapsedMs, 0) +
          store.attempts.reduce((a, x) => a + x.elapsedMs, 0)) /
          3_600_000,
      ),
      mastered: store.mastery.filter((m) => m.mastery >= 0.8).length,
    };
  }, [store.reviewLogs, store.attempts, store.mastery]);

  const progressStory = useMemo(() => {
    const focusTopic =
      weak[0] ??
      store.mastery
        .filter((row) => row.cardsTotal > 0 || row.attempts > 0)
        .slice()
        .sort((a, b) => a.mastery - b.mastery)[0];
    const narrative = overallProgressNarrative({
      mastery: store.mastery,
      attempts: store.attempts,
      dueCards: store.dueCards.length,
      openMistakes: openMistakes.length,
      weakTop: focusTopic ? getTopic(focusTopic.topicId)?.title : undefined,
      now: new Date(`${today}T23:59:59.999Z`),
    });
    const href = focusTopic
      ? `/practice?topic=${encodeURIComponent(focusTopic.topicId)}`
      : narrative.cta === "Review due cards"
        ? "/review"
        : "/practice";
    return { ...narrative, href };
  }, [store.attempts, store.dueCards.length, store.mastery, today, weak, openMistakes.length]);

  async function diagnose() {
    setDiagnosing(true);
    const result = await aiDiagnose(
      weak.map((w) => w.topicId),
      store.mistakes.filter((m) => !m.resolved).slice(0, 40),
    );
    setDiagnosis({ data: result.data, source: result.source, note: result.note });
    setDiagnosing(false);
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Progress</h1>
        <p className="text-sm text-ink3 mt-0.5">Where your marks are, and where the next ones come from.</p>
      </header>

      <ResumeRevisionCard />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Cards reviewed" value={totals.reviews} sub="all time" />
        <StatTile
          label="Question accuracy"
          value={`${Math.round(totals.accuracy * 100)}%`}
          sub={`${store.attempts.length} marked answers`}
          tone={totals.accuracy >= 0.7 ? "success" : totals.accuracy >= 0.5 ? "review" : "danger"}
        />
        <StatTile label="Topics secure" value={totals.mastered} sub={`of ${store.mastery.length}`} />
        <StatTile label="Level" value={level.level} sub={`${level.into}/${level.needed} XP to next`} />
      </div>

      <section aria-labelledby="progress-story-heading">
        <Panel className="border-l-4 border-l-accent">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Progress story</p>
              <h2 id="progress-story-heading" className="text-lg font-semibold tracking-tight mt-1">
                {progressStory.headline}
              </h2>
              <div className="space-y-1.5 mt-2">
                {progressStory.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm text-ink2">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
            <ButtonLink href={progressStory.href} size="sm" className="shrink-0">
              {progressStory.cta}
            </ButtonLink>
          </div>
          {progressStory.bullets?.length ? (
            <ul className="grid sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-line">
              {progressStory.bullets.map((bullet) => (
                <li key={bullet} className="text-xs text-ink3">
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </section>

      <RetentionMasteryPanel />

      <section>
        <SectionHeading title="Mark review queue" hint="Low-confidence AI marks are held for a second-marker decision." />
        <Panel>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile
              label="Pending human review"
              value={markReview.pending.length}
              sub={markReview.pending.length ? "saved with the attempts below" : "No escalations waiting"}
              tone={markReview.pending.length ? "review" : "success"}
            />
            <StatTile label="AI marks" value={markReview.report.aiAttempts} sub={`${markReview.report.escalatedAttempts} escalated`} />
            <StatTile
              label="Escalation rate"
              value={markReview.report.escalationRate === null ? "—" : `${Math.round(markReview.report.escalationRate * 100)}%`}
              sub="of AI-marked attempts"
              tone={markReview.report.escalationRate !== null && markReview.report.escalationRate > 0 ? "review" : undefined}
            />
          </div>
          {markReview.pending.length ? (
            <ul className="mt-4 border-t border-line divide-y divide-line">
              {markReview.pending.slice(0, 5).map((attempt) => (
                <li key={attempt.id} className="py-2.5 flex items-start gap-3">
                  <Pill tone={attempt.markEscalation?.priority === "urgent" ? "danger" : "review"}>
                    {attempt.markEscalation?.priority ?? "review"}
                  </Pill>
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">
                      {store.questions.find((question) => question.id === attempt.questionId)?.stem ?? attempt.questionId}
                    </p>
                    <p className="text-[11px] text-ink3">
                      {attempt.markConfidence === undefined ? "Confidence unavailable" : `${Math.round(attempt.markConfidence * 100)}% confidence`} · {attempt.createdAt.slice(0, 10)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink3 mt-4 border-t border-line pt-3">
              AI marks below 60% confidence will appear here and remain labelled as provisional until reviewed.
            </p>
          )}
        </Panel>
      </section>

      <section>
        <SectionHeading
          title="Delayed far-transfer"
          hint="A high-scoring answer earns a different-context question seven days later — a stronger test than repeating the same prompt."
        />
        <Panel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Due now"
              value={farTransfer.report.due}
              sub={farTransfer.report.due ? "open transfer checks" : "No checks waiting"}
              tone={farTransfer.report.due ? "review" : "success"}
            />
            <StatTile label="Upcoming" value={farTransfer.report.upcoming} sub="scheduled checks" />
            <StatTile label="Completed" value={farTransfer.report.completed} sub="separate transfer evidence" />
            <StatTile
              label="Transfer pass rate"
              value={farTransfer.report.passRate === null ? "—" : `${Math.round(farTransfer.report.passRate * 100)}%`}
              sub="60% counts as a pass"
              tone={farTransfer.report.passRate === null ? undefined : farTransfer.report.passRate >= 0.6 ? "success" : "danger"}
            />
          </div>
          {farTransfer.retests.length ? (
            <ul className="mt-4 border-t border-line divide-y divide-line">
              {farTransfer.retests.slice(0, 6).map((retest) => {
                const candidate = store.questions.find((question) => question.id === retest.candidateQuestionId);
                const source = store.questions.find((question) => question.id === retest.sourceQuestionId);
                const row = (
                  <>
                    <Pill tone={retest.status === "completed" ? (retest.outcome?.passed ? "success" : "danger") : retest.status === "due" ? "review" : "accent"}>
                      {retest.status === "completed"
                        ? `${Math.round((retest.outcome?.percentage ?? 0) * 100)}%`
                        : retest.status === "due"
                          ? "due"
                          : retest.scheduledFor}
                    </Pill>
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{candidate?.stem ?? retest.candidateQuestionId}</p>
                      <p className="text-[11px] text-ink3 truncate">
                        From {source?.stem ?? retest.sourceQuestionId} · {getTopic(retest.topicIds[0] ?? "")?.title ?? retest.subjectId}
                      </p>
                    </div>
                  </>
                );
                return (
                  <li key={retest.retestId} className="py-2.5 flex items-start gap-3">
                    {retest.status === "completed" ? row : <Link href={`/practice?retest=${encodeURIComponent(retest.retestId)}`} className="flex items-start gap-3 min-w-0 flex-1">{row}</Link>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-ink3 mt-4 border-t border-line pt-3">
              Score at least 80% on a mapped question and a new-context check will appear here for seven days later.
            </p>
          )}
        </Panel>
      </section>

      <section>
        <SectionHeading
          title="Mistake → remediation → retest"
          hint="Each dropped mark has a specific next action. Retest the same point until it is secure."
        />
        {openMistakes.length ? (
          <ul className="card divide-y divide-line">
            {openMistakes.slice(0, 8).map((mistake) => {
              const question = mistake.questionId
                ? store.questions.find((candidate) => candidate.id === mistake.questionId)
                : undefined;
              const attempt = mistake.attemptId
                ? store.attempts.find((candidate) => candidate.id === mistake.attemptId)
                : undefined;
              const remediation = question
                ? remediationForMistake(mistake, question, attempt, getTopic(mistake.topicId))
                : null;
              return (
                <li key={mistake.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="danger">{mistake.category}</Pill>
                        <span className="text-[11px] text-ink3 tabular-nums">
                          {mistake.marksLost} mark(s) lost
                        </span>
                        {(mistake.retestCount ?? 0) > 0 ? (
                          <span className="text-[11px] text-ink3 tabular-nums">
                            {mistake.retestCount} retest{mistake.retestCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-ink mt-1.5">{mistake.description}</p>
                      {remediation ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-ink2">
                            <span className="font-semibold">Remediation:</span> {remediation.action}
                          </p>
                          <p className="text-[11px] text-ink3">Evidence: {remediation.evidence}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-ink3 mt-2">
                          Revisit the mark-scheme point, then retest the source question.
                        </p>
                      )}
                    </div>
                    {question ? (
                      <ButtonLink
                        href={`/practice?retest=${encodeURIComponent(mistake.id)}`}
                        size="sm"
                        variant="primary"
                        className="shrink-0"
                      >
                        Retest
                      </ButtonLink>
                    ) : (
                      <span className="text-[11px] text-ink3">Source unavailable</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Panel>
            <p className="text-sm text-ink3">
              No open mistakes. A dropped mark will appear here with its remediation and retest link.
            </p>
          </Panel>
        )}
      </section>

      <section>
        <SectionHeading
          title="Predicted grades"
          hint="A working estimate, with the evidence, range and next lever kept visible."
        />
        <ul className="grid sm:grid-cols-2 gap-3">
          {store.predictions.map((prediction) => (
            <PredictedGradeCard
              key={prediction.subjectId}
              prediction={prediction}
              subjectName={getSubject(prediction.subjectId)?.name ?? prediction.subjectId}
              markedAnswers={store.attempts.filter((attempt) => attempt.subjectId === prediction.subjectId).length}
              topicTitle={(topicId) => getTopic(topicId)?.title ?? topicId}
            />
          ))}
        </ul>
      </section>

      <NextGradeView />

      <section>
        <SectionHeading
          title="Weakest topics"
          hint="Ranked by mastery. These are where revision time converts into marks fastest."
          action={
            <Button size="sm" onClick={() => void diagnose()} disabled={diagnosing}>
              {diagnosing ? "Diagnosing…" : "Diagnose weaknesses"}
            </Button>
          }
        />
        {weak.length ? (
          <ul className="card divide-y divide-line">
            {weak.map((row) => {
              const topic = getTopic(row.topicId);
              return (
                <li key={row.topicId} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{topic?.title}</p>
                    <p className="text-[11px] text-ink3">
                      {getSubject(row.subjectId)?.name} · {row.cardsTotal} cards · {row.attempts} marked answers
                    </p>
                    <div className="mt-1.5 max-w-xs">
                      <ProgressBar value={row.mastery} tone={row.mastery < 0.4 ? "danger" : "review"} />
                    </div>
                  </div>
                  <ButtonLink href={`/practice?topic=${encodeURIComponent(row.topicId)}`} size="sm">
                    Practise
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        ) : (
          <Panel>
            <p className="text-sm text-ink3">
              Nothing is flagged as weak. That usually means there is not enough marked work yet rather than that
              everything is secure — do a set of exam questions in each subject to give the engine something to
              measure.
            </p>
          </Panel>
        )}

        {diagnosis ? (
          <Panel className="mt-3 fade-in">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-semibold">{diagnosis.data.headline}</p>
              <SourceBadge source={diagnosis.source} note={diagnosis.note} />
            </div>
            <RichText>{diagnosis.data.findings.map((f) => `- ${f}`).join("\n")}</RichText>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mt-4 mb-1.5">This week</p>
            <RichText>{diagnosis.data.actions.map((a) => `- ${a}`).join("\n")}</RichText>
          </Panel>
        ) : null}
      </section>

      <section className="grid lg:grid-cols-2 gap-5">
        <div>
          <SectionHeading title="Review forecast" hint="Cards falling due over the next fortnight." />
          <Panel>
            <div className="flex items-end gap-1 h-24">
              {forecast.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div
                    className={cx("w-full rounded-t-[3px] bar-anim", day.count ? "bg-accent" : "bg-surface2")}
                    style={{ height: `${Math.max(2, (day.count / maxDue) * 100)}%` }}
                    title={`${day.date}: ${day.count} due`}
                  />
                  <span className="text-[9px] text-ink3 tabular-nums">{day.date.slice(8)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink3 mt-3">
              Peaks are normal — FSRS clusters reviews where memory is about to decay. Clearing them daily keeps the
              peaks small.
            </p>
          </Panel>
        </div>

        <div>
          <SectionHeading title="Mistake patterns" hint="Classified from the marks you drop." />
          {patterns.length ? (
            <ul className="card divide-y divide-line">
              {patterns.map((pattern) => (
                <li key={pattern.category} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Pill tone="danger">{pattern.category}</Pill>
                    <span className="text-xs text-ink3 tabular-nums">{pattern.count} open</span>
                  </div>
                  <p className="text-xs text-ink2 mt-1.5">{pattern.insight}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Panel>
              <p className="text-sm text-ink3">
                No open mistakes. Every dropped mark you have logged has been re-answered correctly since.
              </p>
            </Panel>
          )}
        </div>
      </section>

      <section>
        <SectionHeading title="Mastery by subject" hint="Every topic in the specification." />
        <div className="space-y-4">
          {subjects.map((subject) => {
            const rows = topicsFor(subject.id);
            const byId = new Map(store.mastery.map((m) => [m.topicId, m]));
            return (
              <Panel key={subject.id}>
                <p className="text-sm font-semibold mb-3">{subject.name}</p>
                <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-2">
                  {rows.map((topic) => {
                    const mastery = byId.get(topic.id)?.mastery ?? 0;
                    return (
                      <li key={topic.id}>
                        <Link href={`/library?topic=${encodeURIComponent(topic.id)}`} className="block group">
                          <div className="flex justify-between gap-2 text-xs mb-1">
                            <span className="text-ink2 truncate group-hover:text-ink">{topic.title}</span>
                            <span className="text-ink3 tabular-nums shrink-0">{Math.round(mastery * 100)}%</span>
                          </div>
                          <ProgressBar
                            value={mastery}
                            tone={mastery >= 0.8 ? "success" : mastery >= 0.55 ? "accent" : mastery > 0 ? "review" : "danger"}
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <RecallMasteryCard />
        <ApplicationMasteryCard />
        <MasteryUncertaintyCard />
        <ExpectedMarksCard />
        <MarksLostByCause />
        <CalculationMasteryCard />
        <LearningControlsCard />
        <TechniqueVsKnowledgeCard />
        <RecurringMisconceptions />
        <MistakeRootCausePanel />
        <DifficultyAndSubtopics />
        <QuestionDiscriminationCard />
        <PaperSimulationCard />
        <CalibrationCard />
        <ResponseTimeCalibrationPanel compact />
      </section>

      <section>
        <CoverageCard />
      </section>

      <section>
        <SectionHeading title="Achievements" hint="For showing up and repairing mistakes — not for volume." />
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = store.streak.achievements.includes(achievement.id);
            return (
              <li
                key={achievement.id}
                className={cx("card p-3", !unlocked && "opacity-50")}
              >
                <p className="text-sm font-medium text-ink">{achievement.name}</p>
                <p className="text-[11px] text-ink3">{achievement.description}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
