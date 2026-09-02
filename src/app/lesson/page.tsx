"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LessonMode } from "@/components/LessonMode";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { useStore } from "@/state/store";

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

  // Land the student where they left off: an explicit ?subject= link wins,
  // then the subject they last studied (synced through settings, so it
  // follows them across devices), then the first enrolled subject. A
  // remembered or linked subject that is no longer enrolled falls back.
  const [subjectId, setSubjectId] = useState(() => {
    const candidate = params.get("subject") ?? store.settings.lastLessonSubject ?? subjects[0]?.id ?? "";
    return subjects.some((s) => s.id === candidate) ? candidate : subjects[0]?.id ?? "";
  });
  const topics = useMemo(() => (subjectId ? allTopics([subjectId]) : []), [subjectId]);

  const changeSubject = (value: string) => {
    setSubjectId(value);
    if (value) void store.updateSettings({ lastLessonSubject: value });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Lessons</h1>
        <p className="text-sm text-ink3 mt-0.5">
          Learn a topic from zero — guided steps before you drill it with flashcards.
        </p>
      </header>

      <div className="flex gap-2">
        <select
          value={subjectId}
          onChange={(e) => changeSubject(e.target.value)}
          className="field field-inline text-sm"
          aria-label="Subject"
        >
          <option value="">Select a subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {subjectId ? <LessonMode topics={topics} onExit={() => setSubjectId("")} /> : null}
    </div>
  );
}