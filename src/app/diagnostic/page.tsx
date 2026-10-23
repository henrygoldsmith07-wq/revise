"use client";

import { displayMinutes } from "@/domain/minutes";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { diagnosticFinished, diagnosticReport, diagnosticStartBlocker, nextProbe, type ProbeRecord } from "@/domain/adaptive-diagnostic";
import { getSubject, getTopic } from "@/domain/curriculum";
import { diagnosticItems, probeFromAttempt } from "@/domain/diagnostic-items";
import { QuickDiagnostic } from "@/components/QuickDiagnostic";
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
  return (
    <Suspense fallback={null}>
      <Diagnostic />
    </Suspense>
  );
}

function Diagnostic() {
  const params = useSearchParams();
  const store = useStoreFields("questions", "attempts", "settings");
  const subjectIds = store.settings.subjectIds;
  const requested = params.get("subject");
  const [subjectId, setSubjectId] = useState<string | null>(requested && subjectIds.includes(requested) ? requested : null);
  const [quick, setQuick] = useState(true);
  const [records, setRecords] = useState<ProbeRecord[]>([]);
  // The attempt just marked, held on screen with its marked result until the
  // student continues. Confidence is captured with the submit, before the
  // mark is revealed (QuestionRunner `onConfidence`), so the calibration
  // record is a judgement of the answer, not a reaction to the mark.
  const [pending, setPending] = useState<Attempt | null>(null);
  const [confidence, setConfidence] = useState<boolean | null>(null);
  const active = subjectId ?? subjectIds[0] ?? null;

  const items = useMemo(() => (active ? diagnosticItems(active, store.questions) : []), [active, store.questions]);
  // Taken at start so answers made during the diagnostic do not hide later probes.
  const [seen] = useState(() => new Set(store.attempts.map((a) => a.questionId)));
  const topicIds = useMemo(() => [...new Set(items.map((i) => i.topicId))], [items]);
  const input = { topicIds, items, records, seenItemIds: seen };
  const probe = !pending && active ? nextProbe(input) : null;
  const finished = !pending && (items.length === 0 || diagnosticFinished(input));
  // Finished before a single question was asked: say why and route on,
  // rather than showing an empty "No diagnostic answers yet" report.
  const blocker = finished && !records.length ? diagnosticStartBlocker(input) : null;
  // While an attempt is held, keep its question mounted so the runner keeps
  // showing the marked result (same key, same position in the tree).
  const questionId = pending ? pending.questionId : probe?.item.id;
  const question = questionId ? store.questions.find((q) => q.id === questionId) : undefined;
  const report = useMemo(() => diagnosticReport(records, topicIds, items), [records, topicIds, items]);
  const titleOf = (id: string) => getTopic(id)?.title ?? id;

  function advance() {
    if (!pending) return;
    const item = items.find((i) => i.id === pending.questionId);
    // Confidence is always captured by the submit buttons; without it there
    // is no honest calibration record, so no probe is recorded rather than
    // inventing one.
    if (item && confidence !== null) setRecords((prev) => [...prev, probeFromAttempt(pending, item, confidence)]);
    setPending(null);
    setConfidence(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{finished && records.length ? "Result" : quick ? "Optional · 5–10 minutes" : "Optional · 15–25 minutes"}</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">{finished && records.length ? "Your diagnostic result" : quick ? "Quick check" : "Full diagnostic"}</h1>
        <p className="text-sm text-ink3 mt-1 max-w-3xl">
          A short check so Revise can choose your first step. It is not a grade and does not test everything. No hints are offered. Answers on teacher-reviewed questions count as unaided evidence; anything else is labelled practice, not proof.
        </p>
      </header>

      {!records.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Diagnostic length">
          <Button size="sm" variant={quick ? "primary" : "secondary"} aria-pressed={quick} onClick={() => setQuick(true)}>Quick · 5–10 min</Button>
          <Button size="sm" variant={quick ? "secondary" : "primary"} aria-pressed={!quick} onClick={() => setQuick(false)}>Full · 15–25 min</Button>
        </div>
      ) : null}

      {subjectIds.length > 1 && !records.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
          {subjectIds.map((id) => (
            <Button key={id} size="sm" variant={id === active ? "primary" : "secondary"} onClick={() => setSubjectId(id)}>{getSubject(id)?.name ?? id}</Button>
          ))}
        </div>
      ) : null}

      {!active ? (
        <Panel><p className="text-sm text-ink3">Choose a subject in Settings first.</p></Panel>
      ) : quick && !records.length ? (
        <QuickDiagnostic key={active} subjectId={active} autoStart={requested === active} />
      ) : items.length === 0 ? (
        // Not a dead end: the full diagnostic needs reviewed questions, but the
        // quick check has a labelled practice tier and practice always works.
        <Panel className="space-y-3">
          <p className="text-sm text-ink3">There are no reviewed questions for this subject yet, so Revise will not run the full diagnostic on unverified content.</p>
          <p className="text-sm text-ink2">You can still find a starting point: the quick check uses authored questions, clearly labelled practice, not proof.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setQuick(true)}>Take the quick check instead</Button>
            <ButtonLink href={`/practice?subject=${encodeURIComponent(active)}`} variant="secondary">Practise this subject</ButtonLink>
          </div>
        </Panel>
      ) : blocker ? (
        <Panel className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Nothing new for the full diagnostic to ask</h2>
          <p className="text-sm text-ink3">
            {blocker === "all-known"
              ? "You already have solid evidence on every topic that has teacher-reviewed questions, so a diagnostic would not tell Revise anything new."
              : "The full diagnostic only uses teacher-reviewed questions you have not answered before, and you have already answered every one for this subject. Your earlier answers already count."}
          </p>
          <p className="text-sm text-ink2">Today already uses those answers to choose your next step. Practice questions there are labelled practice, not proof.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/" variant="primary">See your next step on Today</ButtonLink>
            <ButtonLink href={`/practice?subject=${encodeURIComponent(active)}`} variant="secondary">Practise this subject</ButtonLink>
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
      ) : question && (probe || pending) ? (
        <>
          <p className="text-xs text-ink3">{records.length} answered · about {displayMinutes(report.minutes)} of 25 minutes{probe ? ` · ${probe.reason}` : ""}</p>
          <QuestionRunner
            key={question.id}
            question={question}
            hintBudget={0}
            inDiagnostic
            onConfidence={setConfidence}
            onFinished={(attempt) => setPending(attempt)}
          />
          {pending ? (
            // Kept in reach on a phone: the marked result can be long, so the
            // way on sits above the bottom navigation, not below the result.
            <div className="sticky bottom-20 lg:bottom-4 z-10 card card-2 p-3 space-y-2 bg-surface">
              <p className="text-sm text-ink2" role="status" aria-live="polite">
                {pending.awarded}/{pending.max} on this one{confidence === true ? ", and you said you were confident" : confidence === false ? ", and you said you were not sure" : ""}. {pending.awarded >= pending.max ? "Compare with the model answer if you like, then carry on." : "Read what you missed and the model answer, then carry on."}
              </p>
              <Button variant="primary" className="w-full min-h-11" onClick={advance}>Continue</Button>
            </div>
          ) : null}
          <Link href="/" className="text-xs text-ink3 underline">Stop and go back to Today</Link>
        </>
      ) : null}
    </div>
  );
}
