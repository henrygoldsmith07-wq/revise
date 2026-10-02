"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diagnosticFinished, diagnosticReport, nextProbe, type ProbeRecord } from "@/domain/adaptive-diagnostic";
import { getSubject, getTopic } from "@/domain/curriculum";
import { diagnosticItems, probeFromAttempt } from "@/domain/diagnostic-items";
import { QuestionRunner } from "@/components/QuestionRunner";
import { Button, ButtonLink, Panel } from "@/components/ui";
import { useStoreFields } from "@/state/store";
import type { Attempt } from "@/domain/types";

const ACTION_TEXT = {
  "prerequisite-repair": "repair the foundation first",
  "retrieval-set": "recall practice",
  "independent-set": "independent application questions",
  "transfer-set": "an unfamiliar-context question",
  "technique-intervention": "exam-technique practice",
} as const;

export default function DiagnosticPage() {
  const store = useStoreFields("questions", "attempts", "settings");
  const subjectIds = store.settings.subjectIds;
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [records, setRecords] = useState<ProbeRecord[]>([]);
  const [pending, setPending] = useState<Attempt | null>(null);
  const active = subjectId ?? subjectIds[0] ?? null;

  const items = useMemo(() => (active ? diagnosticItems(active, store.questions) : []), [active, store.questions]);
  // Taken at start so answers made during the diagnostic do not hide later probes.
  const [seen] = useState(() => new Set(store.attempts.map((a) => a.questionId)));
  const topicIds = useMemo(() => [...new Set(items.map((i) => i.topicId))], [items]);
  const input = { topicIds, items, records, seenItemIds: seen };
  const probe = !pending && active ? nextProbe(input) : null;
  const finished = !pending && (items.length === 0 || diagnosticFinished(input));
  const question = probe ? store.questions.find((q) => q.id === probe.item.id) : undefined;
  const report = useMemo(() => diagnosticReport(records, topicIds, items), [records, topicIds, items]);
  const titleOf = (id: string) => getTopic(id)?.title ?? id;

  function confirm(confident: boolean) {
    if (!pending) return;
    const item = items.find((i) => i.id === pending.questionId);
    if (item) setRecords((prev) => [...prev, probeFromAttempt(pending, item, confident)]);
    setPending(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Optional · 15–25 minutes</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Starting diagnostic</h1>
        <p className="text-sm text-ink3 mt-1 max-w-3xl">
          A short adaptive set that adds real evidence for the recommender. It is not a grade prediction and does not test everything. No hints are offered, so the answers count as unaided evidence.
        </p>
      </header>

      {subjectIds.length > 1 && !records.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
          {subjectIds.map((id) => (
            <Button key={id} size="sm" variant={id === active ? "primary" : "secondary"} onClick={() => setSubjectId(id)}>{getSubject(id)?.name ?? id}</Button>
          ))}
        </div>
      ) : null}

      {!active ? (
        <Panel><p className="text-sm text-ink3">Choose a subject in Settings first.</p></Panel>
      ) : items.length === 0 ? (
        <Panel><p className="text-sm text-ink3">There are no reviewed questions for this subject yet, so Revise will not run a diagnostic on unverified content.</p></Panel>
      ) : pending ? (
        <Panel className="space-y-3">
          <p className="text-sm font-semibold text-ink">How sure were you of that answer?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => confirm(false)}>Not sure / guessed</Button>
            <Button variant="primary" onClick={() => confirm(true)}>Confident</Button>
          </div>
        </Panel>
      ) : finished ? (
        <Panel className="space-y-4">
          <h2 className="text-base font-semibold text-ink">What this tells Revise</h2>
          <ul className="text-sm text-ink space-y-1">{report.established.map((line) => <li key={line}>{line}</li>)}</ul>
          {report.strong.length ? <p className="text-sm text-ink2">Looked secure: {report.strong.map(titleOf).join(", ")}.</p> : null}
          {report.weak.length ? <p className="text-sm text-ink2">Likely weak: {report.weak.map((w) => titleOf(w.topicId)).join(", ")}.</p> : null}
          <p className="text-sm text-ink2">Still unknown: {report.unknown.length} topic{report.unknown.length === 1 ? "" : "s"} have no diagnostic evidence.</p>
          {report.calibration.samples ? <p className="text-xs text-ink3">Confidence check: {report.calibration.overconfident} confident miss{report.calibration.overconfident === 1 ? "" : "es"}, {report.calibration.underconfident} correct but unsure answer{report.calibration.underconfident === 1 ? "" : "s"}.</p> : null}
          {report.path.length ? (
            <div>
              <p className="text-sm font-semibold text-ink">Suggested first steps</p>
              <ol className="list-decimal pl-5 text-sm text-ink2">{report.path.map((p) => <li key={p.topicId}>{titleOf(p.topicId)}: {ACTION_TEXT[p.action]}</li>)}</ol>
            </div>
          ) : null}
          <p className="text-xs text-ink3">These answers are saved as normal attempts, so Today and your readiness picture already use them.</p>
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
        </Panel>
      ) : question && probe ? (
        <>
          <p className="text-xs text-ink3">{records.length} answered · about {Math.round(report.minutes)} of 25 minutes · {probe.reason}</p>
          <QuestionRunner
            key={question.id}
            question={question}
            hintBudget={0}
            onFinished={(attempt) => setPending(attempt)}
          />
          <Link href="/" className="text-xs text-ink3 underline">Stop and go back to Today</Link>
        </>
      ) : null}
    </div>
  );
}
