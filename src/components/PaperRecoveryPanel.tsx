"use client";

// Paper recovery: Paper → Autopsy → Repair → Equivalent retest → Delayed
// verification → Closed. A paper stays open until its important losses are proven.

import { useMemo } from "react";
import { LEARNER_STATE_LABEL, LEARNER_STATE_TONE, recoveryLearnerState } from "@/domain/learner-state";
import { buildMistakePatterns } from "@/domain/mistake-patterns";
import { buildPaperRecovery, PAPER_STAGE_LABEL, PAPER_STAGE_ORDER, type PaperRecovery } from "@/domain/paper-recovery";
import { useStoreFields } from "@/state/store";
import { PaperMission } from "./MissionCard";
import { useRecoveryEvidence } from "./recovery-evidence";
import { Pill } from "./ui";


export function usePaperRecovery(paperId: string, title: string): PaperRecovery | null {
  const ev = useRecoveryEvidence();
  const store = useStoreFields("attempts", "questions");
  return useMemo(
    () => buildPaperRecovery({
      paperId, title, mistakes: ev.mistakes, recovery: ev.recovery, attempts: store.attempts, questions: store.questions,
      patterns: buildMistakePatterns({ mistakes: ev.mistakes, attempts: store.attempts, questions: store.questions }),
    }),
    [ev, paperId, store.attempts, store.questions, title],
  );
}

export function PaperRecoveryPanel({ paperId, title, withMission = false }: { paperId: string; title: string; withMission?: boolean }) {
  const r = usePaperRecovery(paperId, title);
  const ev = useRecoveryEvidence();
  if (!r) return null;
  const t = r.totals;
  const addressed = Math.round((t.targeted) * 10) / 10;
  const unresolved = t.open;
  const at = PAPER_STAGE_ORDER.indexOf(r.stage);
  return (
    <section aria-label={`Recovery: ${title}`} className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink2">Score {Math.round(r.score * 10) / 10} / {r.max} · {t.previouslyLost} marks lost</p>
        <ul className="mt-1 text-xs text-ink2 space-y-0.5">
          <li>{addressed} addressed</li>
          <li>{t.proven} proven recovered</li>
          <li>{t.provisional} awaiting proof or early success</li>
          <li>{unresolved} unresolved{t.regressed ? ` (${t.regressed} lost again)` : ""}</li>
        </ul>
        {t.evidence !== "adequate" ? <p className="text-[11px] text-ink3 mt-1">{t.statement}</p> : null}
      </div>
      <ol aria-label="Recovery path" className="flex flex-wrap gap-1.5 text-[11px]">
        <li className="text-ink3">Paper →</li>
        {PAPER_STAGE_ORDER.map((stage, i) => (
          <li key={stage} aria-current={stage === r.stage ? "step" : undefined} className={stage === r.stage ? "font-semibold text-ink" : i < at ? "text-ink2" : "text-ink3"}>
            {PAPER_STAGE_LABEL[stage]}{i < PAPER_STAGE_ORDER.length - 1 ? " →" : ""}
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink2">{r.stageReason}</p>
      {r.losses.length ? (
        <details>
          <summary className="cursor-pointer select-none text-sm text-ink2">What this paper shows</summary>
          <ul className="mt-2 space-y-1 text-xs text-ink2">
            {r.diagnosis.highestValue.map((h) => <li key={`${h.topicId}:${h.causeLabel}`}>Biggest loss: {ev.topicTitle(h.topicId)}, {h.marks} mark{h.marks === 1 ? "" : "s"} ({h.causeLabel}).</li>)}
            <li>{r.diagnosis.knowledgeMarks} marks look like knowledge or understanding, {r.diagnosis.techniqueMarks} like technique ({r.diagnosis.carelessMarks} of those careless or procedural).</li>
            {r.diagnosis.repeatedAcrossPapers.map((p) => <li key={p.causeLabel}>{p.causeLabel} also cost marks on {p.otherPapers} other paper{p.otherPapers === 1 ? "" : "s"}.</li>)}
            {r.diagnosis.weaklyEvidencedTopics.length ? <li>Correct here but little evidence elsewhere: {r.diagnosis.weaklyEvidencedTopics.map(ev.topicTitle).join(", ")}.</li> : null}
          </ul>
        </details>
      ) : null}
      {r.losses.length ? (
        <details>
          <summary className="cursor-pointer select-none text-sm text-ink2">Every loss and its cause</summary>
          <ul className="mt-2 divide-y divide-line">
            {r.losses.map((l) => (
              <li key={l.mistakeId} className="py-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-xs text-ink2">
                  <p className="font-medium text-ink">{ev.topicTitle(l.topicId)}: {l.marksLost} mark{l.marksLost === 1 ? "" : "s"}</p>
                  <p>Likely cause: {l.causeLabel}. {l.recurring ? "Recurring." : "Isolated so far."}</p>
                </div>
                <Pill tone={LEARNER_STATE_TONE[recoveryLearnerState(l.recovery)]}>{LEARNER_STATE_LABEL[recoveryLearnerState(l.recovery)]}</Pill>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {withMission && r.stage !== "closed" ? <PaperMission paperId={paperId} title={title} /> : null}
    </section>
  );
}
