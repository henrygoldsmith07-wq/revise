import type { Card, Id, Misconception, Question, Topic } from "./types";

// ---------------------------------------------------------------------------
// Search runs entirely client-side against the IndexedDB mirror, so it works
// offline and returns in a keystroke. Scoring is a small BM25-flavoured
// heuristic: exact phrase beats prefix beats scattered terms, and the title
// field outweighs the body.
// ---------------------------------------------------------------------------

export type SearchKind = "topic" | "card" | "question" | "misconception";

export interface SearchResult {
  kind: SearchKind;
  id: Id;
  title: string;
  snippet: string;
  subjectId: Id;
  topicId?: Id;
  score: number;
}

export interface SearchCorpus {
  topics: Topic[];
  cards: Card[];
  questions: Question[];
  misconceptions: Misconception[];
}

interface IndexedDoc {
  kind: SearchKind;
  id: Id;
  title: string;
  body: string;
  /** Lower-cased once, at index time — the hot loop must not re-lower-case
   *  thousands of strings on every keystroke. */
  titleLower: string;
  bodyLower: string;
  subjectId: Id;
  topicId?: Id;
}

export interface SearchIndex {
  docs: IndexedDoc[];
}

/** Build once per corpus change; search against it on every keystroke. */
export function buildSearchIndex(corpus: SearchCorpus): SearchIndex {
  const docs: IndexedDoc[] = [];

  for (const topic of corpus.topics) {
    const body = `${topic.summary} ${topic.keyPoints.join(" ")}`;
    docs.push({
      kind: "topic",
      id: topic.id,
      title: topic.title,
      body,
      titleLower: topic.title.toLowerCase(),
      bodyLower: body.toLowerCase(),
      subjectId: topic.subjectId,
      topicId: topic.id,
    });
  }
  for (const card of corpus.cards) {
    docs.push({
      kind: "card",
      id: card.id,
      title: card.front,
      body: `${card.back} ${card.tags.join(" ")}`,
      titleLower: card.front.toLowerCase(),
      bodyLower: `${card.back} ${card.tags.join(" ")}`.toLowerCase(),
      subjectId: card.subjectId,
      topicId: card.topicId,
    });
  }
  for (const question of corpus.questions) {
    const body = question.parts.map((p) => p.prompt).join(" ");
    docs.push({
      kind: "question",
      id: question.id,
      title: question.stem,
      body,
      titleLower: question.stem.toLowerCase(),
      bodyLower: body.toLowerCase(),
      subjectId: question.subjectId,
      topicId: question.topicIds[0],
    });
  }
  for (const misconception of corpus.misconceptions) {
    const body = `${misconception.example} ${misconception.explanation} ${misconception.correction}`;
    docs.push({
      kind: "misconception",
      id: misconception.id,
      title: misconception.statement,
      body,
      titleLower: misconception.statement.toLowerCase(),
      bodyLower: body.toLowerCase(),
      subjectId: misconception.subjectId,
      topicId: misconception.topicIds[0],
    });
  }

  return { docs };
}

/** Search a prebuilt index. Same ranking as `search`, without the re-indexing. */
export function searchIndex(index: SearchIndex, rawQuery: string, limit = 30): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];
  const words = terms(query);
  const out: SearchResult[] = [];

  // Titles outweigh bodies, and topics outrank cards at equal strength: a
  // student searching "photosynthesis" wants the topic, not card #214.
  const kindWeight: Record<SearchKind, number> = { topic: 3, card: 1, question: 1.2, misconception: 2 };

  for (const doc of index.docs) {
    const score =
      scoreLower(doc.titleLower, query, words, 2 * kindWeight[doc.kind]) +
      scoreLower(doc.bodyLower, query, words, 1);
    if (score <= 0) continue;
    out.push({
      kind: doc.kind,
      id: doc.id,
      title: doc.title,
      snippet: snippet(doc.body || doc.title, query),
      subjectId: doc.subjectId,
      topicId: doc.topicId,
      score,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** As scoreText, but the haystack is already lower-cased. */
function scoreLower(hay: string, query: string, words: string[], weight: number): number {
  let score = 0;
  if (hay.includes(query)) score += 10 * weight;
  for (const w of words) {
    if (hay.startsWith(w)) score += 4 * weight;
    else if (new RegExp(`\\b${escapeRegExp(w)}`).test(hay)) score += 3 * weight;
    else if (hay.includes(w)) score += 1 * weight;
  }
  return score;
}

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function scoreText(text: string, query: string, words: string[], weight: number): number {
  const hay = text.toLowerCase();
  let score = 0;
  if (hay.includes(query)) score += 10 * weight;
  for (const w of words) {
    if (hay.startsWith(w)) score += 4 * weight;
    else if (new RegExp(`\\b${escapeRegExp(w)}`).test(hay)) score += 3 * weight;
    else if (hay.includes(w)) score += 1 * weight;
  }
  return score;
}

function snippet(text: string, query: string, length = 140): string {
  const idx = text.toLowerCase().indexOf(query);
  if (idx < 0) return text.slice(0, length) + (text.length > length ? "…" : "");
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + length) + (text.length > start + length ? "…" : "");
}

export function search(corpus: SearchCorpus, rawQuery: string, limit = 30): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];
  const words = terms(query);
  const out: SearchResult[] = [];

  for (const topic of corpus.topics) {
    const score =
      scoreText(topic.title, query, words, 3) +
      scoreText(topic.summary, query, words, 1) +
      scoreText(topic.keyPoints.join(" "), query, words, 1);
    if (score > 0) {
      out.push({
        kind: "topic",
        id: topic.id,
        title: topic.title,
        snippet: snippet(topic.summary, query),
        subjectId: topic.subjectId,
        topicId: topic.id,
        score,
      });
    }
  }

  for (const card of corpus.cards) {
    const score = scoreText(card.front, query, words, 2) + scoreText(card.back, query, words, 1);
    if (score > 0) {
      out.push({
        kind: "card",
        id: card.id,
        title: card.front,
        snippet: snippet(card.back, query),
        subjectId: card.subjectId,
        topicId: card.topicId,
        score,
      });
    }
  }

  for (const question of corpus.questions) {
    const body = question.parts.map((p) => p.prompt).join(" ");
    const score = scoreText(question.stem, query, words, 2) + scoreText(body, query, words, 1);
    if (score > 0) {
      out.push({
        kind: "question",
        id: question.id,
        title: question.stem,
        snippet: snippet(body || question.stem, query),
        subjectId: question.subjectId,
        topicId: question.topicIds[0],
        score,
      });
    }
  }

  for (const misconception of corpus.misconceptions) {
    const body = `${misconception.example} ${misconception.explanation} ${misconception.correction}`;
    const score = scoreText(misconception.statement, query, words, 2) + scoreText(body, query, words, 1);
    if (score > 0) {
      out.push({
        kind: "misconception",
        id: misconception.id,
        title: misconception.statement,
        snippet: snippet(body, query),
        subjectId: misconception.subjectId,
        topicId: misconception.topicIds[0],
        score,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
