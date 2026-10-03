// ---------------------------------------------------------------------------
// Paper recovery lifecycle:
//   Paper → Autopsy → Repair → Equivalent retest → Delayed verification → Closed
//
// A paper stays open until its important losses are genuinely proven
// recovered. Completing revision never closes it. Built on the marks-recovered
// ledger and the root-cause patterns; no scoring of its own.
// ---------------------------------------------------------------------------

import type { MarkRecovery, MistakeRecovery, RecoveryTotals } from "./mark-recovery";
import { buildMistakePatterns, ROOT_CAUSE_LABEL, rootCauseOf, type MistakePattern, type PatternIntervention, type RootCause } from "./mistake-patterns";
import type { Attempt, Id, Mistake, Question } from "./types";

export type PaperRecoveryStage = "autopsy" | "repair" | "equivalent-retest" | "delayed-verification" | "closed";

export const PAPER_STAGE_ORDER: readonly PaperRecoveryStage[] = ["autopsy", "repair", "equivalent-retest", "delayed-verification", "closed"];
export const PAPER_STAGE_LABEL: Record<PaperRecoveryStage, string> = {
  autopsy: "Autopsy",
  repair: "Repair",
  "equivalent-retest": "Equivalent retest",
  "delayed-verification": "Delayed verification",
  closed: "Closed",
};

/** A loss this size, or any recurring one, must be proven before the paper closes. */
export const IMPORTANT_LOSS_MARKS = 2;

export interface PaperLoss {
  mistakeId: Id;
  topicId: Id;
  questionId?: Id;
  marksLost: number;
  cause: RootCause;
  causeLabel: string;
  recurring: boolean;
  important: boolean;
  intervention: PatternIntervention;
  recovery: MistakeRecovery["state"];
  proven: boolean;
}

export interface PaperRecovery {
  paperId: Id;
  title: string;
  score: number;
  max: number;
  totals: RecoveryTotals;
  losses: PaperLoss[];
  stage: PaperRecoveryStage;
  /** Why the paper is not closed yet, or why it is. */
  stageReason: string;
}

export interface PaperRecoveryInput {
  paperId: Id;
  title: string;
  mistakes: readonly Mistake[];
  recovery: MarkRecovery;
  attempts: readonly Attempt[];
  questions: readonly Question[];
  /** All patterns across the learner's history, so "recurring" is not limited to this paper. */
  patterns?: readonly MistakePattern[];
}

export function buildPaperRecovery(input: PaperRecoveryInput): PaperRecovery | null {
  const attemptsOnPaper = input.attempts.filter((a) => a.paperSpecId === input.paperId || a.paperId === input.paperId);
  if (!attemptsOnPaper.length) return null;
  const paperItems = input.recovery.items.filter((i) => i.paperId === input.paperId);
  const mistakeById = new Map(input.mistakes.map((m) => [m.id, m] as const));
  const patterns = input.patterns ?? buildMistakePatterns({ mistakes: input.mistakes, attempts: input.attempts, questions: input.questions });
  const score = attemptsOnPaper.reduce((s, a) => s + a.awarded, 0);
  const max = attemptsOnPaper.reduce((s, a) => s + a.max, 0);

  const losses: PaperLoss[] = paperItems.flatMap((item) => {
    const m = mistakeById.get(item.mistakeId);
    if (!m) return [];
    const cause = rootCauseOf(m);
    const pattern = patterns.find((p) => p.cause === cause);
    const recurring = Boolean(pattern?.recurring);
    return [{
      mistakeId: m.id, topicId: m.topicId, questionId: m.questionId, marksLost: m.marksLost, cause, causeLabel: ROOT_CAUSE_LABEL[cause], recurring,
      important: m.marksLost >= IMPORTANT_LOSS_MARKS || recurring,
      intervention: pattern?.intervention ?? "independent-set", recovery: item.state, proven: item.state === "proven",
    }];
  }).sort((a, b) => b.marksLost - a.marksLost || a.mistakeId.localeCompare(b.mistakeId));

  const totals = input.recovery.byPaper(input.paperId);
  const important = losses.filter((l) => l.important);
  const unproven = important.filter((l) => !l.proven);
  const any = (state: MistakeRecovery["state"]) => losses.some((l) => l.recovery === state);

  let stage: PaperRecoveryStage;
  let stageReason: string;
  if (losses.length > 0 && unproven.length === 0 && totals.regressed === 0) {
    stage = "closed";
    stageReason = "Every important loss on this paper has been proven recovered.";
  } else if (any("awaiting-proof") || any("proven")) {
    stage = "delayed-verification";
    stageReason = `${unproven.length || totals.open} important loss${unproven.length === 1 ? "" : "es"} still need a delayed check on a different question.`;
  } else if (any("provisional")) {
    stage = "equivalent-retest";
    stageReason = "Early successes so far, but not yet on a different question answered independently.";
  } else if (any("targeted")) {
    stage = "repair";
    stageReason = "Repair has started; no successful answer yet.";
  } else {
    stage = "autopsy";
    stageReason = losses.length ? "Losses are identified but not yet repaired." : "No marks were lost on this paper.";
  }
  if (!losses.length) stage = "closed";
  return { paperId: input.paperId, title: input.title, score, max, totals, losses, stage, stageReason };
}
