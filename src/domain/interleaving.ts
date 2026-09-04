// ---------------------------------------------------------------------------
// Interleaving — mixing similar concepts so students practise *choosing* the
// method, not just executing the named one.
//
// Blocked practice (five respiration questions in a row) hides the hardest
// step: recognising which method a question needs. Interleaved practice makes
// that step explicit. Pairs come from two deterministic signals, strongest
// first: topics whose mistakes hit the *same misconception-library entry*
// (observed confusion), and topics sharing a spec point (structural
// nearness).
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { Id, Mistake, Topic } from "./types";

export interface ConfusionPair {
  a: Id;
  b: Id;
  /** Why these two are confusable, for the explanation UI. */
  reason: string;
}

/**
 * Confusion pairs from mistake evidence: two topics whose unresolved mistakes
 * matched the same misconception-library entry are actively confusable.
 */
export function confusionPairsFromMistakes(mistakes: Mistake[]): ConfusionPair[] {
  const byEntry = new Map<string, Set<Id>>();
  for (const m of mistakes) {
    if (m.resolved || !m.misconceptionEntryId) continue;
    const topics = byEntry.get(m.misconceptionEntryId) ?? new Set<Id>();
    if (m.topicId) topics.add(m.topicId);
    byEntry.set(m.misconceptionEntryId, topics);
  }
  const pairs: ConfusionPair[] = [];
  for (const [entryId, topics] of byEntry) {
    const list = [...topics].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        pairs.push({ a: list[i], b: list[j], reason: `Both mistakes matched misconception ${entryId}` });
      }
    }
  }
  return pairs;
}

/**
 * Confusion pairs from structure: distinct topics that share a spec point
 * teach overlapping ground, so a question could belong to either.
 */
export function confusionPairsFromTopics(topics: Topic[]): ConfusionPair[] {
  const bySpecPoint = new Map<string, Id[]>();
  for (const t of topics) {
    for (const sp of t.specPoints ?? []) {
      const list = bySpecPoint.get(sp.id) ?? [];
      if (!list.includes(t.id)) list.push(t.id);
      bySpecPoint.set(sp.id, list);
    }
  }
  const pairs: ConfusionPair[] = [];
  for (const [specId, list] of bySpecPoint) {
    if (list.length < 2) continue;
    const sorted = [...list].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        pairs.push({ a: sorted[i], b: sorted[j], reason: `Both cover spec point ${specId}` });
      }
    }
  }
  return pairs;
}

/**
 * Interleave a question queue: alternate between the two topics of a confusion
 * pair so consecutive questions demand a method *choice*. The input order
 * breaks ties, so the output stays deterministic.
 */
export function interleave<T extends { topicId: Id }>(items: T[], pair: ConfusionPair): T[] {
  const inPair = items.filter((q) => q.topicId === pair.a || q.topicId === pair.b);
  const rest = items.filter((q) => q.topicId !== pair.a && q.topicId !== pair.b);
  const a = inPair.filter((q) => q.topicId === pair.a);
  const b = inPair.filter((q) => q.topicId === pair.b);

  const mixed: T[] = [];
  let ai = 0;
  let bi = 0;
  // Alternate, preferring the side that is behind, so runs of one topic never
  // form even when one side runs dry mid-queue.
  while (ai < a.length || bi < b.length) {
    const takeA =
      bi >= b.length ||
      (ai < a.length && ai <= bi);
    if (takeA && ai < a.length) mixed.push(a[ai++]);
    else if (bi < b.length) mixed.push(b[bi++]);
    else if (ai < a.length) mixed.push(a[ai++]);
  }
  return [...mixed, ...rest];
}

/**
 * Detect a confusion pattern from results: consecutive wrong answers on both
 * sides of a pair mean the student cannot tell the methods apart yet.
 */
export function detectConfusion(
  results: Array<{ topicId: Id; correct: boolean }>,
  pairs: ConfusionPair[],
): ConfusionPair | null {
  for (const pair of pairs) {
    const wrongA = results.some((r) => r.topicId === pair.a && !r.correct);
    const wrongB = results.some((r) => r.topicId === pair.b && !r.correct);
    if (wrongA && wrongB) return pair;
  }
  return null;
}
