// ---------------------------------------------------------------------------
// Cross-subject allocation — when Biology, French and Maths all want the same
// 90 minutes, who gets the blocks?
//
// Splitting a scarce day proportionally by deficit treats every subject as
// equally deserving of attention, but the *marginal* return of a 25-minute
// block differs wildly by day. A subject with a backlog of due cards is losing
// retrievability right now; one with marks lost in the last week is leaking
// marks it could still earn; one with nothing due, nothing lost and every
// topic secured converts the same block into almost nothing. This module ranks
// the day's candidates by expected return and hands scarce blocks to the
// strongest work first.
//
//   tier 1  reviews — due cards decay while you wait. A subject with a due
//           backlog takes what it needs before any other work is considered;
//           when the backlog itself overflows the day, the most overdue (and
//           most urgent) subjects win.
//   tier 2  evidence work — marks at risk (recent losses, open mistakes) and
//           untouched-topic breadth, scaled by exam proximity and target gap,
//           with diminishing returns so one subject does not eat the whole day.
//   tier 3  leftover capacity falls back to the deficit-weighted split, so a
//           quiet day still fills with honest keep-warm work.
//
// Honesty rules mirror the rest of the domain: the ranking is driven only by
// real evidence (due cards, open mistakes, marks lost in the window). When no
// subject carries any live signal the allocator says so (`fallback: true`)
// and the caller keeps its deficit-based split — it never manufactures a
// reason to prefer one subject over another.
//
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import type { Attempt, Card, Id, IsoDate, Mistake } from "./types";

/** A 25-minute self-testing block clears roughly this many review cards. */
export const REVIEW_CAP = 18;
/** Cards that should have been reviewed earlier weigh more than cards due today. */
export const OVERDUE_WEIGHT = 1.6;
/** Marks at risk (lost marks + open mistakes) that saturates the loss signal. */
export const LOSS_SATURATION = 6;
/** Weight of the loss signal vs untouched-topic breadth in the work tier. */
export const LOSS_WEIGHT = 0.55;
export const BREADTH_WEIGHT = 0.45;
/** Diminishing returns: each further work block on one subject is worth this much of the last. */
export const WORK_SATURATION = 0.4;
/** Below this expected value a work block is not worth displacing another subject. */
export const MIN_WORK_VALUE = 0.1;
/** How many review blocks a subject may claim in a single day. */
export const MAX_REVIEW_BLOCKS = 3;

export interface SubjectEvidence {
  subjectId: Id;
  /** Review/relearning cards due on or before today (not suspended/buried). */
  dueCards: number;
  /** Subset of dueCards that are overdue (due strictly before today). */
  overdueCards: number;
  /** Unresolved mistakes on this subject. */
  openMistakes: number;
  /** Marks lost across all attempts in the last seven days. */
  recentLossMarks: number;
}

/** Cards the FSRS schedule actually wants seen today. */
function isDue(card: Card, today: IsoDate): boolean {
  if (card.suspended) return false;
  if (card.buriedUntil != null && card.buriedUntil > today) return false; // buried: hidden until its date
  if (card.state === 0) return false; // State.New — never reviewed, not due yet
  return card.due <= today;
}

/**
 * Collapse raw study history into the per-subject evidence the allocator
 * reasons over. One call per rebuild; cheap — linear over cards/mistakes/
 * attempts. `today` is an ISO date; attempts within the last seven days are
 * counted from it.
 */
export function buildSubjectEvidence(
  cards: Card[],
  mistakes: Mistake[],
  attempts: Attempt[],
  today: IsoDate,
): Map<Id, SubjectEvidence> {
  const out = new Map<Id, SubjectEvidence>();
  const bump = (subjectId: Id, patch: Partial<SubjectEvidence>) => {
    const row = out.get(subjectId) ?? {
      subjectId,
      dueCards: 0,
      overdueCards: 0,
      openMistakes: 0,
      recentLossMarks: 0,
    };
    out.set(subjectId, { ...row, ...patch });
  };

  const weekAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  for (const card of cards) {
    if (!isDue(card, today)) continue;
    bump(card.subjectId, { dueCards: (out.get(card.subjectId)?.dueCards ?? 0) + 1 });
    if (card.due < today) {
      bump(card.subjectId, { overdueCards: (out.get(card.subjectId)?.overdueCards ?? 0) + 1 });
    }
  }
  for (const mistake of mistakes) {
    if (mistake.resolved) continue;
    bump(mistake.subjectId, { openMistakes: (out.get(mistake.subjectId)?.openMistakes ?? 0) + 1 });
  }
  for (const attempt of attempts) {
    if (attempt.createdAt.slice(0, 10) < weekAgo) continue;
    const lost = Math.max(0, attempt.max - attempt.awarded);
    if (lost <= 0) continue;
    bump(attempt.subjectId, { recentLossMarks: (out.get(attempt.subjectId)?.recentLossMarks ?? 0) + lost });
  }

  return out;
}

