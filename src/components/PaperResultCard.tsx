"use client";

// The paper result in one block: what was lost, where, why, what is
// recoverable, one next step and the honest state. Everything else about the
// paper sits below it, one tap away.

import { useMemo } from "react";
import { buildPaperMission } from "@/domain/exam-mission";
import { LEARNER_STATE_LABEL, LEARNER_STATE_TONE } from "@/domain/learner-state";
import { buildPaperResult } from "@/domain/paper-result";
import { Button, ButtonLink, Pill } from "./ui";
import { usePaperRecovery } from "./PaperRecoveryPanel";
import { useRecoveryEvidence } from "./recovery-evidence";

export function PaperResultCard({ paperId, title, onNavigate }: { paperId: string; title: string; onNavigate?: (href: string) => void }) {
  const ev = useRecoveryEvidence();
  const recovery = usePaperRecovery(paperId, title);
  const result = useMemo(() => {
    if (!recovery) return null;
    const mission = buildPaperMission(paperId, {
      mistakes: ev.mistakes, recovery: ev.recovery, patterns: ev.patterns, daysToExam: ev.daysToExam, unseenByTopic: ev.unseenByTopic,
      supplyByTopic: ev.supplyByTopic, topicTitle: ev.topicTitle, repairWeight: ev.repairWeight, paperTitles: { [paperId]: title },
    });
    const due = ev.recovery.items.filter((i) => i.paperId === paperId && i.state === "awaiting-proof" && i.proofDueAt).map((i) => i.proofDueAt!).sort()[0];
    return buildPaperResult({ recovery, mission, nextCheckAt: due, now: new Date() });
  }, [ev, paperId, recovery, title]);
  if (!result) return null;
  const next = result.next;
  return (
    <section aria-label="Paper result" className="rounded-[10px] border border-line px-4 py-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Paper result</p>
        {result.state ? <Pill tone={LEARNER_STATE_TONE[result.state]}>{LEARNER_STATE_LABEL[result.state]}</Pill> : null}
      </div>
      <p className="text-lg font-semibold text-ink">
        {result.lost > 0 ? `You lost ${result.lost} of ${result.max} marks.` : `You scored ${result.score} of ${result.max}.`}
      </p>
      {result.where.length ? (
        <p className="text-sm text-ink2"><span className="font-medium text-ink">Lost in:</span> {result.where.map((w) => `${ev.topicTitle(w.topicId)} (${w.marks})`).join(", ")}</p>
      ) : null}
      {result.reason ? <p className="text-sm text-ink2"><span className="font-medium text-ink">Likely reason:</span> {result.reason}</p> : null}
      {result.lost > 0 ? <p className="text-sm text-ink2"><span className="font-medium text-ink">Still to win back:</span> {result.recoverable} mark{result.recoverable === 1 ? "" : "s"}</p> : null}
      {next ? (
        onNavigate ? (
          <Button variant="primary" className="w-full sm:w-auto min-h-[3rem]" onClick={() => onNavigate(next.href)}>{next.label} · about {next.minutes} min</Button>
        ) : (
          <ButtonLink href={next.href} variant="primary" className="w-full sm:w-auto min-h-[3rem]">{next.label} · about {next.minutes} min</ButtonLink>
        )
      ) : null}
      {result.after ? <p className="text-sm text-ink2"><span className="font-medium text-ink">Then:</span> {result.after.replace(/^After this: /, "")}</p> : null}
      <p className="text-sm text-ink2">{result.statement}</p>
      {result.check ? <p className="text-sm text-ink2">{result.check}</p> : null}
    </section>
  );
}
