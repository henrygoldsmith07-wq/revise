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
