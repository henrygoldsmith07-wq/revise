// ---------------------------------------------------------------------------
// Session closure that answers four things: what changed, what is still weak,
// what evidence the session created, and what happens next. No XP, no generic
// congratulations, no completion percentages. Evidence counts only the
// session's own trusted attempts.
// ---------------------------------------------------------------------------

import { independentAttempt, trustworthyAttempt } from "./learning-evidence";
import type { RecoveryTotals } from "./mark-recovery";
import { MIN_PROOF_DELAY_DAYS } from "./proof-of-improvement";
import type { Attempt, Id } from "./types";

export interface SessionEvidenceInput {
  /** Attempts made in this session. */
  attempts: readonly Attempt[];
  before: RecoveryTotals;
  after: RecoveryTotals;
  topicTitle?: (id: Id) => string;
  now?: Date;
}

export interface SessionEvidence {
  changed: string[];
  stillWeak: string[];
  evidence: { independent: number; correct: number; trusted: number; delayedProof: boolean; lines: string[] };
  next: string;
}

const marks = (n: number) => `${Math.round(n * 10) / 10} mark${n === 1 ? "" : "s"}`;

export function buildSessionEvidence(input: SessionEvidenceInput): SessionEvidence {
  const title = input.topicTitle ?? ((id: Id) => id);
  const trusted = input.attempts.filter(trustworthyAttempt);
  const independent = trusted.filter(independentAttempt);
  const correct = independent.filter((a) => a.awarded / a.max >= 0.75);
  const { before, after } = input;

  const changed: string[] = [];
  if (after.proven > before.proven) changed.push(`${marks(after.proven - before.proven)} newly proven recovered.`);
  if (after.provisional > before.provisional) changed.push(`${marks(after.provisional - before.provisional)} look recovered, pending proof.`);
  if (after.regressed > before.regressed) changed.push(`${marks(after.regressed - before.regressed)} lost again after being recovered.`);
  const topicRates = new Map<Id, { a: number; m: number }>();
  for (const a of independent) for (const t of a.topicIds) topicRates.set(t, { a: (topicRates.get(t)?.a ?? 0) + a.awarded, m: (topicRates.get(t)?.m ?? 0) + a.max });
  const weakTopics = [...topicRates].filter(([, r]) => r.a / r.m < 0.6).map(([t]) => title(t));
  const strongTopics = [...topicRates].filter(([, r]) => r.a / r.m >= 0.75).map(([t]) => title(t));
  if (!changed.length && strongTopics.length) changed.push(`Independent answers went well on ${strongTopics.join(", ")}.`);
  if (!changed.length) changed.push("No change in recovered marks yet.");

  const stillWeak: string[] = [];
  if (weakTopics.length) stillWeak.push(...weakTopics.map((t) => `${t}: lost marks in this session.`));
  if (after.open > 0) stillWeak.push(`${marks(after.open)} from earlier mistakes are still open.`);
  if (after.evidence !== "adequate" && after.previouslyLost > 0) stillWeak.push("Evidence is still thin, so progress cannot be judged confidently.");

  const delayedProof = after.proven > before.proven;
  const lines = [
    `${independent.length} independent answer${independent.length === 1 ? "" : "s"}`,
    `${correct.length} correct`,
    delayedProof ? "delayed proof passed" : "no delayed proof yet",
  ];
  if (trusted.length > independent.length) lines.push(`${trusted.length - independent.length} answer${trusted.length - independent.length === 1 ? "" : "s"} used help and count as practice only`);

  let next: string;
  if (after.awaitingProof > 0) next = `Revise will check this again on a different question at least ${MIN_PROOF_DELAY_DAYS} days after your first success.`;
  else if (after.provisional > 0) next = "Next, a different question on this topic to turn early success into evidence.";
  else if (after.open > 0) next = "Next, another repair on the open mistakes, then a different question.";
  else next = after.proven > 0 ? "Nothing open here. Revise will keep a light delayed check scheduled." : "Revise needs more answers before it can plan a check.";

  return { changed, stillWeak, evidence: { independent: independent.length, correct: correct.length, trusted: trusted.length, delayedProof, lines }, next };
}
