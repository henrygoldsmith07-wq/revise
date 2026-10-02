import { buildFlagshipReviewPlan, type FlagshipReviewPlanItem } from "./flagship-trust";
import type { Id, Question, Topic } from "./types";

export interface ReviewQueueRow extends FlagshipReviewPlanItem {
  /** Plain-language reason this review unlocks the most coverage. */
  gain: string;
}

function describeGain(item: FlagshipReviewPlanItem): string {
  const parts: string[] = [];
  if (item.newStatementCoverage) parts.push(`first trusted question for ${item.newStatementCoverage} statement${item.newStatementCoverage === 1 ? "" : "s"}`);
  if (item.newCoreCategories) parts.push(`${item.newCoreCategories} missing depth slot${item.newCoreCategories === 1 ? "" : "s"} (${item.depthCategories.filter((c) => c === "recall" || c === "application" || c === "transfer").join("/")})`);
  if (!parts.length && item.progressTowardCoreCount) parts.push(`adds depth to ${item.progressTowardCoreCount} statement${item.progressTowardCoreCount === 1 ? "" : "s"} still short of four trusted items`);
  return parts.join("; ") || "no new coverage";
}

/** Existing greedy marginal-coverage plan, annotated for reviewers. Never includes already-trusted or rejected items. */
export function reviewQueue(input: {
  subjectId: Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  limit?: number;
  trustedQuestion?: (question: Question) => boolean;
  preferredQuestion?: (question: Question) => boolean;
}): ReviewQueueRow[] {
  return buildFlagshipReviewPlan(input).map((item) => ({ ...item, gain: describeGain(item) }));
}
