// ---------------------------------------------------------------------------
// Proof actions and proof outcomes.
//
// The proof ledger in proof-of-improvement.ts is derived from attempts, never
// stored. This module is the learner-facing projection of it, plus the single
// predicate Today needs to work out which topics are due a check.
//
// It deliberately owns no arithmetic about what counts as proof: it reads
// `proofDue`, the windows and the rates the ledger already computed, so
// eligibility cannot drift between the ledger and the recommendation.
// ---------------------------------------------------------------------------

import type { Id } from "./types";
import { MIN_PER_WINDOW, type ProofLedger, type ProofStatus, type TopicProof } from "./proof-of-improvement";

/**
 * One of six plain outcomes a learner can be shown. Deliberately not the
 * ledger's `ProofStatus` vocabulary: "no clear change" and "held" both read as
 * "not proven yet" to a student, and are merged here rather than exposed raw.
 */
export type ProofOutcome =
  | "proven"
  | "improving"
  | "still-fragile"
  | "slipped"
  | "awaiting-another-check"
  | "not-enough-evidence";

export interface ProofOutcomeLabel {
  outcome: ProofOutcome;
  /** One line, in the learner's words, in the panel's pill. */
  headline: string;
  /** What the ledger actually saw, in one or two sentences. */
  detail: string;
  /** What this does not show. Never omitted: a score on one topic is not proof of wider competence. */
  limits: string;
  /** When Revise will look again, as a date, when it has a view. */
  nextCheckOn: string | null;
}

const LIMITS_NOT_PROVEN = "That does not show you would hold this in a question you had not seen, or in a different part of the paper.";

const LIMITS_PROVEN = "That does not show you would hold this in an unfamiliar context, or that it will survive until the exam if you stop revisiting it.";

const LIMITS_SLIPPED = "That does not show the topic is gone for good: it shows the evidence does not currently support calling it recovered.";

export function proofOutcomeFor(row: TopicProof, options: { now?: Date; minProofDays?: number }): ProofOutcomeLabel {
  const pct = (rate: number | null) => (rate === null ? "no answers" : `${Math.round(rate * 100)}%`);
  const before = row.before?.questions ?? 0;
  const after = row.after?.questions ?? 0;
  const share = Math.round(row.share * 100);
  const base: Omit<ProofOutcomeLabel, "outcome" | "headline" | "detail" | "limits"> = { nextCheckOn: null };

  const withOutcome = (
    outcome: ProofOutcome,
    headline: string,
    detail: string,
    nextCheckOn: string | null,
    limits = LIMITS_NOT_PROVEN,
  ): ProofOutcomeLabel => ({ ...base, outcome, headline, detail, limits, nextCheckOn });

  switch (row.status) {
    case "proven-gain": {
      return withOutcome(
        "proven",
        "Proven",
        `${pct(row.before?.rate ?? null)} to ${pct(row.after?.rate ?? null)} on new questions, ${before} before and ${after} after. That is about ${Math.max(0, row.markPoints)} points on ${share}% of the exam.`,
        null,
        LIMITS_PROVEN,
      );
    }
    case "held": {
      return withOutcome(
        "proven",
        "Held",
        `Still ${pct(row.after?.rate ?? null)} on new questions, ${after} answered since. No gain to claim, but no loss either.`,
        null,
        LIMITS_PROVEN,
      );
    }
    case "declined": {
      return withOutcome(
        "slipped",
        "Slipped",
        `${pct(row.after?.rate ?? null)} on new questions now, down from ${pct(row.before?.rate ?? null)}. Revise will not claim this as recovered, about ${Math.abs(row.markPoints)} points at stake.`,
        null,
        LIMITS_SLIPPED,
      );
    }
    case "no-clear-change": {
      return withOutcome(
        "improving",
        "Improving, not proven",
        `${pct(row.after?.rate ?? null)} on new questions against ${pct(row.before?.rate ?? null)} before. Moving, but not far enough to call proof.`,
        null,
      );
    }
    case "awaiting-proof": {
      if (row.proofDue) {
        return withOutcome(
          "awaiting-another-check",
          "Ready to check",
          `${before} independent answers set the baseline at ${pct(row.before?.rate ?? null)}. ${options.minProofDays ?? 3} days have passed, so a check on new questions would now count.`,
          null,
        );
      }
      return withOutcome(
        "not-enough-evidence",
        "Not yet",
        `Baseline is ${pct(row.before?.rate ?? null)} from ${before} answers. Revise will look again from ${row.provableFrom ?? "the first day this could count"}.`,
        row.provableFrom,
      );
    }
    case "untested":
    default: {
      return withOutcome(
        "not-enough-evidence",
        "Not enough evidence",
        before > 0
          ? `Only ${before} independent answer${before === 1 ? "" : "s"} so far; Revise needs at least ${MIN_PER_WINDOW} on questions you had not seen before it can compare anything.`
          : "No independent answers on new questions yet, so there is nothing to compare against.",
        null,
      );
    }
  }
}

export interface ProofActionFacts {
  /** Ledger rows whose delay has passed and that no mission already covers. */
  dueTopics: TopicProof[];
  /** Rows that will come due, soonest first, for the "why now" copy. */
  upcomingTopics: TopicProof[];
  /** Rows that look learned on familiar questions but not on new ones. */
  illusoryTopics: TopicProof[];
}

/**
 * Topics due a proof check, excluding those a mission is already going to
 * check. The exclusion is by topic id, so a mission on the same topic is not
 * planned twice; the check itself is one action, not a second queue.
 */
export function proofFacts(ledger: ProofLedger | null | undefined, coveredTopicIds: Iterable<Id> = []): ProofActionFacts {
  const rows = ledger?.topics ?? [];
  const covered = new Set(coveredTopicIds);
  const dueTopics = rows.filter((row) => row.proofDue && !covered.has(row.topicId));
  const upcoming = rows
    .filter((row) => !row.proofDue && row.status === "awaiting-proof" && row.provableFrom !== null && !covered.has(row.topicId))
    .sort((a, b) => Date.parse(a.provableFrom!) - Date.parse(b.provableFrom!));
  return {
    dueTopics,
    upcomingTopics: upcoming,
    illusoryTopics: rows.filter((row) => row.illusory && !covered.has(row.topicId)),
  };
}

/**
 * A check with nothing to compare it against cannot move the ledger. The
 * ledger only sets `proofDue` with a baseline, so this is a guard rather than
 * a normal path: it keeps a malformed or hand-built ledger from producing an
 * action that will never resolve.
 */
export function needsBaselineBeforeProof(row: TopicProof): boolean {
  return row.before === null || row.before.questions < MIN_PER_WINDOW;
}

export function proofStatusMilestone(status: ProofStatus): "proven" | "declined" | "awaiting" | "untested" {
  switch (status) {
    case "proven-gain":
    case "held":
      return "proven";
    case "declined":
      return "declined";
    case "awaiting-proof":
      return "awaiting";
    default:
      return "untested";
  }
}
