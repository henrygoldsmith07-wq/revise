"use client";

// One mission, why it matters, and what proves it. Stages and the marks ledger
// sit behind a disclosure so Today stays calm.

import { useMemo } from "react";
import { buildPaperMission, missionNextAction, type ExamMission } from "@/domain/exam-mission";
import { LEARNER_STATE_LABEL, LEARNER_STATE_TONE, missionLearnerState } from "@/domain/learner-state";
import { ButtonLink, Pill } from "./ui";
import { useRecoveryEvidence } from "./recovery-evidence";

export function MissionView({ mission }: { mission: ExamMission }) {
  const action = missionNextAction(mission);
  const r = mission.recovery;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Exam mission</p>
        <Pill tone={LEARNER_STATE_TONE[missionLearnerState(mission.status, mission.recovery)]}>{LEARNER_STATE_LABEL[missionLearnerState(mission.status, mission.recovery)]}</Pill>
      </div>
      <div>
        <p className="text-base font-semibold text-ink">{mission.title}</p>
        <p className="text-sm text-ink2 mt-1">{action.why}</p>
        <p className="text-xs text-ink3 mt-1">{action.after}</p>
      </div>
      <p className="text-sm text-ink2">{r.statement}</p>
      {!action.blocked ? (
        <ButtonLink href={action.href} variant="primary" size="md" className="w-full sm:w-auto">
          {action.minutes > 0 ? `Start ${action.minutes}-minute step` : "See progress"}
        </ButtonLink>
      ) : (
        <p className="text-xs text-ink3">{mission.evidence.at(-1)}. Revise cannot prove this yet.</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer select-none text-ink2">Plan and evidence</summary>
        <ol className="mt-2 space-y-1 text-ink2">
          {mission.stages.map((s) => (
            <li key={s.kind} className={s.done ? "line-through opacity-70" : s === mission.current ? "font-medium text-ink" : ""}>
              {s.title}{s.minutes ? `, ${s.minutes} min` : ""}: {s.reason}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink3">Open {r.open} · awaiting proof {r.awaitingProof} · proven {r.proven} of {r.previouslyLost} marks lost</p>
        <p className="mt-1 text-xs text-ink3">{mission.completionCondition}</p>
      </details>
    </div>
  );
}

/** The mission that starts from one paper's autopsy. */
export function PaperMission({ paperId, title }: { paperId: string; title: string }) {
  const ev = useRecoveryEvidence();
  const mission = useMemo(
    () => buildPaperMission(paperId, { mistakes: ev.mistakes, recovery: ev.recovery, patterns: ev.patterns, daysToExam: ev.daysToExam, unseenByTopic: ev.unseenByTopic, supplyByTopic: ev.supplyByTopic, topicTitle: ev.topicTitle, repairWeight: ev.repairWeight, paperTitles: { [paperId]: title } }),
    [ev, paperId, title],
  );
  if (!mission) return null;
  return <div className="rounded-[8px] border border-line px-3 py-3"><MissionView mission={mission} /></div>;
}
