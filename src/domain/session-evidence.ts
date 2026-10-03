// ---------------------------------------------------------------------------
// Session closure that answers four things: what changed, what is still weak,
// what evidence the session created, and what happens next. No XP, no generic
// congratulations, no completion percentages. Evidence counts only the
// session's own trusted attempts.
// ---------------------------------------------------------------------------

import type { LearnerState } from "./learner-state";
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
  /** Earliest moment a delayed check on a different question can count, when one is waiting. */
  nextCheckAt?: string;
}

export interface SessionEvidence {
  changed: string[];
  stillWeak: string[];
  evidence: { independent: number; correct: number; trusted: number; delayedProof: boolean; lines: string[] };
  next: string;
  /** One honest verdict for the session, in the learner's six words plus a plain sentence. */
  headline: { state: LearnerState; text: string };
  /** The standing position on lost marks after this session; empty when none were ever lost. */
  marks: string[];
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
  const waitDays = input.nextCheckAt && input.now ? Math.ceil((Date.parse(input.nextCheckAt) - input.now.getTime()) / 86_400_000) : null;
  if (after.awaitingProof > 0 && waitDays !== null && Number.isFinite(waitDays)) {
    next = waitDays > 0
      ? `Revise will check this again on a different question in ${waitDays} day${waitDays === 1 ? "" : "s"}.`
      : "Revise can check this on a different question now. It will be your next step.";
  } else if (after.awaitingProof > 0) next = `Revise will check this again on a different question at least ${MIN_PROOF_DELAY_DAYS} days after your first success.`;
  else if (after.provisional > 0) next = "Next, a different question on this topic to turn early success into evidence.";
  else if (after.open > 0) next = "Next, another repair on the open mistakes, then a different question.";
  else next = after.proven > 0 ? "Nothing open here. Revise will keep a light delayed check scheduled." : "Revise needs more answers before it can plan a check.";

  const marksLines = after.previouslyLost > 0 ? [
    `${marks(after.previouslyLost)} previously lost`,
    `${marks(after.targeted)} targeted`,
    `${marks(Math.max(0, after.provisional - after.awaitingProof))} provisionally recovered`,
    `${marks(after.awaitingProof)} awaiting delayed proof`,
    `${marks(after.proven)} proven recovered`,
    ...(after.regressed > 0 ? [`${marks(after.regressed)} lost again`] : []),
  ] : [];
  const failedIndependent = independent.length - correct.length;
  let headline: SessionEvidence["headline"];
  if (after.regressed > before.regressed) headline = { state: "regressed", text: "Regressed: marks you had recovered were lost again." };
  else if (after.proven > before.proven) headline = { state: "proven", text: "Proven: the delayed check on a different question held." };
  else if (!trusted.length) headline = { state: "not-checked", text: "Nothing was marked, so nothing has changed." };
  else if (!independent.length) headline = { state: "needs-work", text: "Needs another independent attempt: every answer used help, so it counts as practice only." };
  else if (correct.length && after.awaitingProof > before.awaitingProof) headline = { state: "awaiting-proof", text: "Repaired for now. Awaiting proof on a different question later." };
  else if (correct.length && failedIndependent === 0) headline = { state: "improving", text: "Improving, but not proven yet." };
  else if (correct.length) headline = { state: "improving", text: "Still fragile: some independent answers were right, some were not." };
  else headline = { state: "needs-work", text: "Still needs work: the independent answers did not hold up." };
  return { headline, marks: marksLines, changed, stillWeak, evidence: { independent: independent.length, correct: correct.length, trusted: trusted.length, delayedProof, lines }, next };
}