/**
 * How many review blocks a subject's due load justifies today. Overdue cards
 * count heavier because their retrievability has already started decaying.
 */
export function reviewBlocksNeeded(dueCards: number, overdueCards: number): number {
  if (dueCards <= 0) return 0;
  const pressure = overdueCards * OVERDUE_WEIGHT + (dueCards - overdueCards);
  return Math.min(MAX_REVIEW_BLOCKS, Math.ceil(pressure / REVIEW_CAP));
}

export type CountdownPhase = "foundation" | "application" | "technique" | "final";

export interface AllocOpportunity {
  subjectId: Id;
  /** Evidence for this subject on the date being planned. */
  dueCards: number;
  overdueCards: number;
  openMistakes: number;
  recentLossMarks: number;
  /** 0–1 mean mastery over the subject's enrolled topics. */
  masteryAvg: number;
  /** 0–1 share of the subject's topics never studied (mastery 0). */
  untouchedShare: number;
  /** Days to the subject's next exam (null when none). */
  daysToExam: number | null;
  /** Exam-proximity multiplier (1 far out, up to 2 at/inside the exam). */
  urgency: number;
  /** Target-grade multiplier (>1 when the subject is chasing a grade still out of reach). */
  targetBoost: number;
  /** Countdown strategy phase; gates first-pass breadth value near exams. */
  phase: CountdownPhase;
}

export interface AllocOutcome {
  /** True when no subject carried live evidence — caller should use its own split. */
  fallback: boolean;
  /** Blocks per subject. Sums to the requested block count when not fallback. */
  shares: Map<Id, number>;
  /** Plain-language notes on who won the day and who sat out, for the UI. */
  notes: string[];
}

/** How much untouched-topic breadth is worth in each countdown phase. */
export function breadthPhaseFactor(phase: CountdownPhase): number {
  if (phase === "final") return 0; // no new first passes this close
  if (phase === "technique") return 0.4; // marked work beats opening topics now
  return 1;
}

/**
 * Expected value of one work block on this subject right now: marks at risk
 * (losses + open mistakes) lead, untouched-topic breadth follows unless the
 * countdown has made first passes low-value, then exam proximity and the
 * target gap scale the whole thing.
 */
function workValue(opp: AllocOpportunity): number {
  const loss = Math.min(1, (opp.recentLossMarks + opp.openMistakes) / LOSS_SATURATION);
  const breadth = opp.untouchedShare * breadthPhaseFactor(opp.phase);
  const base = LOSS_WEIGHT * loss + BREADTH_WEIGHT * breadth;
  return base * opp.urgency * opp.targetBoost;
}

function hasLiveEvidence(opp: AllocOpportunity): boolean {
  return opp.dueCards > 0 || opp.overdueCards > 0 || opp.openMistakes > 0 || opp.recentLossMarks > 0;
}

/**
 * Decide who gets the scarce blocks. Returns `fallback: true` (empty shares)
 * when nothing distinguishes the subjects — the caller's deficit split is the
 * honest answer then. Otherwise: reviews first, then evidence work by expected
 * return with diminishing marginal value, and any leftover capacity goes to
 * the deficit-weighted split so quiet days still fill.
 */
