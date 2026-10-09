// ---------------------------------------------------------------------------
// Marks Ledger — two explicit tiers that are never merged or summed.
//
// A lost mark can end up in exactly one of two honest places:
//
//   · practice tier   — a post-loss success exists (same question, with help,
//                       or on unreviewed content), but nothing yet meets the
//                       canonical proof rules. Early signs, not proof.
//   · proven tier     — the canonical rules in mark-recovery.ts are met:
//                       a different, trusted, unseen question, answered
//                       unaided, at least MIN_PROOF_DELAY_DAYS after the first
//                       success.
//
// This module is a thin, pure projection over the recovery ledger; it defines
// no second scoring model. With no lost marks both tiers report zero with an
// explicit "no evidence" statement rather than a reassuring headline.
// ---------------------------------------------------------------------------

import type { MistakeRecovery } from "./mark-recovery";

export interface MarksLedgerTier {
  /** Marks in this tier. */
  marks: number;
  /** Lost-mark events in this tier. */
  count: number;
}

export interface MarksLedger {
  /** Success that is not proof yet (provisional + awaiting-proof states). */
  practice: MarksLedgerTier & {
    /** Of which: successes on content no reviewer has checked. */
    unverifiedOnlyMarks: number;
  };
  /** Canonical proof only (proven state). */
  proven: MarksLedgerTier;
  /** Still needing work (open + targeted + regressed states). */
  open: MarksLedgerTier;
  /** Plain-language headline. Never a combined score. */
  statement: string;
  /** Longer explanation for behind the "Why?" disclosure. */
  explanation: string;
}

const round = (n: number) => Math.round(n * 10) / 10;

function tier(items: readonly MistakeRecovery[]): MarksLedgerTier {
  return {
    marks: round(items.reduce((s, i) => s + i.marks, 0)),
    count: items.length,
  };
}

export function buildMarksLedger(items: readonly MistakeRecovery[]): MarksLedger {
  const practiceItems = items.filter((i) => i.state === "provisional" || i.state === "awaiting-proof");
  const provenItems = items.filter((i) => i.state === "proven");
  const openItems = items.filter((i) => i.state === "open" || i.state === "targeted" || i.state === "regressed");
  const practice = {
    ...tier(practiceItems),
    unverifiedOnlyMarks: round(practiceItems.filter((i) => i.unverifiedOnly).reduce((s, i) => s + i.marks, 0)),
  };
  const proven = tier(provenItems);
  const open = tier(openItems);

  let statement: string;
  if (!items.length) {
    statement = "No lost marks recorded yet, so there is nothing to recover or prove.";
  } else if (proven.marks === 0 && practice.marks === 0) {
    statement = `${open.marks} marks still open. Nothing recovered yet.`;
  } else if (proven.marks === 0) {
    statement = `${practice.marks} marks show early recovery on practice questions, none proven yet.`;
  } else if (practice.marks === 0 && open.marks === 0) {
    statement = `${proven.marks} marks proven recovered on trusted unseen questions.`;
  } else {
    statement = `${practice.marks} marks recovering on practice questions; ${proven.marks} marks proven on trusted unseen questions.`;
  }

  const explanation =
    "The two tiers count different things and are never added together. " +
    "“Recovered on practice” means a later answer succeeded but does not meet the proof rules " +
    "(same question, help was used, or the question has not been human-reviewed). " +
    "“Proven on trusted unseen questions” means a different, reviewed question was answered " +
    "without help after a delay. Awaiting-proof marks sit in the practice tier until that delayed check lands.";

  return { practice, proven, open, statement, explanation };
}
