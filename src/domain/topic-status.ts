// ---------------------------------------------------------------------------
// Per-topic status in plain language: covered / shaky / untouched.
//
// FSRS numbers (mastery, retention, stability) are the *evidence*, but a
// student reading a topic list should not have to translate "0.38 · R 0.62 ·
// 14 due" into "I need to review this". This classifier collapses the state
// into one honest word plus a sentence that says what to do about it.
//
// Rules, deliberately coarse and inspectable:
//   untouched — no cards in this topic have ever been reviewed. The topic is
//               unstarted, not bad: it must never read as a red 0%.
//   shaky     — evidence exists but the topic is not holding: mastery below
//               the covered bar, recall fading (retention < 70%), low answer
//               accuracy, or due cards sitting at the edge of forgetting.
//   covered   — evidence exists and the schedule is holding it.
//
// Pure domain: no React, no storage.
// ---------------------------------------------------------------------------

import type { TopicMastery } from "./types";

export type TopicStatus = "covered" | "shaky" | "untouched";

/** Mastery at or above which an evidenced topic counts as covered. */
export const COVERED_MASTERY = 0.6;
/** Retrievability below which a reviewed topic is treated as fading. */
export const FADING_RETENTION = 0.7;
/** A reviewed topic with due cards still counts as covered only while recall stays high. */
export const COVERED_DUE_RETENTION = 0.9;

export interface TopicStatusInfo {
  status: TopicStatus;
  /** Short label for a chip, e.g. "Shaky". */
  label: string;
  /** One plain sentence: what this means and what to do. */
  explanation: string;
}

export function classifyTopic(mastery: TopicMastery | undefined): TopicStatusInfo {
  if (!mastery || mastery.attempts <= 0) {
    return {
      status: "untouched",
      label: "Untouched",
      explanation: "No cards reviewed in this topic yet — start with the lesson or the first cards.",
    };
  }

  const fading = mastery.retention < FADING_RETENTION;
  const dueAndLowRecall = mastery.cardsDue > 0 && mastery.retention < COVERED_DUE_RETENTION;

  if (fading) {
    return {
      status: "shaky",
      label: "Shaky",
      explanation: "Recall is fading — a few of these cards are close to being forgotten. Review this topic soon.",
    };
  }
  if (mastery.accuracy < 0.5) {
    return {
      status: "shaky",
      label: "Shaky",
      explanation: "Answers here are still missing half the marks — another pass hardens it.",
    };
  }
  if (mastery.mastery < COVERED_MASTERY) {
    return {
      status: "shaky",
      label: "Shaky",
      explanation: "Getting there but not holding yet — another pass, then it should stay covered.",
    };
  }
  if (dueAndLowRecall) {
    return {
      status: "shaky",
      label: "Shaky",
      explanation: "Cards are coming due while recall is still dropping — a review now keeps it covered.",
    };
  }
  return {
    status: "covered",
    label: "Covered",
    explanation:
      "Feels solid — the schedule is holding it. A light review when cards come due keeps it that way.",
  };
}
