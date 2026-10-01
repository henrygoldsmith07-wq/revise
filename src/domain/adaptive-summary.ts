// ---------------------------------------------------------------------------
// Adaptive run summary — the session debrief from the run's own evidence.
//
// Reads only completed step records plus the plan's topic title: what
// improved, what is fragile, what was repaired, what happens later, what
// Revise learned, and the single best next action. Separated from plan
// construction and replanning so the debrief can be tested and reused
// without the tutor loop.
// ---------------------------------------------------------------------------

import { QUESTION_STEP_KINDS } from "./adaptive-budget";
import type {
  AdaptiveSessionPlan,
  AdaptiveStepKind,
  AdaptiveStepRecord,
} from "./adaptive-session";
import type { Id } from "./types";

export interface AdaptiveRunSummary {
  /** What measurably improved, per rung. */
  improved: string[];
  /** What is still fragile or unproven. */
  fragile: string[];
  /** Mistakes repaired by an independent retest this run. */
  repaired: string[];
  /** What happens later (delayed checks). */
  later: string[];
  /** What Revise learned about the student's support needs. */
  learned: string[];
  /** The single best next action, from the run evidence. */
  bestNext: string;
  /** Marks earned across the run's question rungs (0/0 when none ran). */
  marks: { awarded: number; max: number };
}

const RUNG_LABELS: Partial<Record<AdaptiveStepKind, string>> = {
  "supported-practice": "Supported application",
  "independent-application": "Independent application",
  transfer: "Unfamiliar transfer",
  "misconception-repair": "Misconception repair",
  "prerequisite-repair": "Prerequisite repair",
};

/** The tutor-grade debrief for a finished run, straight from its records. */
export function summariseAdaptiveRun(input: {
  plan: AdaptiveSessionPlan;
  completed: AdaptiveStepRecord[];
  openMistakeIds: Id[];
  /** Where this topic stands on proof, from the proof ledger. */
  proofNote?: string;
}): AdaptiveRunSummary {
  const { plan, completed, openMistakeIds, proofNote } = input;
  const questionRecords = completed.filter((record) => QUESTION_STEP_KINDS.has(record.kind));
  const questionPasses = questionRecords.filter((record) => record.result === "passed-independent");
  const assistedPasses = questionRecords.filter((record) => record.result === "passed-assisted");
  const questionMisses = questionRecords.filter(
    (record) => record.result === "missed" || record.result === "gave-up",
  );
  const repairEvidence = completed.filter((record) => record.resolvedMistakeId);
  const stillMissedRetrieval = completed
    .filter((record) => record.kind === "overdue-retrieval" && record.result === "missed")
    .flatMap((record) => record.missedItemIds ?? []);
  const scheduledLater = completed.filter(
    (record) => record.kind === "delayed-retrieval" && record.result === "scheduled",
  );

  const improved: string[] = [];
  const fragile: string[] = [];
  const repaired: string[] = [];
  const learned: string[] = [];
  const later: string[] = [];

  for (const pass of questionPasses) {
    const label = RUNG_LABELS[pass.kind] ?? "Application";
    if (pass.maxMarks > 0 && pass.awardedMarks === pass.maxMarks) {
      improved.push(`${label} of ${plan.topicTitle} demonstrated without support (full marks).`);
    } else {
      improved.push(`${label} on ${plan.topicTitle} passed without support.`);
    }
  }

  if (assistedPasses.length) {
    learned.push(
      `Some successes needed a cue or prompt — ${assistedPasses.length} assisted pass${assistedPasses.length === 1 ? "" : "es"} counted as weaker evidence than independent work.`,
    );
  }

  const fragileKinds = new Set<AdaptiveStepKind>();
  for (const miss of questionMisses) {
    fragileKinds.add(miss.kind);
  }
  const fragiles = [...fragileKinds]
    .map((kind) => RUNG_LABELS[kind] ?? kind)
    .filter((label): label is string => Boolean(label));
  if (fragiles.length) {
    fragile.push(`Still fragile: ${fragiles.join(" and ").toLowerCase()} missed a mark this session.`);
  }
  if (stillMissedRetrieval.length) {
    fragile.push(
      `${stillMissedRetrieval.length} retrieval${stillMissedRetrieval.length === 1 ? "" : "s"} did not hold — the topic's recall schedule needs another pass.`,
    );
  }
  if (openMistakeIds.length) {
    fragile.push(
      `${openMistakeIds.length} open mistake${openMistakeIds.length === 1 ? "" : "s"} remain${openMistakeIds.length === 1 ? "s" : ""} to repair across sessions.`,
    );
  }

  const repairedLines = repairEvidence.map((record) => {
    const label = RUNG_LABELS[record.kind] ?? "A retest";
    return `${label} re-earned its point independently — the mistake is closed.`;
  });
  if (repairedLines.length) {
    repaired.push(...repairedLines);
  }

  if (scheduledLater.length) {
    later.push("Delayed retrieval scheduled — the gain is only proven once it survives a delay.");
  } else {
    later.push("A delayed retrieval check is the next scheduled event for this topic.");
  }

  // Same-session marks are not proof: say what would be.
  if (proofNote) later.unshift(proofNote);

  if (!improved.length && !repairedLines.length && !questionMisses.length) {
    improved.push("This session's work is recorded; no new marks were earned or lost.");
  }

  const marks = {
    awarded: questionRecords.reduce((sum, record) => sum + record.awardedMarks, 0),
    max: questionRecords.reduce((sum, record) => sum + record.maxMarks, 0),
  };

  let bestNext: string;
  if (openMistakeIds.length) {
    bestNext = "Clear the open mistakes first — each needs an independent retest before it closes.";
  } else if (fragiles.length) {
    bestNext = "Revisit the fragile rung with support in the next session before new material.";
  } else if (!scheduledLater.length) {
    bestNext = "Queue the delayed retrieval so today's gain is tested after a delay.";
  } else {
    bestNext = "Move to the next best topic — this one has earned a delay before more practice.";
  }

  return { improved, fragile, repaired: repairedLines, later, learned, bestNext, marks };
}
