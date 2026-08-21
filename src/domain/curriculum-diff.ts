// ---------------------------------------------------------------------------
// Curriculum diff tooling.
//
// Exam boards revise their specifications: statements get reworded, moved,
// added or dropped. When that happens, every card, question and deck pinned to
// a spec point can silently go stale. This module diffs two snapshots of the
// same subject (old spec version vs new) and reports exactly what changed and
// which questions reference the changed points, so a maintainer can decide
// what to re-verify instead of re-reading the whole spec.
//
// Pure and deterministic — the diff functions take plain snapshots, so they
// are trivially testable; thin helpers adapt the live registry and manifest.
// ---------------------------------------------------------------------------

import type { Id, Question, Topic } from "./types";
import { SPEC_MANIFEST, type SpecManifestEntry } from "./spec";

export interface SpecPointSnapshot {
  id: Id;
  ref?: string;
  text: string;
}

export interface TopicSnapshot {
  id: Id;
  title: string;
  specPoints: SpecPointSnapshot[];
  keyPoints: string[];
  commonErrors: string[];
}

export interface Snapshot {
  subjectId: Id;
  specVersion: string;
  topics: TopicSnapshot[];
}

export type ChangeKind = "added" | "removed" | "changed";

export interface PointChange {
  kind: ChangeKind;
  pointId: Id;
  before?: string;
  after?: string;
}

export interface TopicChange {
  topicId: Id;
  title: string;
  points: PointChange[];
  keyPointsAdded: string[];
  keyPointsRemoved: string[];
  errorsAdded: string[];
  errorsRemoved: string[];
}

export interface CurriculumDiff {
  subjectId: Id;
  beforeVersion: string;
  afterVersion: string;
  topicsAdded: Id[];
  topicsRemoved: Id[];
  topicChanges: TopicChange[];
  summary: string;
}

/** Collapse a topic into the diffable snapshot shape. */
export function snapshotTopic(topic: Topic): TopicSnapshot {
  return {
    id: topic.id,
    title: topic.title,
    specPoints: (topic.specPoints ?? []).map((sp) => ({ id: sp.id, ref: sp.ref, text: sp.text })),
    keyPoints: [...topic.keyPoints],
    commonErrors: [...topic.commonErrors],
  };
}

/** Build a subject snapshot from live `Topic[]` records (e.g. from the registry). */
export function snapshotFromTopics(
  subjectId: Id,
  specVersion: string,
  topics: Topic[],
): Snapshot {
  return { subjectId, specVersion, topics: topics.map(snapshotTopic) };
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function diffStrings(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before.map(normalized));
  const afterSet = new Set(after.map(normalized));
  return {
    added: after.filter((s) => !beforeSet.has(normalized(s))),
    removed: before.filter((s) => !afterSet.has(normalized(s))),
  };
}

