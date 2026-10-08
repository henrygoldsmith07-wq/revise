"use client";

// 5–10 minute cold-start diagnostic. Answers go through the normal attempt
// pipeline (QuestionRunner), so nothing here is a parallel evidence store.

import { useEffect, useMemo, useState } from "react";
import { getTopic } from "@/domain/curriculum";
import { rootCauseOf } from "@/domain/mistake-patterns";
import { quickDiagnosticPool, quickDiagnosticReport, selectQuickDiagnostic, type QuickProbe } from "@/domain/quick-diagnostic";
import { QuestionRunner } from "./QuestionRunner";
import { ButtonLink, Button, Panel } from "./ui";
import { useStoreFields } from "@/state/store";
import { useRevisionPlan } from "./recovery-evidence";
import { captureProductEvent } from "@/lib/product-telemetry";
import type { Attempt } from "@/domain/types";

export function QuickDiagnostic({ subjectId, autoStart = false }: { subjectId: string; autoStart?: boolean }) {
  const store = useStoreFields("questions", "attempts", "mistakes", "recordFunnel");
  const { plan } = useRevisionPlan();
  const [started, setStarted] = useState(autoStart);
  const [done, setDone] = useState<Attempt[]>([]);
  const [selection] = useState(() => {
    const pool = quickDiagnosticPool(store.questions, store.attempts, subjectId);
    const topicIds = [...new Set(pool.flatMap((q) => q.topicIds))].sort();
    return { ...selectQuickDiagnostic({ questions: pool, topicIds }), topicIds };
  });
  useEffect(() => {
    if (started && selection.items.length) void store.recordFunnel("diagnostic_started", subjectId);
    // Once per mount: `started` flips true at most once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);
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

  const finished = Boolean(report);
  useEffect(() => {
    if (finished) {
      void store.recordFunnel("diagnostic_completed", subjectId);
      captureProductEvent("diagnostic.completed", { subject: subjectId, count: selection.items.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (!selection.items.length) {
    return <Panel><p className="text-sm text-ink3">Revise does not have enough reviewed, unseen questions across different topics to run a reliable quick check in this subject yet, so it will not guess where to start. Practice is still available.</p></Panel>;
  }
  if (!started) {
    return (
      <Panel className="space-y-3">
        <p className="text-sm text-ink2">{selection.items.length} questions across {new Set(selection.items.map((i) => i.topicId)).size} topics, about {selection.minutes} minutes. No hints.</p>
        <p className="text-sm text-ink2">This is an initial signal about where to start, not a predicted grade. You can skip it from Today.</p>
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
          {plan.top ? (
            <>
              <p className="text-sm text-ink2">{plan.top.title} · {Math.ceil(plan.top.minutes)} min</p>
              <p className="text-xs text-ink3 mt-1">{plan.top.explanation.why}</p>
            </>
          ) : <p className="text-sm text-ink2">{report.lines.next}</p>}
        </div>
        <p className="text-xs text-ink3">{report.caveat}</p>
        <ButtonLink href={plan.top?.route.href ?? "/"} variant="primary">{plan.top ? "Start session" : "Back to Today"}</ButtonLink>
        {plan.top ? <ButtonLink href="/" variant="secondary">Back to Today</ButtonLink> : null}
      </Panel>
    );
  }
  return (
    <>
      <p className="text-xs text-ink3">Question {index + 1} of {selection.items.length} · {title(item!.topicId)}</p>
      {index === 0 ? <p className="text-xs text-ink3">An initial signal about where to start, not a predicted grade. Skip any time from Today.</p> : null}
      {question ? (
        <QuestionRunner key={question.id} question={question} hintBudget={0} onFinished={(attempt) => setDone((prev) => [...prev, attempt])} />
      ) : null}
    </>
  );
}

