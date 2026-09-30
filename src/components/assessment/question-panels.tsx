"use client";

import { getTopic } from "@/domain/curriculum";
import { QUESTION_DIFFICULTY_MIN_SAMPLES } from "@/domain/knowledge-tracing";
import type { QuestionDiscriminationBand } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import { ButtonLink, Panel, Pill, SectionHeading } from "../ui";
import { EmptyHint } from "./shared";

export function DifficultyAndSubtopics() {
  const store = useStoreFields("assessment", "difficultyCalibration", "questionTraces", "questions");
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
  const store = useStoreFields("assessment", "questions");
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
