// ---------------------------------------------------------------------------
// Session explanation — why Revise picked this, in the optimiser's own terms.
//
// Every line is read from the evidence the optimiser scored (topic weight,
// performance on unseen questions, repeats, due retrievals, open mistakes,
// exam phase, supply, proof state). Nothing is narrated that the numbers do
// not show, and a marks claim is made only when the evidence can carry one.
// Lines are ordered by how much they matter and capped so the answer stays
// short.
// ---------------------------------------------------------------------------

import type { AdaptiveSessionPlan } from "./adaptive-contract";
import { getSubject } from "./curriculum";
import { countdownGuidance } from "./exam-countdown";
import { CONVERSION_PRIOR, proofLine, type ProofLedger } from "./proof-of-improvement";

export type ExplanationTone = "stakes" | "evidence" | "gap" | "proof";

export interface ExplanationLine {
  tone: ExplanationTone;
  text: string;
}

export interface SessionExplanation {
  /** The one line shown with the topic: what is at stake, or that evidence is still being gathered. */
  stakes: string;
  lines: ExplanationLine[];
}

const MAX_LINES = 5;

function percent(value: number): number {
  return Math.round(value * 100);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function marksRange(low: number, high: number): string {
  const lo = Math.max(0, Math.round(low));
  const hi = Math.max(lo, Math.round(high));
  return lo === hi ? `about ${hi}` : `about ${lo}–${hi}`;
}

export function explainSession(plan: AdaptiveSessionPlan, conversion?: ProofLedger["conversion"]): SessionExplanation {
  const { evidence } = plan;
  const closes = conversion ?? { rate: CONVERSION_PRIOR, pairs: 0, observed: false };
  const value = evidence.value;
  const subject = getSubject(plan.subjectId)?.name ?? plan.subjectId;
  const lines: ExplanationLine[] = [];

  let stakes: string;
  if (!value || value.proven.level === "none") {
    stakes = "Not enough evidence yet. This session measures where you are.";
  } else if (value.proven.level === "thin") {
    stakes = `You score about ${percent(value.proven.rate)}% on questions you haven't seen. That rests on little evidence so far.`;
  } else {
    stakes = `Up to ${marksRange(value.atStake.low, value.atStake.high)} marks of 100 in ${subject} are at stake here; ${marksRange(value.atStake.low * closes.rate, value.atStake.high * closes.rate)} look recoverable.`;
  }

  if (value && value.share > 0 && value.relativeWeight !== 1) {
    const heavier = value.relativeWeight > 1;
    lines.push({
      tone: "stakes",
      text: `${heavier ? "Carries more of" : "Carries less of"} the exam than an average topic: about ${percent(value.share)}% of ${subject}, by specification statements.`,
    });
  } else if (value && value.share > 0) {
    lines.push({ tone: "stakes", text: `About ${percent(value.share)}% of ${subject} sits in this topic, by specification statements.` });
  }

  if (value && value.proven.level !== "none") {
    const { rate, low, high, distinctQuestions } = value.proven;
    lines.push({
      tone: "evidence",
      text: `On questions you haven't seen, you score about ${percent(rate)}% (${percent(low)}–${percent(high)}%), from ${plural(distinctQuestions, "different question")}.`,
    });
    if (value.proven.level !== "thin") {
      lines.push({
        tone: "evidence",
        text: `Recoverable assumes a revision cycle closes about ${percent(closes.rate)}% of the gap: ${closes.observed ? `your own rate across ${plural(closes.pairs, "proven topic")}` : "a default until you have proven topics of your own"}.`,
      });
    }
    const repeats = evidence.attempts - distinctQuestions;
    if (repeats > 0 && evidence.attempts >= 2) {
      lines.push({
        tone: "evidence",
        text: `${repeats} of your ${evidence.attempts} answers repeated a question you had already seen. Repeats count for much less.`,
      });
    }
  } else {
    lines.push({ tone: "evidence", text: "No answers to new questions on this topic yet, so there is nothing to claim either way." });
  }

  const drivers: string[] = [];
  if (evidence.overdueCount) drivers.push(`${plural(evidence.overdueCount, "overdue recall check")} on this topic`);
  else if (evidence.dueCount) drivers.push(`${plural(evidence.dueCount, "recall check")} due on this topic`);
  if (evidence.openMistakes) drivers.push(`${plural(evidence.openMistakes, "open mistake")} (${evidence.marksLost} ${evidence.marksLost === 1 ? "mark" : "marks"} lost)`);
  if (evidence.retention > 0 && evidence.retention < 0.8 && evidence.dueCount + evidence.overdueCount > 0) {
    drivers.push(`memory down to about ${percent(evidence.retention)}%`);
  }
  if (drivers.length) lines.push({ tone: "evidence", text: drivers.join(" · ") + "." });

  if (evidence.daysToExam != null) {
    const guidance = countdownGuidance(evidence.daysToExam);
    lines.push({ tone: "evidence", text: `${subject} exam in ${plural(Math.max(0, evidence.daysToExam), "day")}. ${guidance.label}: ${guidance.strategy}` });
  }

  const gap = value?.gaps[0];
  if (gap) lines.push({ tone: "gap", text: gap.text });

  lines.push({ tone: "proof", text: proofLine(evidence.proof) });

  // Keep the answer short: stakes and proof always survive, the rest in order.
  const kept = lines.filter((line) => line.tone === "proof").slice(0, 1);
  const rest = lines.filter((line) => line.tone !== "proof");
  const room = MAX_LINES - kept.length;
  return { stakes, lines: [...rest.slice(0, room), ...kept] };
}
