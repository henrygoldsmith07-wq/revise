"use client";

// 5–10 minute cold-start diagnostic. Answers go through the normal attempt
// pipeline (QuestionRunner), so nothing here is a parallel evidence store.

import { displayMinutes } from "@/domain/minutes";
import { useEffect, useMemo, useState } from "react";
import { getTopic } from "@/domain/curriculum";
import { rootCauseOf } from "@/domain/mistake-patterns";
import { quickCheckTopicIds, quickDiagnosticPool, quickDiagnosticReport, resumeQuickDiagnostic, selectQuickDiagnostic, type QuickDiagnosticRun, type QuickProbe } from "@/domain/quick-diagnostic";
import { readReviseUserMeta, writeReviseUserMeta } from "@/data/storage-namespace";
import { QuestionRunner } from "./QuestionRunner";
import { ButtonLink, Button, Panel } from "./ui";
import { useStoreFields } from "@/state/store";
import { useRevisionPlan } from "./recovery-evidence";
import { captureProductEvent } from "@/lib/product-telemetry";
import { flushPilotEvents, recordPilotEvent } from "@/lib/pilot-telemetry";
import type { Attempt } from "@/domain/types";

export function QuickDiagnostic({ subjectId, autoStart = false }: { subjectId: string; autoStart?: boolean }) {
  const store = useStoreFields("questions", "attempts", "mistakes", "recordFunnel", "userId", "settings");
  const { plan } = useRevisionPlan();
  const [started, setStarted] = useState(autoStart);
  const [done, setDone] = useState<Attempt[]>([]);
  // The attempt just marked, held on screen until the student chooses to move
  // on. Advancing straight to the next probe used to unmount the runner the
  // moment marking finished, so a new student never saw their mark, the mark
  // scheme points they missed or the model answer for any diagnostic question.
  const [reviewing, setReviewing] = useState<Attempt | null>(null);
  const advance = () => {
    if (!reviewing) return;
    const next = [...done, reviewing];
    setDone(next);
    if (selection) void saveRun({ ...selection, doneAttemptIds: next.map((a) => a.id) });
    setReviewing(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // The run is chosen once and saved, so a reload resumes the same questions
  // at the same position instead of drawing a fresh set from the unseen pool.
  const [selection, setSelection] = useState<QuickDiagnosticRun | null>(null);
  const saveRun = async (run: QuickDiagnosticRun | null) => {
    const runs = (await readReviseUserMeta<Record<string, QuickDiagnosticRun>>("quickDiagnosticRuns", store.userId)) ?? {};
    if (run) runs[subjectId] = run;
    else delete runs[subjectId];
    await writeReviseUserMeta("quickDiagnosticRuns", store.userId, runs);
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const runs = await readReviseUserMeta<Record<string, unknown>>("quickDiagnosticRuns", store.userId).catch(() => undefined);
      if (cancelled) return;
      const resumed = resumeQuickDiagnostic(runs?.[subjectId], subjectId, store.questions, store.attempts);
      if (resumed) {
        setDone(resumed.done);
        setStarted(true);
        setSelection(resumed.run);
        return;
      }
      const pool = quickDiagnosticPool(store.questions, store.attempts, subjectId);
      const topicIds = quickCheckTopicIds(pool, store.settings.yearGroup, getTopic, store.settings.unit4Option);
      const trusted = selectQuickDiagnostic({ questions: pool, topicIds });
      // No trusted supply (the normal flagship state until human review lands):
      // offer an authored practice-tier check, labelled as practice, not proof.
      const practiceTier = !trusted.items.length;
      const chosen = practiceTier ? selectQuickDiagnostic({ questions: pool, topicIds, practiceTier: true }) : trusted;
      setSelection({ ...chosen, version: 1, subjectId, topicIds, practiceTier, doneAttemptIds: [] });
    })();
    return () => { cancelled = true; };
    // Chosen once per mount, like the synchronous initialiser it replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // The marked attempt is saved as done the moment it is marked, not when
    // the learner moves on: a reload while reading the feedback must resume
    // after this question, never re-ask it with the model answer already seen.
    if (reviewing && selection) void saveRun({ ...selection, doneAttemptIds: [...done, reviewing].map((a) => a.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing]);
  useEffect(() => {
    // Saved only once the learner starts, so opening the page never pins a set.
    if (started && selection && selection.items.length && done.length === 0) void saveRun(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, selection]);
  useEffect(() => {
    if (started && selection?.items.length && done.length === 0) void store.recordFunnel("diagnostic_started", subjectId);
    // Once per mount: `started` flips true at most once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, selection]);
  const title = (id: string) => getTopic(id)?.title ?? id;
  const index = done.length;
  const items = useMemo(() => selection?.items ?? [], [selection]);
  const item = items[index];
  const question = item ? store.questions.find((q) => q.id === item.questionId) : undefined;

  const report = useMemo(() => {
    if (!selection || index < items.length) return null;
    const probes: QuickProbe[] = done.map((attempt, i) => {
      const it = items[i]!;
      const cause = store.mistakes.find((m) => m.attemptId === attempt.id);
      return { topicId: it.topicId, dimension: it.dimension, awarded: attempt.awarded, max: attempt.max, ...(cause ? { cause: rootCauseOf(cause) } : {}) };
    });
    return quickDiagnosticReport({ probes, topicIds: [...new Set(items.map((i) => i.topicId))], topicTitle: title });
  }, [done, index, items, selection, store.mistakes]);

  // The next step must follow from this check: the plan's best action in the
  // subject just checked, preferring a topic this check found weak. The
  // global top action could be another subject entirely.
  const next = useMemo(() => {
    if (!report) return null;
    const weak = new Set(done.flatMap((attempt, i) => (attempt.max > 0 && attempt.awarded / attempt.max < 0.6 ? [items[i]!.topicId] : [])));
    const inSubject = plan.actions.filter((action) => action.subjectId === subjectId);
    return inSubject.find((action) => action.topicIds.some((id) => weak.has(id))) ?? inSubject[0] ?? null;
  }, [report, done, items, plan.actions, subjectId]);

  const finished = Boolean(report);
  useEffect(() => {
    if (finished) {
      void saveRun(null);
      void store.recordFunnel("diagnostic_completed", subjectId);
      captureProductEvent("diagnostic.completed", { subject: subjectId, count: items.length });
      if (store.settings.pilotTelemetry === true && store.userId) {
        recordPilotEvent(store.userId, { event: "diagnostic.completed", subjectId, count: items.length });
        void flushPilotEvents(store.userId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (!selection) return null;
  if (!selection.items.length) {
    return (
      <Panel className="space-y-3">
        <p className="text-sm text-ink3">Revise does not have enough reviewed, unseen questions across different topics to run a reliable quick check in this subject yet, so it will not guess where to start. Practice is still available.</p>
        <ButtonLink href={`/practice?subject=${encodeURIComponent(subjectId)}`} variant="primary">Practise this subject</ButtonLink>
      </Panel>
    );
  }
  if (!started) {
    return (
      <Panel className="space-y-3">
        {selection.practiceTier ? (
          <p className="rounded-[8px] border border-review/40 bg-reviewsoft px-3 py-2 text-xs font-medium text-ink" role="note">
            Practice, not proof: no reviewed questions exist here yet, so this check uses authored questions and cannot count as evidence.
          </p>
        ) : null}
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
        {selection.practiceTier ? (
          <p className="text-xs text-ink2" role="note">Practice, not proof: these answers used unreviewed questions, so they guide where to start but count as no evidence in the ledger.</p>
        ) : null}
        <ul className="text-sm text-ink space-y-1">{report.lines.found.map((l) => <li key={l}>{l}</li>)}</ul>
        <div>
          <p className="text-sm font-semibold text-ink">Best next step</p>
          {next ? (
            <>
              <p className="text-sm text-ink2">{next.title} · {displayMinutes(next.minutes)} min</p>
              <p className="text-xs text-ink3 mt-1">{next.explanation.why}</p>
            </>
          ) : <p className="text-sm text-ink2">{report.lines.next}</p>}
        </div>
        <p className="text-xs text-ink3">{report.caveat}</p>
        <ButtonLink href={next?.route.href ?? "/"} variant="primary">{next ? "Start session" : "Back to Today"}</ButtonLink>
        {next ? <ButtonLink href="/" variant="secondary">Back to Today</ButtonLink> : null}
      </Panel>
    );
  }
  return (
    <>
      <p className="text-xs text-ink3">Question {index + 1} of {selection.items.length} · {title(item!.topicId)}{selection.practiceTier ? " · practice, not proof" : ""}</p>
      {index === 0 ? <p className="text-xs text-ink3">An initial signal about where to start, not a predicted grade. Skip any time from Today.</p> : null}
      {question ? (
        <QuestionRunner key={question.id} question={question} hintBudget={0} inDiagnostic onFinished={(attempt) => setReviewing(attempt)} />
      ) : null}
      {reviewing ? (
        // Kept in reach on a phone: the marked result can be long, so the way
        // on sits above the bottom navigation instead of at the end of it.
        <div className="sticky bottom-20 lg:bottom-4 z-10 card card-2 p-3 space-y-2 bg-surface">
          <p className="text-sm text-ink2" role="status" aria-live="polite">
            {reviewing.awarded}/{reviewing.max} on this one. {reviewing.awarded >= reviewing.max ? "Compare with the model answer if you like, then carry on." : "Read what you missed and the model answer, then carry on."}
          </p>
          <Button variant="primary" className="w-full min-h-11" onClick={advance}>
            {index + 1 >= selection.items.length ? "See what I found" : "Next question"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

