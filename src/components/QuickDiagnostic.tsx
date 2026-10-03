"use client";

// 5–10 minute cold-start diagnostic. Answers go through the normal attempt
// pipeline (QuestionRunner), so nothing here is a parallel evidence store.

import { useMemo, useState } from "react";
import { getTopic } from "@/domain/curriculum";
import { rootCauseOf } from "@/domain/mistake-patterns";
import { quickDiagnosticReport, selectQuickDiagnostic, type QuickProbe } from "@/domain/quick-diagnostic";
import { QuestionRunner } from "./QuestionRunner";
import { ButtonLink, Button, Panel } from "./ui";
import { useStoreFields } from "@/state/store";
import type { Attempt } from "@/domain/types";

export function QuickDiagnostic({ subjectId }: { subjectId: string }) {
  const store = useStoreFields("questions", "attempts", "mistakes");
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState<Attempt[]>([]);
  const [selection] = useState(() => {
    const seen = new Set(store.attempts.map((a) => a.questionId));
    const pool = store.questions.filter((q) => q.subjectId === subjectId && !seen.has(q.id));
    const topicIds = [...new Set(pool.flatMap((q) => q.topicIds))];
    return { ...selectQuickDiagnostic({ questions: pool, topicIds }), topicIds };
  });
  const title = (id: string) => getTopic(id)?.title ?? id;
  const index = done.length;
  const item = selection.items[index];
  const question = item ? store.questions.find((q) => q.id === item.questionId) : undefined;

  const report = useMemo(() => {
    if (index < selection.items.length) return null;
    const probes: QuickProbe[] = done.map((attempt, i) => {
      const it = selection.items[i]!;
      const cause = store.mistakes.find((m) => m.attemptId === attempt.id);
      return { topicId: it.topicId, dimension: it.dimension, awarded: attempt.awarded, max: attempt.max, ...(cause ? { cause: rootCauseOf(cause) } : {}) };
    });
    return quickDiagnosticReport({ probes, topicIds: [...new Set(selection.items.map((i) => i.topicId))], topicTitle: title });
  }, [done, index, selection.items, store.mistakes]);

  if (!selection.items.length) {
    return <Panel><p className="text-sm text-ink3">There are not enough reviewed, unseen questions for this subject to run a quick diagnostic.</p></Panel>;
  }
  if (!started) {
    return (
      <Panel className="space-y-3">
        <p className="text-sm text-ink2">{selection.items.length} questions, about {selection.minutes} minutes, sampling recall, application, calculations and explanation. No hints.</p>
        {selection.uncovered.length ? <p className="text-xs text-ink3">Not enough reviewed questions to sample: {selection.uncovered.join(", ")}.</p> : null}
        <Button variant="primary" onClick={() => setStarted(true)}>Start quick diagnostic</Button>
      </Panel>
    );
  }
  if (report) {
    return (
      <Panel className="space-y-4">
        <h2 className="text-base font-semibold text-ink">What I found</h2>
        <ul className="text-sm text-ink space-y-1">{report.lines.found.map((l) => <li key={l}>{l}</li>)}</ul>
        <div>
          <p className="text-sm font-semibold text-ink">Best next step</p>
          <p className="text-sm text-ink2">{report.lines.next}</p>
          {report.firstMission ? <p className="text-xs text-ink3 mt-1">{report.firstMission.reason}</p> : null}
        </div>
        <p className="text-xs text-ink3">{report.caveat}</p>
        <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
      </Panel>
    );
  }
  return (
    <>
      <p className="text-xs text-ink3">Question {index + 1} of {selection.items.length} · {title(item!.topicId)}</p>
      {question ? (
        <QuestionRunner key={question.id} question={question} hintBudget={0} onFinished={(attempt) => setDone((prev) => [...prev, attempt])} />
      ) : null}
    </>
  );
}

