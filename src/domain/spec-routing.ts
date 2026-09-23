// Hierarchical spec-point routing: subject -> topic -> small candidate set.
// Never classify against all spec points in one flat request.

import { getTopic, topicsFor } from "./curriculum";
import type { Id, SpecPoint, Topic } from "./types";

export const SPEC_ROUTE_MAX_CANDIDATES = 8;
export const SPEC_ROUTE_TOPIC_TOP_N = 3;

export interface SpecCandidate {
  specPointId: Id;
  topicId: Id;
  ref: string;
  text: string;
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / Math.max(1, Math.max(a.size, b.size));
}

export function candidateTopics(subjectId: Id, text: string, topN = SPEC_ROUTE_TOPIC_TOP_N): Topic[] {
  const hay = tokens(text);
  return topicsFor(subjectId)
    .map((t) => ({ t, s: overlap(hay, tokens(`${t.title} ${t.summary} ${t.keyPoints.join(" ")}`)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
    .map((r) => r.t);
}

export function candidateSpecPoints(topic: Topic, text: string, maxN = SPEC_ROUTE_MAX_CANDIDATES): SpecCandidate[] {
  const hay = tokens(text);
  const points: SpecPoint[] = topic.specPoints ?? [];
  return points
    .map((sp) => ({ sp, s: overlap(hay, tokens(`${sp.ref} ${sp.text}`)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, maxN)
    .map((r) => ({ specPointId: r.sp.id, topicId: topic.id, ref: r.sp.ref, text: r.sp.text }));
}

/** Full hierarchical route: subject -> top topics -> small candidate set. */
export function routeSpecPoints(subjectId: Id, text: string): { topics: Topic[]; candidates: SpecCandidate[] } {
  const topics = candidateTopics(subjectId, text);
  const candidates = topics.flatMap((t) => candidateSpecPoints(t, text, 4)).slice(0, SPEC_ROUTE_MAX_CANDIDATES);
  // Deterministic fallback: question's own topic first when text is thin.
  return { topics, candidates };
}

export function specPointsForCandidate(topicId: Id, candidate: SpecCandidate): SpecCandidate | null {
  const topic = getTopic(topicId);
  if (!topic) return null;
  if (topic.id !== candidate.topicId) return null;
  return candidate;
}
