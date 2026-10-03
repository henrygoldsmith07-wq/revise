"use client";

// Pre-exam command centre: shown only inside the countdown window. One headline,
// the marks at risk, and five time-boxed choices, each a different strategy.

import { useMemo, useState } from "react";
import { buildExamMissions } from "@/domain/exam-mission";
import { buildMarksAtRisk } from "@/domain/marks-at-risk";
import { selectNextPaper } from "@/domain/exam-paper-selection";
import { allTopics, getSubject, topicsFor } from "@/domain/curriculum";
import { buildCommandCentre, TIME_BOXES, type TimeBox } from "@/domain/pre-exam-plan";
import { topicShares } from "@/domain/topic-weight";
import { useStoreFields } from "@/state/store";
import { Button, ButtonLink, Pill } from "./ui";
import { useRecoveryEvidence } from "./recovery-evidence";

const label = (m: TimeBox) => (m === 60 ? "1 hour" : `${m} min`);

export function CommandCentreCard() {
  const ev = useRecoveryEvidence();
  const store = useStoreFields("attempts", "mistakes", "questions", "settings", "papers", "mastery");
  const [box, setBox] = useState<TimeBox>(20);

  const { centre, lead } = useMemo(() => {
    const subjects = store.settings.subjectIds;
    const missions = buildExamMissions({ mistakes: ev.mistakes, recovery: ev.recovery, patterns: ev.patterns, daysToExam: ev.daysToExam, unseenByTopic: ev.unseenByTopic, topicTitle: ev.topicTitle, repairWeight: ev.repairWeight, max: 3 });
    const touched = new Set(store.attempts.map((a) => a.topicIds).flat());
    const topics = allTopics(subjects);
    const shares = topicShares(topics);
    const untouched = topics
      .filter((t) => !touched.has(t.id))
      .map((t) => ({ topicId: t.id, label: t.title, share: shares.get(t.id) ?? 0 }));
    const pick = subjects.map((subjectId) => selectNextPaper({
      subjectId, papers: store.papers, questions: store.questions, attempts: store.attempts, mistakes: store.mistakes, mastery: store.mastery,
      topics: topicsFor(subjectId), targetGrade: store.settings.targetGrades[subjectId] ?? null,
      gradeBoundaries: getSubject(subjectId)?.gradeBoundaries, now: ev.recovery.now,
    }).recommended).find(Boolean);
    const sat = pick ? store.papers.find((p) => p.id === pick.paperId) : undefined;
    const centre = buildCommandCentre({
      daysToExam: ev.daysToExam,
      marksAtRisk: buildMarksAtRisk({ mistakes: store.mistakes, attempts: store.attempts, questions: store.questions, papers: store.papers, subjectIds: subjects }),
      patterns: ev.patterns, recovery: ev.recovery.totals, missions,
      delayedProofDue: ev.recovery.items.filter((i) => i.state === "awaiting-proof" && i.proofDueAt && Date.parse(i.proofDueAt) <= ev.recovery.now.getTime()).length,
      untouchedHighValue: untouched.filter((t) => t.share > 0).sort((a, b) => b.share - a.share).slice(0, 3),
      recommendedPaper: sat ? { id: sat.id, title: sat.title } : null,
    });
    return { centre, lead: missions[0] ?? null };
  }, [ev, store.attempts, store.mastery, store.mistakes, store.papers, store.questions, store.settings.subjectIds, store.settings.targetGrades]);

  if (!centre.active) return null;
  const plan = centre.actions.find((a) => a.minutes === box)!;
  const paper = plan.steps.some((s) => s.kind === "paper-section" || s.kind === "full-paper");
  const subject = store.settings.subjectIds[0] ?? "";
  const href = paper ? "/papers" : `/practice?recover=1&subject=${encodeURIComponent(subject)}`;
  return (
    <section aria-label="Pre-exam command centre" className="card p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{centre.daysToExam} day{centre.daysToExam === 1 ? "" : "s"} to your exam</p>
        <Pill tone={centre.phase === "final" ? "danger" : "accent"}>{centre.phase}</Pill>
      </div>
      <p className="text-base font-semibold text-ink">{centre.headline}</p>
      <p className="text-xs text-ink3">{centre.strategy}</p>
      <div role="group" aria-label="Time available" className="grid grid-cols-5 gap-2">
        {TIME_BOXES.map((m) => (
          <Button key={m} size="md" variant={m === box ? "primary" : "secondary"} aria-pressed={m === box} onClick={() => setBox(m)}>{label(m)}</Button>
        ))}
      </div>
      <div className="rounded-[8px] border border-line px-3 py-3 space-y-2">
        <p className="text-sm font-semibold text-ink">{plan.label}</p>
        <ol className="text-sm text-ink2 space-y-0.5">{plan.steps.map((s) => <li key={s.label}>{s.minutes} min: {s.label}</li>)}</ol>
        <p className="text-xs text-ink3">{plan.reason}</p>
        <ButtonLink href={href} variant="primary" className="w-full sm:w-auto">Start {label(plan.minutes)} plan</ButtonLink>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer select-none text-ink2">What is open</summary>
        <ul className="mt-2 space-y-1 text-ink2 text-xs">
          {lead ? <li>Lead mission: {lead.title} ({lead.marksAtStake} marks at stake). {lead.completionCondition}</li> : null}
          <li>{centre.marksAtRisk} marks at risk. {centre.recovery.statement}</li>
          {centre.weakAreas.map((w) => <li key={w.topicId}>Weak: {w.label} ({w.marks} marks)</li>)}
          {centre.recurring.map((r) => <li key={r.label}>Recurring: {r.label} ({r.marks} marks open)</li>)}
          {centre.delayedProofDue ? <li>{centre.delayedProofDue} delayed proof check{centre.delayedProofDue === 1 ? "" : "s"} due</li> : null}
          {centre.untouchedHighValue.length ? <li>Untouched high-value: {centre.untouchedHighValue.map((t) => t.label).join(", ")}</li> : null}
          {centre.recommendedPaper ? <li>Next paper: {centre.recommendedPaper.title}</li> : null}
        </ul>
      </details>
    </section>
  );
}
