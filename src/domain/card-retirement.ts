import type { Card, Id } from "./types";

// ---------------------------------------------------------------------------
// Seed cards whose topic has left their subject's topic tree.
//
// Seed cards are generated from a topic's key points and installed once by
// id (putMissing never rewrites an installed card). When a subject's topic
// tree is rebuilt, as every GCSE physics subject was in the
// one-hundred-and-nineteenth pass (it had been built from the WJEC A-level
// outline), the old topics' cards stay installed: due, introduced as new
// cards, and shown in the library, though they teach the wrong course.
//
// Such a card is retired: hidden from review, the library and the learner
// model, but never deleted, so its review history stays on the device and
// in sync. Only seed cards retire; a card the learner wrote, imported or
// made from a mistake is theirs and stays. A card whose subject's topic tree
// is not loaded is never judged: its topics are unknown, not missing.
// ---------------------------------------------------------------------------

export interface LoadedTopics {
  /** Subjects whose topic tree is loaded. */
  subjects: ReadonlySet<Id>;
  /** Every loaded topic id. */
  topics: ReadonlySet<Id>;
}

export function loadedTopics(topics: ReadonlyArray<{ id: Id; subjectId: Id }>): LoadedTopics {
  return { subjects: new Set(topics.map((topic) => topic.subjectId)), topics: new Set(topics.map((topic) => topic.id)) };
}

export function retiredSeedCard(card: Pick<Card, "origin" | "subjectId" | "topicId">, loaded: LoadedTopics): boolean {
  return card.origin === "seed" && loaded.subjects.has(card.subjectId) && !loaded.topics.has(card.topicId);
}

/** The cards still in use; the same array when none is retired. */
export function liveCards<T extends Pick<Card, "origin" | "subjectId" | "topicId">>(cards: readonly T[], loaded: LoadedTopics): readonly T[] {
  const live = cards.filter((card) => !retiredSeedCard(card, loaded));
  return live.length === cards.length ? cards : live;
}