export function allocateDay(blocks: number, opportunities: AllocOpportunity[]): AllocOutcome {
  const shares = new Map<Id, number>(opportunities.map((o) => [o.subjectId, 0]));
  if (blocks <= 0 || opportunities.length === 0) return { fallback: true, shares, notes: [] };
  if (!opportunities.some(hasLiveEvidence)) return { fallback: true, shares, notes: [] };

  const byId = new Map(opportunities.map((o) => [o.subjectId, o]));
  const notes: string[] = [];
  let remaining = blocks;

  // --- Tier 1: reviews. Due cards decay while anything else waits. ----------
  const claimants = opportunities
    .filter((o) => reviewBlocksNeeded(o.dueCards, o.overdueCards) > 0)
    .map((o) => ({
      opp: o,
      need: reviewBlocksNeeded(o.dueCards, o.overdueCards),
      score:
        (o.overdueCards * OVERDUE_WEIGHT + (o.dueCards - o.overdueCards)) * o.urgency * o.targetBoost,
    }))
    .sort((a, b) => b.score - a.score);

  for (const c of claimants) {
    if (remaining <= 0) break;
    const take = Math.min(c.need, remaining);
    shares.set(c.opp.subjectId, (shares.get(c.opp.subjectId) ?? 0) + take);
    remaining -= take;
    if (c.need > take) {
      notes.push(
        `${c.opp.subjectId} still has cards due — they outrank the day.`,
      );
    }
  }

  // --- Tier 2: evidence work, highest expected return first. ---------------
  const given = new Map<Id, number>();
  while (remaining > 0) {
    const best = opportunities
      .map((o) => ({
        opp: o,
        value: workValue(o) * Math.pow(WORK_SATURATION, given.get(o.subjectId) ?? 0),
      }))
      .sort((a, b) => b.value - a.value)[0];
    if (!best || best.value < MIN_WORK_VALUE) break;
    shares.set(best.opp.subjectId, (shares.get(best.opp.subjectId) ?? 0) + 1);
    given.set(best.opp.subjectId, (given.get(best.opp.subjectId) ?? 0) + 1);
    remaining -= 1;
  }

  // --- Tier 3: leftover capacity returns to the deficit-weighted split. -----
  if (remaining > 0) {
    // Weighted by how far below full mastery the subject sits, scaled by the
    // same urgency/target boost, largest-remainder so every block lands.
    const weighted = opportunities.map((o) => ({
      id: o.subjectId,
      w: Math.max(0.0001, (0.15 + (1 - o.masteryAvg)) * o.urgency * o.targetBoost),
    }));
    const total = weighted.reduce((a, x) => a + x.w, 0);
    const exact = weighted.map((x) => ({ id: x.id, exact: (x.w / total) * remaining }));
    let assigned = 0;
    for (const e of exact) {
      const take = Math.floor(e.exact);
      shares.set(e.id, (shares.get(e.id) ?? 0) + take);
      assigned += take;
    }
    const byRemainder = [...exact].sort(
      (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
    );
    let i = 0;
    while (assigned < remaining) {
      const pick = byRemainder[i % byRemainder.length];
      // Nothing to distribute to (no subjects with weight): bail rather than
      // spin on NaN modulo an empty array.
      if (!pick) break;
      shares.set(pick.id, (shares.get(pick.id) ?? 0) + 1);
      assigned += 1;
      i += 1;
    }
  }

  // A short why-today line: which subject earned the window, who waited
  // (outranked by live evidence) and who genuinely sat out (nothing at risk).
  const earner = [...shares.entries()].sort((a, b) => b[1] - a[1])[0];
  const waiting = opportunities.filter((o) => (shares.get(o.subjectId) ?? 0) === 0 && hasLiveEvidence(o));
  const idle = opportunities.filter((o) => (shares.get(o.subjectId) ?? 0) === 0 && !hasLiveEvidence(o));
  if (opportunities.length > 1 && earner) {
    const e = byId.get(earner[0]);
    const why: string[] = [];
    if (e && (e.dueCards > 0 || e.overdueCards > 0)) {
      why.push(`${e.dueCards} card${e.dueCards === 1 ? "" : "s"} due${e.overdueCards ? `, ${e.overdueCards} overdue` : ""}`);
    }
    if (e && e.recentLossMarks > 0) why.push(`${e.recentLossMarks} mark${e.recentLossMarks === 1 ? "" : "s"} lost recently`);
    if (e && e.openMistakes > 0) why.push(`${e.openMistakes} open mistake${e.openMistakes === 1 ? "" : "s"}`);
    if (why.length) notes.unshift(`${earner[0]} leads today: ${why.join(", ")}.`);
  }
  if (waiting.length && earner) {
    const names = waiting.map((o) => o.subjectId).join(", ");
    notes.push(`${names} ${waiting.length === 1 ? "waits" : "wait"} — ${earner[0]} takes the window today.`);
  }
  if (idle.length) {
    const names = idle.map((o) => o.subjectId).join(", ");
    notes.push(`${names} ${idle.length === 1 ? "sits" : "sit"} out — nothing due and no marks at risk.`);
  }

  return { fallback: false, shares, notes };
}
