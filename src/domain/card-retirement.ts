import type { Attempt, Card, Id, Mistake, Question } from "./types";

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

// ---------------------------------------------------------------------------
// Mistakes, attempts and mistake cards recorded on a topic that has since
// left its subject's tree.
//
// Their question usually survived the rebuild under the same id, retagged to
// the new outline (src/content/gcse-question-scope.ts). Such a record is read
// on the topic its question now sits on: a lost mark on a GCSE acceleration
// question is debt on GCSE "Speed and acceleration", not on an A-level topic
// the course no longer has (which Today showed as a raw topic id, with no
// question left to repair it). When the question is gone, or was withheld as
// A-level material, the mistake is retired: hidden from Today, missions and
// the learner model, never deleted. Nothing is rewritten to move it: the
// relocation is derived on every read. A relocated mistake the learner then
// works on (a retest, a repair) is saved as it was read, on its current topic.
// ---------------------------------------------------------------------------

type QuestionTopics = Pick<Question, "id" | "subjectId" | "topicIds" | "parts">;

const orphaned = (subjectId: Id, topicId: Id, loaded: LoadedTopics) => loaded.subjects.has(subjectId) && !loaded.topics.has(topicId);

/** The loaded topic a question part now sits on in this subject, if any. */
function currentTopic(question: QuestionTopics | undefined, subjectId: Id, partId: Id | undefined, loaded: LoadedTopics): Id | undefined {
  if (!question || question.subjectId !== subjectId) return undefined;
  const part = partId ? question.parts.find((candidate) => candidate.id === partId) : undefined;
  const fromPart = part?.specPointIds?.map((id) => id.replace(/\.sp-\d+$/, "")).find((id) => loaded.topics.has(id));
  if (fromPart) return fromPart;
  const topics = question.topicIds.filter((id) => loaded.topics.has(id));
  // Without the part, a question on several topics names none of them.
  return topics.length === 1 ? topics[0] : undefined;
}

/** The mistake on its current topic, itself when nothing moved, or null when it is retired. */
export function relocatedMistake<M extends Pick<Mistake, "subjectId" | "topicId" | "questionId" | "partId">>(
  mistake: M,
  loaded: LoadedTopics,
  questionsById: ReadonlyMap<Id, QuestionTopics>,
): M | null {
  if (!orphaned(mistake.subjectId, mistake.topicId, loaded)) return mistake;
  const topicId = currentTopic(mistake.questionId ? questionsById.get(mistake.questionId) : undefined, mistake.subjectId, mistake.partId, loaded);
  return topicId ? { ...mistake, topicId } : null;
}

/** The attempt with each orphaned topic replaced by its question's current ones; itself when none is orphaned. */
export function relocatedAttempt<A extends Pick<Attempt, "subjectId" | "topicIds" | "questionId">>(
  attempt: A,
  loaded: LoadedTopics,
  questionsById: ReadonlyMap<Id, QuestionTopics>,
): A {
  if (!attempt.topicIds.some((id) => orphaned(attempt.subjectId, id, loaded))) return attempt;
  const question = questionsById.get(attempt.questionId);
  const current = question && question.subjectId === attempt.subjectId ? question.topicIds.filter((id) => loaded.topics.has(id)) : [];
  // A withheld question's attempt keeps its old topics: they match no loaded
  // topic, so they move no mastery, and the record stays as it was.
  if (current.length === 0) return attempt;
  const kept = attempt.topicIds.filter((id) => !orphaned(attempt.subjectId, id, loaded));
  return { ...attempt, topicIds: [...new Set([...kept, ...current])] };
}

export interface RelocatedRecords<M, A, C> {
  mistakes: readonly M[];
  attempts: readonly A[];
  cards: readonly C[];
}

/**
 * Every record read on the current trees: seed cards retired, mistakes and
 * attempts relocated or retired, and a mistake's card moved with its
 * mistake. Each array is returned as given when nothing in it changed.
 */
export function liveRecords<
  M extends Pick<Mistake, "id" | "subjectId" | "topicId" | "questionId" | "partId">,
  A extends Pick<Attempt, "subjectId" | "topicIds" | "questionId">,
  C extends Pick<Card, "origin" | "subjectId" | "topicId" | "sourceMistakeId">,
>(records: RelocatedRecords<M, A, C>, loaded: LoadedTopics, questions: readonly QuestionTopics[]): RelocatedRecords<M, A, C> {
  const cards = liveCards(records.cards, loaded);
  const anyOrphan =
    records.mistakes.some((m) => orphaned(m.subjectId, m.topicId, loaded)) ||
    records.attempts.some((a) => a.topicIds.some((id) => orphaned(a.subjectId, id, loaded)));
  if (!anyOrphan) return { ...records, cards };
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const moved = new Map<Id, Id>();
  const mistakes = records.mistakes.flatMap((mistake) => {
    const live = relocatedMistake(mistake, loaded, questionsById);
    if (live && live !== mistake) moved.set(mistake.id, live.topicId);
    return live ? [live] : [];
  });
  const attempts = records.attempts.map((attempt) => relocatedAttempt(attempt, loaded, questionsById));
  const relocatedCards = moved.size === 0 ? cards : cards.map((card) => {
    const topicId = card.sourceMistakeId && card.topicId !== moved.get(card.sourceMistakeId) ? moved.get(card.sourceMistakeId) : undefined;
    return topicId && orphaned(card.subjectId, card.topicId, loaded) ? { ...card, topicId } : card;
  });
  const same = <T>(next: readonly T[], prev: readonly T[]) => (next.length === prev.length && next.every((item, i) => item === prev[i]) ? prev : next);
  return { mistakes: same(mistakes, records.mistakes), attempts: same(attempts, records.attempts), cards: same(relocatedCards, cards) };
}
