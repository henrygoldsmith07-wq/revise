// ---------------------------------------------------------------------------
// Misconception integrity — first-class learning asset, not metadata.
//
// A misconception is useful only when the live loop can reach it: a tempting
// incorrect idea with a concrete symptom, a repair explanation, and a route
// back into the adaptive session. This module detects structural gaps without
// inventing content: duplicates, missing repair routes, and unreachable
// entries. Diagnostic/transfer question links are reported as coverage gaps
// until authored; they are never synthesised.
// ---------------------------------------------------------------------------

import type { Id, Misconception, Question, Topic } from "./types";

export interface MisconceptionIntegrityIssue {
  kind: "duplicate-statement" | "missing-repair" | "missing-symptom" | "unreachable-topic" | "missing-diagnostic-link" | "missing-transfer-link";
  misconceptionId: Id;
  detail: string;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Exact-duplicate wording, even across qualifications: one idea, one entry. */
export function findDuplicateMisconceptions(entries: readonly Misconception[]): MisconceptionIntegrityIssue[] {
  const seen = new Map<string, Misconception>();
  const out: MisconceptionIntegrityIssue[] = [];
  for (const entry of entries) {
    const key = normalise(entry.statement);
    const prior = seen.get(key);
    if (prior) {
      out.push({
        kind: "duplicate-statement",
        misconceptionId: entry.id,
        detail: `Duplicates ${prior.id} (${prior.subjectId}): identical tempting idea. Merge or differentiate the distinction.`,
      });
    } else {
      seen.set(key, entry);
    }
  }
  return out;
}

/**
 * Structural integrity: every entry needs a concrete symptom (example), a
 * repair (correction + explanation), a live topic link, and — until authored —
 * explicit diagnostic/transfer coverage gaps.
 */
export function checkMisconceptionIntegrity(input: {
  entries: readonly Misconception[];
  topics: readonly Topic[];
  questions: readonly Question[];
  /** Misconception ids that have at least one authored diagnostic probe. */
  diagnosticLinks?: ReadonlyMap<Id, Id[]> | Record<Id, Id[]>;
  /** Misconception ids that have at least one independent transfer question. */
  transferLinks?: ReadonlyMap<Id, Id[]> | Record<Id, Id[]>;
}): MisconceptionIntegrityIssue[] {
  const { entries, topics, questions } = input;
  const topicIds = new Set(topics.map((topic) => topic.id));
  const questionsByTopic = new Map<Id, number>();
  for (const question of questions) {
    for (const topicId of question.topicIds) questionsByTopic.set(topicId, (questionsByTopic.get(topicId) ?? 0) + 1);
  }
  const diagnosticLinks = input.diagnosticLinks instanceof Map
    ? input.diagnosticLinks
    : new Map(Object.entries(input.diagnosticLinks ?? {}));
  const transferLinks = input.transferLinks instanceof Map
    ? input.transferLinks
    : new Map(Object.entries(input.transferLinks ?? {}));

  const out: MisconceptionIntegrityIssue[] = [...findDuplicateMisconceptions(entries)];
  for (const entry of entries) {
    if (!entry.example.trim() || !entry.statement.trim()) {
      out.push({ kind: "missing-symptom", misconceptionId: entry.id, detail: "No concrete wrong-answer symptom; the tutor cannot recognise this in marking." });
    }
    if (!entry.correction.trim() || !entry.explanation.trim()) {
      out.push({ kind: "missing-repair", misconceptionId: entry.id, detail: "No repair route (correction + explanation); repair would be generic encouragement." });
    }
    const liveTopics = entry.topicIds.filter((id) => topicIds.has(id) && (questionsByTopic.get(id) ?? 0) > 0);
    if (!liveTopics.length) {
      out.push({
        kind: "unreachable-topic",
        misconceptionId: entry.id,
        detail: `Linked topics [${entry.topicIds.join(", ")}] have no live topic with questions; the adaptive loop cannot reach this entry.`,
      });
    }
    if (!(diagnosticLinks.get(entry.id)?.length)) {
      out.push({ kind: "missing-diagnostic-link", misconceptionId: entry.id, detail: "No authored diagnostic probe linked; add a targeted question before claiming diagnosis." });
    }
    if (!(transferLinks.get(entry.id)?.length)) {
      out.push({ kind: "missing-transfer-link", misconceptionId: entry.id, detail: "No independent transfer question linked; repair cannot be proven durable." });
    }
  }
  return out;
}

/** Repair copy the adaptive session should surface, grounded in the library entry. */
export function repairCopyFor(entry: Misconception): { title: string; body: string } {
  return {
    title: `Common trap: ${entry.statement}`,
    body: `${entry.explanation} Instead, write: ${entry.correction}`,
  };
}
