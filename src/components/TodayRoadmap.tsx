"use client";

import { useCallback, useMemo } from "react";
import { allTopics, getSubject, unitsFor } from "@/domain/curriculum";
import { buildRoadmapLessons, type RoadmapLessonEntry } from "@/content/lessons";
import { useStore } from "@/state/store";
import { ButtonLink, Pill, ProgressBar, cx } from "@/components/ui";

/**
 * A compact learning-path preview for Today.
 *
 * The full roadmap remains on /lesson. Today only needs enough context to
 * answer three questions: how far through the path am I, what should I open
 * next, and what does each unit contain? The entries and completion predicate
 * deliberately match LessonMode so this card never invents a second progress
 * system.
 */
export default function TodayRoadmap({ preferredSubjectId }: { preferredSubjectId?: string }) {
  const { settings, lessonProgress } = useStore();
  const enrolledSubjectIds = settings.subjectIds;

  const subjectId = useMemo(() => {
    const candidates = [preferredSubjectId, settings.lastLessonSubject, ...enrolledSubjectIds];
    return (
      candidates.find(
        (candidate): candidate is string =>
          typeof candidate === "string" &&
          candidate.length > 0 &&
          enrolledSubjectIds.includes(candidate) &&
          Boolean(getSubject(candidate)),
      ) ?? ""
    );
  }, [enrolledSubjectIds, preferredSubjectId, settings.lastLessonSubject]);

  const subject = subjectId ? getSubject(subjectId) : undefined;
  const topics = useMemo(() => (subjectId ? allTopics([subjectId]) : []), [subjectId]);
  const lessons = useMemo(() => buildRoadmapLessons(topics), [topics]);
  const completed = lessonProgress.completed;

  const isEntryComplete = useCallback(
    (entry: RoadmapLessonEntry) =>
      Boolean(
        completed[entry.lesson.id] ||
          completed[`video:${entry.topic.id}`] ||
          completed[`lesson:${entry.topic.id}`],
      ),
    [completed],
  );

  const roadmapUnits = useMemo(
    () =>
      unitsFor(subjectId)
        .map((unit) => ({
          unit,
          entries: lessons
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.topic.unitId === unit.id),
        }))
        .filter((group) => group.entries.length > 0),
    [lessons, subjectId],
  );

  const doneCount = useMemo(
    () => lessons.filter((entry) => isEntryComplete(entry)).length,
    [isEntryComplete, lessons],
  );
  const firstIncomplete = useMemo(
    () => lessons.findIndex((entry) => !isEntryComplete(entry)),
    [isEntryComplete, lessons],
  );
  const resumeIndex = firstIncomplete >= 0 ? firstIncomplete : lessons.length > 0 ? 0 : -1;
  const nextEntry = resumeIndex >= 0 ? lessons[resumeIndex] : undefined;
  const nextHref = nextEntry
    ? `/lesson?subject=${encodeURIComponent(nextEntry.topic.subjectId)}&topic=${encodeURIComponent(nextEntry.topic.id)}`
    : `/lesson?subject=${encodeURIComponent(subjectId)}`;

  // A profile can briefly have no enrolled subjects while onboarding/settings
  // is being edited. Do not leave an empty card on Today in that state.
  if (!subject || !lessons.length || !roadmapUnits.length) return null;

  const roadmapComplete = firstIncomplete === -1;
  const subjectHref = `/lesson?subject=${encodeURIComponent(subjectId)}`;

  return (
    <section aria-label="Today's learning roadmap" className="card overflow-hidden">
      <header className="border-b border-line bg-surface2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink3 font-bold">Learning roadmap</p>
              <Pill tone="accent">{subject.name}</Pill>
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Keep your learning path moving</h2>
            <p className="mt-1 max-w-xl text-sm text-ink3">
              Short written checkpoints, active recall and exam checks take you from foundations to exam-ready ideas.
            </p>
          </div>
          <ButtonLink href={subjectHref} variant="secondary" size="sm" className="shrink-0">
            View full roadmap →
          </ButtonLink>
        </div>

        <div className="mt-4">
          <ProgressBar
            value={lessons.length ? doneCount / lessons.length : 0}
            label={`${doneCount} of ${lessons.length} checkpoints complete`}
            tone={roadmapComplete ? "success" : "accent"}
          />
        </div>
      </header>

      {nextEntry ? (
        <div className="border-b border-line p-4 sm:p-5">
          <div className="rounded-xl border-2 border-accent/50 bg-surface px-3.5 py-3.5 sm:px-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-accent font-bold">
                  {roadmapComplete ? "Roadmap complete" : "Recommended next"}
                </p>
                <h3 className="mt-1 text-sm font-bold text-ink">{nextEntry.lesson.title}</h3>
                <p className="mt-0.5 text-xs text-ink2">
                  {nextEntry.topic.title} · checkpoint {nextEntry.lesson.checkpointIndex} of {nextEntry.lesson.checkpointTotal}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-ink3">{nextEntry.lesson.focus}</p>
              </div>
              <ButtonLink href={nextHref} variant="primary" size="sm" className="shrink-0">
                {roadmapComplete ? "Review roadmap" : "Continue roadmap"} →
              </ButtonLink>
            </div>
          </div>
        </div>
      ) : null}

      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Path by unit</h3>
            <p className="mt-0.5 text-xs text-ink3">See the shape of the course without opening another screen.</p>
          </div>
          <Pill>{roadmapUnits.length} {roadmapUnits.length === 1 ? "unit" : "units"}</Pill>
        </div>

        <ol className="mt-3 space-y-2.5" aria-label="Learning roadmap units">
          {roadmapUnits.map(({ unit, entries }, unitIndex) => {
            const unitDone = entries.filter(({ entry }) => isEntryComplete(entry)).length;
            const unitComplete = unitDone === entries.length;
            const unitCurrent = entries.some(({ index }) => index === firstIncomplete);
            const unitProgress = entries.length ? unitDone / entries.length : 0;
            return (
              <li
                key={unit.id}
                className={cx(
                  "rounded-xl border px-3 py-3",
                  unitCurrent ? "border-accent/50 bg-surface2" : "border-line bg-surface",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cx(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                      unitComplete
                        ? "border-success bg-success text-onaccent"
                        : unitCurrent
                          ? "border-accent text-accent"
                          : "border-line text-ink3",
                    )}
                    aria-hidden="true"
                  >
                    {unitComplete ? "✓" : unitIndex + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <p className="text-xs font-bold text-ink">
                        Unit {unitIndex + 1} · {unit.title}
                      </p>
                      {unitCurrent ? <Pill tone="accent">Next</Pill> : unitComplete ? <Pill tone="success">Done</Pill> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink3">
                      {unitDone} of {entries.length} checkpoints complete
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={unitProgress} label={`Unit ${unitIndex + 1} progress`} tone={unitComplete ? "success" : "accent"} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-3 text-[11px] text-ink3">
          Every checkpoint asks you to retrieve the idea before showing the model answer, then applies it to an exam-style check.
        </p>
      </div>
    </section>
  );
}
