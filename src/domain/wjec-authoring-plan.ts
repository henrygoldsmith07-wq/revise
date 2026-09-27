import type { Id } from "./types";

export type WjecCoreDemand = "recall" | "application" | "transfer";

export interface WjecAuthoringGap {
  specPointId: Id;
  topicId: Id;
  currentQuestionCount: number;
  independentQuestionDeficit: number;
  missingCategories: WjecCoreDemand[];
}

export interface WjecAuthoringBrief {
  sequence: number;
  topicId: Id;
  targetSpecPointIds: Id[];
  requiredDemand: WjecCoreDemand;
  requiredNewFamily: true;
  closesMissingDemandFor: Id[];
  zeroCoverageTargets: Id[];
  estimatedIndependentSlotReduction: number;
  rationale: string;
}

type MutableGap = WjecAuthoringGap & { missing: Set<WjecCoreDemand> };

const CORE_DEMANDS: readonly WjecCoreDemand[] = ["recall", "application", "transfer"];

function candidateScore(rows: readonly MutableGap[], demand: WjecCoreDemand): number {
  return rows.reduce((score, row) => score +
    (row.currentQuestionCount === 0 ? 10_000 : 0) +
    (row.missing.has(demand) ? 1_000 : 0) +
    row.independentQuestionDeficit * 100 + 1, 0);
}

/**
 * Greedy operational plan for closing the authored flagship ceiling.
 *
 * Each brief asks for one genuinely new question family. It may target several
 * statements in one topic, but never pretends that planning or authoring is a
 * human approval. The simulation only reduces deficits that the proposed
 * question could actually address.
 */
export function buildWjecAuthoringPlan(gaps: readonly WjecAuthoringGap[], limit = 12): WjecAuthoringBrief[] {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const remaining: MutableGap[] = gaps.map((gap) => ({ ...gap, missing: new Set(gap.missingCategories) }));
  const briefs: WjecAuthoringBrief[] = [];

  while (briefs.length < safeLimit) {
    const open = remaining.filter((row) => row.independentQuestionDeficit > 0 || row.missing.size > 0);
    if (!open.length) break;

    let best: { topicId: Id; demand: WjecCoreDemand; rows: MutableGap[]; score: number } | null = null;
    const topics = [...new Set(open.map((row) => row.topicId))].sort();
    for (const topicId of topics) {
      const topicRows = open.filter((row) => row.topicId === topicId);
      for (const demand of CORE_DEMANDS) {
        const eligible = topicRows
          .filter((row) => row.missing.has(demand) || row.independentQuestionDeficit > 0)
          .sort((left, right) => {
            const leftDemand = left.missing.has(demand) ? 1 : 0;
            const rightDemand = right.missing.has(demand) ? 1 : 0;
            return (right.currentQuestionCount === 0 ? 1 : 0) - (left.currentQuestionCount === 0 ? 1 : 0) ||
              rightDemand - leftDemand ||
              right.independentQuestionDeficit - left.independentQuestionDeficit ||
              left.specPointId.localeCompare(right.specPointId);
          })
          .slice(0, 3);
        if (!eligible.length) continue;
        const score = candidateScore(eligible, demand);
        if (!best || score > best.score || (score === best.score && `${topicId}:${demand}` < `${best.topicId}:${best.demand}`)) {
          best = { topicId, demand, rows: eligible, score };
        }
      }
    }
    if (!best) break;

    const closesMissingDemandFor = best.rows.filter((row) => row.missing.has(best!.demand)).map((row) => row.specPointId);
    const zeroCoverageTargets = best.rows.filter((row) => row.currentQuestionCount === 0).map((row) => row.specPointId);
    const estimatedIndependentSlotReduction = best.rows.filter((row) => row.independentQuestionDeficit > 0).length;
    const targetSpecPointIds = best.rows.map((row) => row.specPointId);
    briefs.push({
      sequence: briefs.length + 1,
      topicId: best.topicId,
      targetSpecPointIds,
      requiredDemand: best.demand,
      requiredNewFamily: true,
      closesMissingDemandFor,
      zeroCoverageTargets,
      estimatedIndependentSlotReduction,
      rationale: [
        zeroCoverageTargets.length ? `${zeroCoverageTargets.length} zero-coverage statement(s)` : null,
        closesMissingDemandFor.length ? `${closesMissingDemandFor.length} missing ${best.demand} demand(s)` : null,
        estimatedIndependentSlotReduction ? `${estimatedIndependentSlotReduction} independent-count slot(s)` : null,
      ].filter(Boolean).join("; "),
    });

    for (const row of best.rows) {
      if (row.independentQuestionDeficit > 0) row.independentQuestionDeficit -= 1;
      row.currentQuestionCount += 1;
      row.missing.delete(best.demand);
    }
  }
  return briefs;
}
