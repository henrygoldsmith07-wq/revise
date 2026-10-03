// ---------------------------------------------------------------------------
// Evidence gaps — what measurement would be most useful next, as an action.
//
// When Revise cannot tell how a student is doing, the honest recommendation is
// a short test that would settle it, not a guess. Each gap names what is
// missing, says so plainly, and carries a small bounded action.
// ---------------------------------------------------------------------------

import type { InterventionContext, InterventionKind } from "./intervention-ranking";

export type EvidenceGapKind =
  | "no-independent"
  | "no-application"
  | "no-transfer"
  | "no-recent"
  | "no-delayed"
  | "no-timed-paper"
  | "untrusted-content"
  | "low-marking-confidence";

export interface EvidenceGap {
  kind: EvidenceGapKind;
  /** Plain statement of what is known and what is not. */
  text: string;
  action: { label: string; minutes: number; intervention: InterventionKind | null };
}

export interface GapExtras {
  /** Days since the last independent answer on this topic; null when none. */
  daysSinceEvidence: number | null;
  /** Distinct questions answered unaided; repeats of the same question do not add. */
  distinctIndependent: number;
  /** All independent attempts, including repeats. */
  independentAttempts: number;
  timedPaperAttempts: number;
  /** Trusted questions available for the topic. */
  trustedQuestions: number;
  /** Marked answers whose marking confidence was too low to count. */
  lowConfidenceMarks: number;
  /** Days of exam countdown that make timed work relevant (null = unknown). */
  daysToExam: number | null;
}

const STALE_DAYS = 28;
/** Order = which gap is most worth closing first. */
const ORDER: EvidenceGapKind[] = [
  "untrusted-content", "no-independent", "low-marking-confidence", "no-application", "no-transfer", "no-delayed", "no-recent", "no-timed-paper",
];

export function evidenceGaps(ctx: InterventionContext, extras: GapExtras): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  const add = (gap: EvidenceGap) => gaps.push(gap);

  if (extras.trustedQuestions === 0) {
    add({ kind: "untrusted-content", text: "There are no reviewed questions for this topic yet, so Revise cannot count answers here as evidence.", action: { label: "Review the topic notes", minutes: 5, intervention: "first-pass-lesson" } });
  }
  if (extras.independentAttempts === 0) {
    add({ kind: "no-independent", text: "No answers without hints are recorded here, so there is nothing to judge yet.", action: { label: "Try a short unaided check", minutes: 4, intervention: "retrieval-set" } });
  } else if (extras.distinctIndependent < extras.independentAttempts && extras.distinctIndependent < 3) {
    add({ kind: "no-independent", text: "Only repeats of the same question are recorded, which does not show you can handle a different one.", action: { label: "Try different questions", minutes: 6, intervention: "independent-set" } });
  }
  if (extras.lowConfidenceMarks > 0) {
    add({ kind: "low-marking-confidence", text: `${extras.lowConfidenceMarks} answer${extras.lowConfidenceMarks === 1 ? " was" : "s were"} marked with low confidence and ${extras.lowConfidenceMarks === 1 ? "is" : "are"} not counted as evidence.`, action: { label: "Answer a clearly marked question", minutes: 6, intervention: "independent-set" } });
  }
  if (ctx.recall !== null && ctx.application === null && extras.independentAttempts > 0) {
    add({ kind: "no-application", text: ctx.recall >= 0.6 ? "Your recall looks fine, but there is not enough evidence about application yet." : "There is no evidence about applying this yet.", action: { label: "Test application", minutes: 6, intervention: "independent-set" } });
  }
  if (ctx.application !== null && ctx.application >= 0.65 && !ctx.transferProven && ctx.unseen.transfer > 0) {
    add({ kind: "no-transfer", text: "You do well on familiar questions, but you have not yet shown this on an unfamiliar one.", action: { label: "Test on an unfamiliar question", minutes: 6, intervention: "transfer-set" } });
  }
  if (ctx.delayedProofDue) {
    add({ kind: "no-delayed", text: "A delayed check on new questions is due, which is what turns a good session into proof.", action: { label: "Take the delayed check", minutes: 6, intervention: "delayed-proof-retest" } });
  }
  if (extras.daysSinceEvidence !== null && extras.daysSinceEvidence > STALE_DAYS) {
    add({ kind: "no-recent", text: `The last evidence here is ${extras.daysSinceEvidence} days old.`, action: { label: "Refresh with a short set", minutes: 5, intervention: "retrieval-set" } });
  }
  if (extras.timedPaperAttempts === 0 && extras.daysToExam !== null && extras.daysToExam >= 0 && extras.daysToExam <= 28 && extras.independentAttempts >= 5) {
    add({ kind: "no-timed-paper", text: "There is no timed-paper evidence yet, and the exam is close.", action: { label: "Do a timed section", minutes: 15, intervention: "timed-sprint" } });
  }
  return gaps.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** The single most useful gap to close, or null when evidence is broad enough. */
export function topEvidenceGap(ctx: InterventionContext, extras: GapExtras): EvidenceGap | null {
  return evidenceGaps(ctx, extras)[0] ?? null;
}
