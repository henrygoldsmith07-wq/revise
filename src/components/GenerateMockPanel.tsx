"use client";

import { useMemo, useState } from "react";
import { topicsFor } from "@/domain/curriculum";
import {
  MOCK_DEFAULT_FOCUS,
  buildGeneratedPaper,
  generateMockPaper,
} from "@/domain/mock-generator";
import { forecastNextPaper } from "@/domain/topic-forecast";
import { useStoreFields } from "@/state/store";
import { Button, Field, Panel, Pill, SectionHeading } from "@/components/ui";

// Bespoke mock generation: assemble a fresh paper from the question bank,
// aimed at the topics this student is losing marks on. Generation is pure
// domain; the panel only chooses the target size and focus, persists the
// result as a normal paper, and hands it to the exam-conditions runner.

const TARGET_OPTIONS = [30, 50, 80] as const;

export function GenerateMockPanel({ subjectId, onStart }: { subjectId: string; onStart: (paperId: string) => void }) {
  const store = useStoreFields("addPaper", "attempts", "mastery", "mistakes", "papers", "questions", "userId");
  const [targetMarks, setTargetMarks] = useState<number>(50);
  const [focus, setFocus] = useState<number>(MOCK_DEFAULT_FOCUS);
  const [followForecast, setFollowForecast] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // The same forecast the Next-paper forecast panel shows; when the student
  // asks for a predicted-paper drill, the mark budget leans toward it.
  const forecast = useMemo(
    () =>
      forecastNextPaper({
        subjectId,
        papers: store.papers,
        questions: store.questions,
        topics: topicsFor(subjectId),
        mastery: store.mastery,
        attempts: store.attempts,
        mistakes: store.mistakes,
        now: new Date(),
      }),
    [subjectId, store.papers, store.questions, store.attempts, store.mastery, store.mistakes],
  );
  const forecastShares = useMemo(
    // The observed mix of the papers in hand is the operational "what the
    // next paper samples" signal; fall back to the blended expectation for
    // topics no held paper has covered yet.
    () => new Map(forecast.rows.map((row) => [row.topicId, row.sampleShare ?? row.expectedShare] as const)),
    [forecast],
  );

  const bankCount = useMemo(
    () => store.questions.filter((question) => question.subjectId === subjectId).length,
    [store.questions, subjectId],
  );

  const preview = useMemo(
    () =>
      generateMockPaper({
        subjectId,
        questions: store.questions,
        topics: topicsFor(subjectId),
        mastery: store.mastery,
        attempts: store.attempts,
        mistakes: store.mistakes,
        targetMarks,
        focus,
        forecastShares: followForecast ? forecastShares : undefined,
        forecastWeight: followForecast ? 0.75 : 0,
        now: new Date(),
      }),
    [subjectId, store.questions, store.attempts, store.mastery, store.mistakes, targetMarks, focus, followForecast, forecastShares],
  );

  async function saveAndStart() {
    if (!preview || saving || !preview.questionIds.length) return;
    setSaving(true);
    try {
      const paper = buildGeneratedPaper(preview, store.userId);
      await store.addPaper(paper);
      onStart(paper.id);
    } finally {
      setSaving(false);
    }
  }

  const topics = preview?.topics ?? [];

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Generate a bespoke mock"
        hint="Builds a fresh paper from the question bank, aimed at the topics measured evidence says are costing you marks."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Target size" hint={`${bankCount} questions in this subject's bank.`}>
          <select
            className="field text-sm"
            value={targetMarks}
            onChange={(event) => setTargetMarks(Number(event.target.value))}
            aria-label="Mock target size in marks"
          >
            {TARGET_OPTIONS.map((marks) => (
              <option key={marks} value={marks}>
                ≈{marks} marks
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weakness focus" hint={`${Math.round(focus * 100)}% of marks follow measured weakness; the rest spreads evenly.`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={focus}
            onChange={(event) => setFocus(Number(event.target.value))}
            aria-label="Weakness focus"
            className="w-full accent-[var(--accent)]"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-xs text-ink2">
        <input
          type="checkbox"
          checked={followForecast}
          onChange={(event) => setFollowForecast(event.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>
          Follow the predicted mix — lean the mock toward the topics the next
          paper is forecast to sample{" "}
          {forecast.papersCount ? `(${forecast.papersCount} paper${forecast.papersCount === 1 ? "" : "s"} in hand` : "(spec weighting only"}
          {forecast.provisional ? ", provisional" : ""}).
        </span>
      </label>

      {preview ? (
        <div className="space-y-2" role="status">
          <p className="text-sm text-ink2">{preview.headline}</p>
          <p className="text-xs text-ink3">
            ≈{preview.estimatedMinutes} minutes
            {preview.averageDifficulty != null ? ` · average difficulty ${preview.averageDifficulty}/5` : ""}
            {` · focus ${Math.round(preview.focus * 100)}%`}
            {followForecast ? " · following the predicted mix" : ""}
          </p>
          {topics.length ? (
            <ul className="space-y-1">
              {topics.slice(0, 5).map((allocation) => (
                <li key={allocation.topicId} className="text-xs text-ink2 flex items-center gap-1.5 flex-wrap">
                  <Pill tone={allocation.evidence === "none" ? undefined : allocation.weakness >= 0.5 ? "danger" : "success"}>
                    {allocation.marks} mark{allocation.marks === 1 ? "" : "s"}
                  </Pill>
                  <span className="font-medium text-ink">{allocation.title}</span>
                  <span className="text-ink3">— {allocation.rationale}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {preview.notes.length ? (
            <ul className="space-y-0.5 text-[11px] text-ink3 list-disc pl-4">
              {preview.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={!preview || !preview.questionIds.length || saving}
          onClick={() => void saveAndStart()}
        >
          {saving ? "Saving…" : `Save & sit ${preview?.questionIds.length ? `${preview.questionIds.length}-question` : ""} mock`}
        </Button>
      </div>
    </Panel>
  );
}
