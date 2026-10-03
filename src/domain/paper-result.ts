// ---------------------------------------------------------------------------
// One paper result, as the learner reads it: marks lost, where, the likely
// reason, what is recoverable now, the single next step and one of the six
// state words. A projection of the paper recovery and its mission; it keeps no
// evidence of its own and never calls a mark recovered because work was done.
// ---------------------------------------------------------------------------

import { missionNextAction, type ExamMission } from "./exam-mission";
import { missionLearnerState, type LearnerState } from "./learner-state";
import { missionHref } from "./mission-session";
import type { PaperRecovery } from "./paper-recovery";
import type { Id } from "./types";

export interface PaperResult {
  score: number;
  max: number;
  lost: number;
  /** Absent when no marks were lost: there is nothing to recover or prove. */
  state: LearnerState | null;
  where: Array<{ topicId: Id; marks: number }>;
  reason: string | null;
  /** Marks still needing work, including early successes that are not proven. */
  recoverable: number;
  next: { href: string; label: string; minutes: number } | null;
  after: string | null;
  statement: string;
  /** When Revise will check again, or why it cannot. */
  check: string | null;
}

const STATEMENT: Record<LearnerState, string> = {
  "not-checked": "Not checked yet: none of these marks have been revised.",
  "needs-work": "Needs work: these marks have not been won back yet.",
  improving: "This is improving, but not proven yet.",
  "awaiting-proof": "Early success on a different question. It counts as recovered only after a later independent check.",
  proven: "Proven: these marks held on a new question after a delay.",
  regressed: "Regressed: marks you had recovered were lost again.",
};

const round = (n: number) => Math.round(n * 10) / 10;
const marks = (n: number) => `${round(n)} mark${n === 1 ? "" : "s"}`;

export function buildPaperResult(input: { recovery: PaperRecovery; mission: ExamMission | null; nextCheckAt?: string; now: Date }): PaperResult {
  const { recovery: r, mission } = input;
  const lost = r.totals.previouslyLost;
  const byTopic = new Map<Id, number>();
  const byCause = new Map<string, { label: string; marks: number; recurring: boolean }>();
  for (const l of r.losses) {
    byTopic.set(l.topicId, (byTopic.get(l.topicId) ?? 0) + l.marksLost);
    const c = byCause.get(l.cause) ?? { label: l.causeLabel, marks: 0, recurring: false };
    byCause.set(l.cause, { ...c, marks: c.marks + l.marksLost, recurring: c.recurring || l.recurring });
  }
  const where = [...byTopic].map(([topicId, m]) => ({ topicId, marks: round(m) })).sort((a, b) => b.marks - a.marks || a.topicId.localeCompare(b.topicId)).slice(0, 3);
  const top = [...byCause.values()].filter((c) => c.label).sort((a, b) => b.marks - a.marks || a.label.localeCompare(b.label))[0];
  const reason = top ? `Mostly ${top.label.toLowerCase()} (${marks(top.marks)})${top.recurring ? ", which has cost marks before" : ""}.` : null;

  const state: LearnerState | null = lost <= 0 ? null : mission ? missionLearnerState(mission.status, mission.recovery) : r.totals.regressed > 0 ? "regressed" : r.totals.proven >= lost ? "proven" : r.totals.provisional > 0 ? "improving" : "needs-work";
  const recoverable = round(r.totals.open + r.totals.provisional);

  let next: PaperResult["next"] = null;
  let after: string | null = null;
  let check: string | null = null;
  if (mission && state !== "proven" && mission.current.kind !== "complete") {
    const action = missionNextAction(mission);
    after = action.after;
    if (action.blocked) {
      check = "There aren't enough new questions to prove this yet. You can still practise it, but it won't count as recovered.";
      next = { href: missionHref(mission.id, "practise"), label: `Practise ${marks(recoverable)}`, minutes: Math.max(5, mission.stages.find((s) => s.kind === "practise")?.minutes ?? 10) };
    } else {
      const verb = state === "awaiting-proof" ? "Prove" : "Recover";
      next = { href: action.href, label: `${verb} ${marks(Math.max(recoverable, r.totals.awaitingProof))}`, minutes: action.minutes };
    }
  }
  if (!check && input.nextCheckAt && state === "awaiting-proof") {
    const days = Math.ceil((Date.parse(input.nextCheckAt) - input.now.getTime()) / 86_400_000);
    check = days > 0 ? `Revise will check this again in ${days} day${days === 1 ? "" : "s"}.` : "Revise can check this on a different question now.";
  }
  const statement = state ? STATEMENT[state] : "No marks were lost on this paper.";
  return { score: round(r.score), max: round(r.max), lost: round(lost), state, where, reason, recoverable, next, after, statement, check };
}
