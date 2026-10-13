import { decisionNoticeText } from "@/lib/reviewer/notice";

/** The previous decision's confirmation, carried on the URL (display only). */
export function DecisionNotice({ recorded }: { recorded: string | string[] | undefined }) {
  const text = decisionNoticeText(recorded);
  if (!text) return null;
  return (
    <p role="status" className="card px-3 py-2 text-xs text-ink2 border-l-4 border-l-[var(--accent)]">
      {text}
    </p>
  );
}

/** How much this reviewer has recorded so far, from the verified chain. Never a target or a streak. */
export function reviewerTally(events: readonly { reviewerId: string; decision: string }[], reviewerLabel: string): { decisions: number; approvals: number } {
  let decisions = 0;
  let approvals = 0;
  for (const event of events) {
    if (event.reviewerId !== reviewerLabel) continue;
    decisions++;
    if (event.decision === "approve") approvals++;
  }
  return { decisions, approvals };
}
