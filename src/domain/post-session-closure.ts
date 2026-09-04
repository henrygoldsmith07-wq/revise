export type PostSessionKind = "review" | "practice" | "paper";
export type PostSessionNextAction = "mistakes" | "practice" | "today";

export interface PostSessionClosureInput {
  session: PostSessionKind;
  attempted: number;
  total: number;
  awarded?: number;
  available?: number;
  retryCount?: number;
  elapsedMs: number;
}

export interface PostSessionClosure {
  attempted: number;
  total: number;
  completionPercent: number;
  awardedMarks: number;
  availableMarks: number | null;
  scorePercent: number | null;
  missedMarks: number;
  retryCount: number;
  minutes: number;
  headline: string;
  detail: string;
  nextAction: PostSessionNextAction;
}

function roundedPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function buildPostSessionClosure(input: PostSessionClosureInput): PostSessionClosure {
  const attempted = Math.max(0, input.attempted);
  const total = Math.max(0, input.total);
  const awardedMarks = Math.max(0, input.awarded ?? 0);
  const availableMarks = input.available != null ? Math.max(0, input.available) : null;
  const retryCount = Math.max(0, input.retryCount ?? 0);
  const completionPercent = total ? roundedPercent(attempted / total) : 0;
  const scorePercent = availableMarks ? roundedPercent(awardedMarks / availableMarks) : null;
  const missedMarks = availableMarks == null ? 0 : Math.max(0, availableMarks - awardedMarks);
  const minutes = Math.max(1, Math.round(Math.max(0, input.elapsedMs) / 60_000));
  const needsRepair = retryCount > 0 || (scorePercent != null && scorePercent < 70);
  const nextAction: PostSessionNextAction =
    attempted === 0 ? "today" : needsRepair ? "mistakes" : input.session === "review" ? "today" : "practice";

  let headline = "Session closed";
  if (attempted === 0) headline = "Nothing to close yet";
  else if (scorePercent != null && scorePercent >= 85) headline = "Strong close — keep the gain";
  else if (scorePercent != null && scorePercent >= 70) headline = "Solid close — keep the momentum";
  else if (scorePercent != null) headline = "Useful close — the gaps are clear";

  let detail: string;
  if (attempted === 0) {
    detail = "No work was recorded, so nothing has been changed.";
  } else if (needsRepair && missedMarks > 0) {
    detail = `You dropped ${missedMarks} mark${missedMarks === 1 ? "" : "s"}. Review the mistakes while they are still fresh.`;
  } else if (retryCount > 0) {
    detail = `${retryCount} card${retryCount === 1 ? "" : "s"} needed another pass. Review them again before they fade.`;
  } else if (scorePercent != null) {
    detail = `You secured ${awardedMarks}/${availableMarks} marks. Keep the momentum with one more focused practice block.`;
  } else if (input.session === "review") {
    detail = "Your cards have been rescheduled from the grades you gave them.";
  } else {
    detail = "Your work is recorded. Choose a focused next step while the session is still fresh.";
  }

  return {
    attempted,
    total,
    completionPercent,
    awardedMarks,
    availableMarks,
    scorePercent,
    missedMarks,
    retryCount,
    minutes,
    headline,
    detail,
    nextAction,
  };
}

// ---------------------------------------------------------------------------
// Tutor-grade closure — the loop's debrief, not a scorecard.
//
// The basic closure above reports the session. The tutor closure reports what
// the student got out of it: what measurably improved, what is still weak,
// what Revise learned about them (the evidence updates), and the single best
// next action derived from the new evidence. All four lines are derived from
// the before/after capability profiles, so they stay honest — no narration
// beyond what the numbers show.
// ---------------------------------------------------------------------------

import {
  CAPABILITIES,
  capabilityState,
  DEVELOPING_THRESHOLD,
  type Capability,
  type CapabilityProfile,
} from "./capability-mastery";

export interface TutorClosureLine {
  capability: Capability;
  text: string;
}

export interface TutorClosure {
  base: PostSessionClosure;
  /** Capabilities that measurably improved this session. */
  improved: TutorClosureLine[];
  /** Capabilities that are measured and still weak. */
  stillWeak: TutorClosureLine[];
  /** What Revise learned about the student this session. */
  learned: string[];
  /** The best next action, derived from the post-session evidence. */
  nextBestAction: string;
}

function delta(before: number | null, after: number | null): number {
  if (before === null || after === null) return 0;
  return after - before;
}

export function buildTutorClosure(
  base: PostSessionClosure,
  before: CapabilityProfile,
  after: CapabilityProfile,
): TutorClosure {
  const improved: TutorClosureLine[] = [];
  const stillWeak: TutorClosureLine[] = [];
  const learned: string[] = [];

  for (const capability of CAPABILITIES) {
    const b = before[capability];
    const a = after[capability];
    const d = delta(b.score, a.score);
    if (b.score === null && a.score !== null) {
      improved.push({
        capability,
        text: `${capability} measured for the first time (${Math.round(a.score * 100)}%)`,
      });
    } else if (d > 0.02) {
      improved.push({
        capability,
        text: `${capability} improved ${Math.round(d * 100)} points`,
      });
    }
    if (capabilityState(a) === "unknown" && capabilityState(b) === "unknown") continue;
    if (a.score !== null && a.score < DEVELOPING_THRESHOLD) {
      stillWeak.push({ capability, text: `${capability} is still weak (${Math.round(a.score * 100)}%)` });
    }
    if (b.evidence <= 0 && a.evidence > 0) {
      learned.push(`First evidence on ${capability} — it started the session unknown.`);
    } else if (d <= -0.02) {
      learned.push(`${capability} evidence went backwards — the session was harder than expected.`);
    }
  }

  const weakest = stillWeak[0];
  const nextBestAction = weakest
    ? `Repair ${weakest.capability} next — guided practice on the exact gap, not more of the same.`
    : improved.length
      ? "Convert today's gain: a transfer question in a new context."
      : base.nextAction === "mistakes"
        ? "Clear the mistakes queue before starting anything new."
        : "Bank the streak: tomorrow's due reviews come first.";

  return { base, improved, stillWeak, learned, nextBestAction };
}
