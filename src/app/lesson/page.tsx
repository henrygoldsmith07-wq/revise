"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LessonMode } from "@/components/LessonMode";
import { CommutePack } from "@/components/CommutePack";
import { SubjectPicker } from "@/components/SubjectPicker";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { useStore } from "@/state/store";
import { Pill } from "@/components/ui";

// /lesson — learn a topic from zero. Lists topics for the selected subject and
// hands off to LessonMode; entry point for learning before flashcards.
export default function LessonPage() {
  return (
    <Suspense fallback={null}>
      <LessonBrowser />
    </Suspense>
  );
}

function LessonBrowser() {
  const store = useStore();
  const params = useSearchParams();
  const subjects = useMemo(
    () => allSubjects().filter((s) => store.settings.subjectIds.includes(s.id)),
    [store.settings.subjectIds],
  );
  const subjectOptions = useMemo(
    () =>
      subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        detail: subject.specCode ? `Spec ${subject.specCode}` : "Step-by-step checkpoints",
      })),
    [subjects],
  );
  const topicParam = params.get("topic");

  // Land the student where they left off: an explicit ?subject= link wins,
  // then the subject they last studied (synced through settings, so it
  // follows them across devices), then the first enrolled subject. A
  // remembered or linked subject that is no longer enrolled falls back.
  const [subjectId, setSubjectId] = useState(() => {
    const candidate = params.get("subject") ?? store.settings.lastLessonSubject ?? subjects[0]?.id ?? "";
    return subjects.some((s) => s.id === candidate) ? candidate : subjects[0]?.id ?? "";
  });
  const topics = useMemo(() => (subjectId ? allTopics([subjectId]) : []), [subjectId]);
  const initialTopicId = topicParam && topics.some((topic) => topic.id === topicParam) ? topicParam : undefined;

  const changeSubject = (value: string) => {
    setSubjectId(value);
    if (value) void store.updateSettings({ lastLessonSubject: value });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Learning roadmap</h1>
        <p className="text-sm text-ink3 mt-0.5">
          Follow your subject from foundations to exam-ready ideas with detailed, step-by-step lessons.
        </p>
      </header>

      <section aria-label="Choose a lesson subject" className="card bg-surface2/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Choose a subject</p>
            <p className="mt-0.5 text-xs text-ink3">Pick a path to see its units and checkpoint lessons.</p>
          </div>
          {subjectId ? <Pill tone="accent">{subjects.find((subject) => subject.id === subjectId)?.name ?? subjectId}</Pill> : null}
        </div>
        {subjectOptions.length ? (
          <div className="mt-3">
            <SubjectPicker
              options={subjectOptions}
              selectedIds={subjectId ? [subjectId] : []}
              onChange={(ids) => {
                const next = ids[0];
                if (next) changeSubject(next);
              }}
              selectionMode="single"
              ariaLabel="Lesson subject"
              density="compact"
            />
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-xs text-ink3">
            Add a subject in Settings to open its roadmap.
          </p>
        )}
      </section>

      {subjectId ? (
        <>
          <CommutePack topics={topics} />
          <LessonMode
            key={`${subjectId}:${initialTopicId ?? ""}`}
            topics={topics}
            initialTopicId={initialTopicId}
            onExit={() => setSubjectId("")}
          />
        </>
      ) : null}
    </div>
  );
}