/**
 * Diff two snapshots of the same subject. Topics are matched by stable id;
 * spec points by stable point id. Text changes are detected with whitespace-
 * and case-insensitive comparison so a rewording is reported, not silently
 * carried forward.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): CurriculumDiff {
  const beforeTopics = new Map(before.topics.map((t) => [t.id, t]));
  const afterTopics = new Map(after.topics.map((t) => [t.id, t]));

  const topicsAdded = after.topics
    .filter((t) => !beforeTopics.has(t.id))
    .map((t) => t.id);
  const topicsRemoved = before.topics
    .filter((t) => !afterTopics.has(t.id))
    .map((t) => t.id);

  const topicChanges: TopicChange[] = [];
  for (const [id, afterTopic] of afterTopics) {
    const beforeTopic = beforeTopics.get(id);
    if (!beforeTopic) continue;

    const beforePoints = new Map(beforeTopic.specPoints.map((p) => [p.id, p]));
    const afterPoints = new Map(afterTopic.specPoints.map((p) => [p.id, p]));

    const points: PointChange[] = [];
    for (const [pid, ap] of afterPoints) {
      const bp = beforePoints.get(pid);
      if (!bp) {
        points.push({ kind: "added", pointId: pid, after: ap.text });
      } else if (normalized(bp.text) !== normalized(ap.text)) {
        points.push({ kind: "changed", pointId: pid, before: bp.text, after: ap.text });
      }
    }
    for (const [pid, bp] of beforePoints) {
      if (!afterPoints.has(pid)) {
        points.push({ kind: "removed", pointId: pid, before: bp.text });
      }
    }

    const kp = diffStrings(beforeTopic.keyPoints, afterTopic.keyPoints);
    const err = diffStrings(beforeTopic.commonErrors, afterTopic.commonErrors);

    if (points.length || kp.added.length || kp.removed.length || err.added.length || err.removed.length) {
      topicChanges.push({
        topicId: id,
        title: afterTopic.title,
        points,
        keyPointsAdded: kp.added,
        keyPointsRemoved: kp.removed,
        errorsAdded: err.added,
        errorsRemoved: err.removed,
      });
    }
  }

  topicChanges.sort((a, b) => a.topicId.localeCompare(b.topicId));

  const changedPoints = topicChanges.reduce((n, t) => n + t.points.length, 0);
  const summary =
    topicsAdded.length || topicsRemoved.length || topicChanges.length
      ? `Spec ${before.specVersion} → ${after.specVersion}: ${topicsAdded.length} topic(s) added, ` +
        `${topicsRemoved.length} removed, ${topicChanges.length} topic(s) with content changes ` +
        `(${changedPoints} spec point(s) added/removed/reworded).`
      : `Spec ${before.specVersion} → ${after.specVersion}: no content changes detected.`;

  return {
    subjectId: before.subjectId,
    beforeVersion: before.specVersion,
    afterVersion: after.specVersion,
    topicsAdded,
    topicsRemoved,
    topicChanges,
    summary,
  };
}

/** Convenience: diff the live registry's topics for a subject at two versions. */
export function diffSubjectTopics(
  subjectId: Id,
  beforeVersion: string,
  afterVersion: string,
  beforeTopics: Topic[],
  afterTopics: Topic[],
): CurriculumDiff {
  return diffSnapshots(
    snapshotFromTopics(subjectId, beforeVersion, beforeTopics),
    snapshotFromTopics(subjectId, afterVersion, afterTopics),
  );
}

/** Questions that reference points which changed or were removed — these need re-verification. */
export function impactedQuestions(
  diff: CurriculumDiff,
  questions: Question[],
): Array<{ questionId: Id; topicId: Id; affectedPointIds: Id[] }> {
  const affected = new Map<Id, Id[]>();
  for (const change of diff.topicChanges) {
    for (const p of change.points) {
      if (p.kind === "added") continue;
      const list = affected.get(p.pointId) ?? [];
      list.push(change.topicId);
      affected.set(p.pointId, list);
    }
  }

  const out: Array<{ questionId: Id; topicId: Id; affectedPointIds: Id[] }> = [];
  for (const q of questions) {
    const hits = (q.specPointIds ?? []).filter((pid) => affected.has(pid));
    if (!hits.length) continue;
    for (const pid of hits) {
      for (const topicId of affected.get(pid) ?? []) {
        out.push({ questionId: q.id, topicId, affectedPointIds: hits });
      }
    }
  }
  return out;
}

/**
 * Which subjects in the manifest have a recorded spec version change between
 * board releases (history with more than one distinct version)? These are the
 * subjects where content is most at risk of going stale.
 */
export function recordedSpecVersionChanges(entries: SpecManifestEntry[] = SPEC_MANIFEST): Array<{
  subjectId: Id;
  specCode: string;
  versions: string[];
}> {
  const out: Array<{ subjectId: Id; specCode: string; versions: string[] }> = [];
  for (const entry of entries) {
    const versions = [
      ...new Set((entry.history ?? []).map((h) => h.version).concat(entry.version)),
    ];
    if (versions.length > 1) out.push({ subjectId: entry.subjectId, specCode: entry.specCode, versions });
  }
  return out;
}

/** True when the manifest entry's recorded version predates the given current version. */
export function specVersionOutdated(entry: SpecManifestEntry, currentVersion: string): boolean {
  return entry.version !== currentVersion;
}
