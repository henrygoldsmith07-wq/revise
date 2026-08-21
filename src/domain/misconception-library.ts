import { tokenise } from "./marking";
import type { Id, Misconception } from "./types";

// Deterministic matching between a student's evidence and the misconception
// library. Pure: the caller supplies the entries, so the engine stays
// independent of authored content and works offline exactly like the rubric.

export interface MisconceptionMatch {
  entry: Misconception;
  /** 0–1 — how strongly the evidence carries this entry's tell-tale tokens. */
  score: number;
}

/** One entry's cumulative per-student tally, for the Progress view. */
export interface MisconceptionTally {
  entry: Misconception;
  /** How many mistakes matched this entry. */
  count: number;
  /** Total marks lost across those mistakes — the weighting that orders the list. */
  marksLost: number;
}

/**
 * Aggregate mistakes by the misconception-library entry they matched, ordered
 * by marks lost (a two-mark slip outweighs two one-mark slips). Mistakes without
 * a match (or with an id that no longer exists in the library) are ignored, so
 * the tally always names a real entry.
 */
export function tallyMisconceptions(
  mistakes: ReadonlyArray<{ misconceptionEntryId?: Id; marksLost?: number }>,
  entries: readonly Misconception[],
): MisconceptionTally[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const totals = new Map<Id, { count: number; marksLost: number }>();
  for (const m of mistakes) {
    if (!m.misconceptionEntryId) continue;
    const cur = totals.get(m.misconceptionEntryId) ?? { count: 0, marksLost: 0 };
    cur.count += 1;
    cur.marksLost += m.marksLost ?? 0;
    totals.set(m.misconceptionEntryId, cur);
  }
  return [...totals.entries()]
    .map(([id, t]) => ({ entry: byId.get(id), count: t.count, marksLost: t.marksLost }))
    .filter((r): r is MisconceptionTally => Boolean(r.entry))
    .sort((a, b) => b.marksLost - a.marksLost || b.count - a.count);
}

/** Fraction of the pattern's content tokens that appear in the evidence, 0–1. */
function coverage(pattern: string, evidence: string): number {
  const wanted = [...tokenise(pattern)];
  if (!wanted.length) return 0;
  const given = tokenise(evidence);
  const hits = wanted.filter((w) => given.has(w)).length;
  return hits / wanted.length;
}

/**
 * Match a missed mark-scheme point plus the student's answer against the
 * library. The `example` field carries the concrete wrong-answer symptom and
 * the `statement` carries the wrong belief, so the strongest of those four
 * comparisons is the score. Returns the best entry at or above 0.5, else null.
 */
export function matchMisconception(
  entries: readonly Misconception[],
  missedPoint: string,
  studentAnswer: string,
): MisconceptionMatch | null {
  let best: MisconceptionMatch | null = null;
  for (const entry of entries) {
    const score = Math.max(
      coverage(entry.example, missedPoint),
      coverage(entry.statement, missedPoint),
      coverage(entry.example, studentAnswer),
      coverage(entry.statement, studentAnswer),
    );
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= 0.5 ? best : null;
}
