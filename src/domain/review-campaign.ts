import { buildReviewPriorities, type ReviewPriorityInput } from "./review-priority";
import { reviewStateOf } from "./review-workflow";

export function buildReviewCampaign(input: ReviewPriorityInput & { limit?: number; minuteBudget?: number }) {
  const limit = input.limit ?? 25;
  const budget = input.minuteBudget ?? Infinity;
  if (!Number.isInteger(limit) || limit < 1 || !((Number.isFinite(budget) && budget > 0) || budget === Infinity)) throw new Error("Campaign needs a positive integer limit and positive minute budget.");
  const report = buildReviewPriorities({ ...input, optimiseReviewerTime: true });
  const byId = new Map(input.questions.map(q => [q.id, q]));
  let minutes = 0;
  const seen = new Set<string>();
  // Prefix only: later marginal unlocks depend on promotions earlier in the queue.
  const items = [];
  for (const row of report.queue) {
    if (seen.has(row.questionId)) continue;
    if (items.length >= limit || minutes + row.reviewMinutes > budget) break;
    seen.add(row.questionId);
    minutes += row.reviewMinutes;
    const state = reviewStateOf(byId.get(row.questionId)!, input.auditEvents ?? []);
    items.push({ ...row, rank: items.length + 1, topic: input.topics.find(t => t.id === row.topicId)?.title ?? row.topicId,
      reviewer1Approved: state.approvers.length >= 1, reviewer2Required: state.approvalsNeeded > 0,
      readyForPromotion: state.stage === "verified", priorReviewerIds: state.approvers,
      similarTrustedQuestion: false, // covered clusters were excluded by review-priority
    });
  }
  return { items, estimatedReviewerMinutes: minutes, approvalsNeeded: items.reduce((n, i) => n + i.reviewsNeeded, 0),
    unselectedCandidates: report.queue.length - items.length,
    assumptions: "Minutes estimate independent solving plus marking/spec checks and recording. Unlocks are conditional on approving and promoting every earlier item. Reskin clusters count once; no reviews are inferred.",
    subjects: report.subjects, topics: report.topics };
}
