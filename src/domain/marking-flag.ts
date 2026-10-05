// ---------------------------------------------------------------------------
// "Flag this mark" — a learner disputing a single mark.
//
// A student looking at their feedback has exactly one thing they can act on:
// a specific mark they believe is wrong. This records that dispute at the
// granularity of one mark-scheme point, so it can be routed to a human instead
// of being lost in a support email.
//
// Rules this module keeps:
//   * The learner can flag; only a human can resolve. There is no path here
//     that awards, withdraws or adjusts a mark, and nothing in this module is
//     read by the marking engine or by any trust gate.
//   * A flag is an assertion, not evidence. It never changes awarded marks,
//     never changes question trust, and never counts towards proof.
//   * It lives on the device. Syncing is opt-in and is handled by the caller.
// ---------------------------------------------------------------------------

import type { AnswerCorpusRecord } from "./answer-corpus";
import { ANSWER_CORPUS_FORMAT_VERSION, parseAnswerCorpusJson } from "./answer-corpus";
import type { Attempt, Id, MarkedPart } from "./types";

export type MarkingFlagReason = "wrong-mark" | "unclear-question" | "wrong-scheme" | "other";

export const MARKING_FLAG_REASONS: readonly MarkingFlagReason[] = ["wrong-mark", "unclear-question", "wrong-scheme", "other"];

export const MARKING_FLAG_REASON_LABEL: Record<MarkingFlagReason, string> = {
  "wrong-mark": "This mark looks wrong",
  "unclear-question": "The question is unclear",
  "wrong-scheme": "The mark scheme looks wrong",
  other: "Something else",
};

/** Learner free text is optional everywhere. Empty is the default, not a failure. */
export const MAX_FLAG_REASON_CHARS = 500;

export interface MarkingFlag {
  id: Id;
  userId: Id;
  /** Identifies exactly which mark-scheme point is disputed. */
  attemptId: Id;
  questionId: Id;
  partId: Id;
  subjectId: Id;
  topicIds: Id[];
  /** The mark-scheme statement index within the part, when the UI exposes one. */
  schemeIndex: number | null;
  /** What the learner was shown, kept verbatim so the dispute can be understood. */
  learnerAnswer: string;
  /** What was awarded, recorded at flag time rather than re-derived later. */
  awarded: number | null;
  max: number;
  rubricFeedback: string;
  reason: MarkingFlagReason | null;
  note: string;
  /** Resolved only by a human reviewer, never by the app. */
  resolution: MarkingFlagResolution | null;
  createdAt: string;
}

export interface MarkingFlagResolution {
  status: "acknowledged" | "upheld" | "overturned" | "rejected";
  reviewerId: Id;
  reviewedAt: string;
  note: string;
}

/** Stable, content-addressed enough to be idempotent: one flag per part per attempt. */
export function markingFlagId(attemptId: Id, partId: Id): string {
  return `markflag:${attemptId}:${partId}`;
}

function clampNote(note: string): string {
  return note.trim().slice(0, MAX_FLAG_REASON_CHARS);
}

export interface CreateMarkingFlagInput {
  userId: Id;
  attempt: Attempt;
  part: MarkedPart;
  /** Index of the disputed statement inside the part's mark scheme, if the UI exposes one. */
  schemeIndex?: number | null;
  reason?: MarkingFlagReason | null;
  note?: string;
  now: string;
}

/**
 * Build a flag from the attempt and part as they were actually shown. Every
 * field is copied from stored data rather than passed in, so a flag cannot
 * claim a mark the learner never saw.
 */
export function createMarkingFlag(input: CreateMarkingFlagInput): MarkingFlag {
  const { attempt, part } = input;
  return {
    id: markingFlagId(attempt.id, part.partId),
    userId: attempt.userId,
    attemptId: attempt.id,
    questionId: attempt.questionId,
    partId: part.partId,
    subjectId: attempt.subjectId,
    topicIds: [...attempt.topicIds],
    schemeIndex: input.schemeIndex ?? null,
    // The learner's own words for this part, read from the attempt as submitted.
    learnerAnswer: attempt.answers[part.partId] ?? "",
    awarded: part.awarded,
    max: part.max,
    rubricFeedback: part.comment ?? "",
    reason: input.reason ?? null,
    note: clampNote(input.note ?? ""),
    resolution: null,
    createdAt: input.now,
  };
}

/** Replaces an existing flag on the same part rather than accumulating duplicates. */
export function upsertMarkingFlag(existing: readonly MarkingFlag[], next: MarkingFlag): MarkingFlag[] {
  const without = existing.filter((f) => !(f.attemptId === next.attemptId && f.partId === next.partId));
  return [...without, next];
}

// ---------------------------------------------------------------------------
// Export. The destination is the existing reviewer pipeline, not a new format:
// `scripts/marking-evidence.mjs` (`npm run marking:evidence:init`) reads an
// answer-corpus v2 file, and `pack` turns it into blind double-marking sheets.
// A learner's dispute is therefore exported as an answer-corpus record.
//
// The one rule that matters: a disputed mark is not a human mark. Every
// `humanMark1` / `humanMark2` / `adjudicatedMark` stays null and the record is
// `unreviewed` + `needs_review`. The app's own award travels in the sidecar
// `disputes` array, which the corpus reader ignores, rather than being written
// into a field a marker would later be trusted from. Nothing here can be
// mistaken for a human attestation.
// ---------------------------------------------------------------------------

export const MARKING_EVIDENCE_NAMESPACE = "marking:evidence" as const;
export const MARKING_EVIDENCE_FORMAT_VERSION = 1;

/** One learner's dispute, exactly as they entered it. Account id already stripped. */
export interface MarkingEvidenceDispute {
  recordId: string;
  attemptId: Id;
  partId: Id;
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  /** What the app awarded, for the marker to consider. Not a human mark. */
  appAwarded: number | null;
  maximumMarks: number;
  rubricFeedback: string;
  reason: MarkingFlagReason | null;
  note: string;
  createdAt: string;
  resolution: MarkingFlagResolution | null;
}

/**
 * An answer-corpus v2 file. `records` is what the reviewer tooling reads;
 * `disputes` is the sidecar a marker reads alongside it.
 */
export interface MarkingEvidenceFile {
  formatVersion: 2;
  benchmarkVersion: string;
  kind: typeof MARKING_EVIDENCE_NAMESPACE;
  capturedAt: string;
  anonId: string;
  records: AnswerCorpusRecord[];
  disputes: MarkingEvidenceDispute[];
}

export function exportMarkingFlags(input: {
  userId: Id;
  anonId: string;
  flags: readonly MarkingFlag[];
  capturedAt: string;
  /** Question text and mark scheme, resolved by the caller from the bank. */
  questionOf: (questionId: Id) => { questionText: string; markScheme: string[]; maximumMarks: number; topicId: Id; specification: string } | null;
}): MarkingEvidenceFile {
  const own = input.flags.filter((f) => f.userId === input.userId);
  const records: AnswerCorpusRecord[] = [];
  const disputes: MarkingEvidenceDispute[] = [];

  for (const flag of own) {
    const question = input.questionOf(flag.questionId);
    disputes.push({
      recordId: flag.id,
      attemptId: flag.attemptId,
      partId: flag.partId,
      questionId: flag.questionId,
      subjectId: flag.subjectId,
      topicIds: [...flag.topicIds],
      appAwarded: flag.awarded,
      maximumMarks: flag.max,
      rubricFeedback: flag.rubricFeedback,
      reason: flag.reason,
      note: flag.note,
      createdAt: flag.createdAt,
      resolution: flag.resolution,
    });
    if (!question) continue;
    records.push({
      id: flag.id,
      questionId: flag.questionId,
      partId: flag.partId,
      subject: flag.subjectId,
      specification: question.specification,
      topic: question.topicId,
      questionText: question.questionText,
      markScheme: question.markScheme,
      maximumMarks: question.maximumMarks,
      commandWord: "explain",
      difficulty: 3,
      questionTypeTags: [],
      studentAnswer: flag.learnerAnswer,
      // Never fabricated. These are the fields a human attestation flows through.
      humanMark1: null,
      humanMark2: null,
      adjudicatedMark: null,
      humanFeedback: null,
      identifiedMisconceptions: [],
      source: "unreviewed",
      reviewStatus: "needs_review",
      // The app's award goes in the field the corpus defines for it. It is never
      // written into humanMark1/2 or adjudicatedMark, which are the fields a
      // human attestation flows through.
      aiMark: flag.awarded,
      rubricMark: null,
      // Null on the dispute itself, but the corpus requires the field to be
      // non-empty when present, so name the marking path that produced the
      // award rather than omitting it and implying an unversioned mark.
      markingVersion: `${flag.awarded ?? 0}/${flag.max} awarded by ${"in-app marking"}${flag.resolution ? `; later ${flag.resolution.status} by a reviewer` : ""}`,
      provenance: `Learner disputed this mark in-app (flag ${flag.id}); answer captured on device, no consent attestation claimed.`,
      benchmarkVersion: "learner-dispute-v1",
      createdAt: flag.createdAt,
    } as unknown as AnswerCorpusRecord);
  }

  return {
    formatVersion: ANSWER_CORPUS_FORMAT_VERSION,
    benchmarkVersion: "learner-dispute-v1",
    kind: MARKING_EVIDENCE_NAMESPACE,
    capturedAt: input.capturedAt,
    anonId: input.anonId,
    records,
    disputes,
  };
}

export type MarkingEvidenceImport =
  | { ok: true; records: AnswerCorpusRecord[]; disputes: MarkingEvidenceDispute[] }
  | { ok: false; problems: string[] };

const REASONS = new Set<string>(MARKING_FLAG_REASONS);
const RESOLUTIONS = new Set<string>(["acknowledged", "upheld", "overturned", "rejected"]);

/**
 * Validate an evidence file. Deliberately strict: a malformed file is rejected
 * with reasons rather than partially imported, because a reviewer acting on a
 * half-parsed dispute could rule on the wrong mark.
 *
 * Records are re-validated through the corpus parser itself, so a dispute file
 * that the reviewer tooling would reject cannot be accepted here either.
 */
export function importMarkingFlags(raw: unknown): MarkingEvidenceImport {
  const problems: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, problems: ["not an object"] };
  const file = raw as Record<string, unknown>;
  if (file.kind !== MARKING_EVIDENCE_NAMESPACE) problems.push(`kind must be "${MARKING_EVIDENCE_NAMESPACE}"`);
  if (file.formatVersion !== ANSWER_CORPUS_FORMAT_VERSION) problems.push(`formatVersion must be ${ANSWER_CORPUS_FORMAT_VERSION}`);
  if (typeof file.anonId !== "string" || !file.anonId) problems.push("anonId must be a non-empty string");
  if (!Array.isArray(file.records)) problems.push("records must be an array");
  if (!Array.isArray(file.disputes)) problems.push("disputes must be an array");

  const disputes = (Array.isArray(file.disputes) ? file.disputes : []) as MarkingEvidenceDispute[];
  for (const [index, dispute] of disputes.entries()) {
    const where = `disputes[${index}]`;
    if (typeof dispute !== "object" || dispute === null) { problems.push(`${where}: not an object`); continue; }
    if (typeof dispute.recordId !== "string") problems.push(`${where}.recordId must be a string`);
    if (dispute.reason != null && !REASONS.has(String(dispute.reason))) problems.push(`${where}.reason is not a known reason`);
    if (typeof dispute.note === "string" && dispute.note.length > MAX_FLAG_REASON_CHARS) {
      problems.push(`${where}.note is longer than ${MAX_FLAG_REASON_CHARS} characters`);
    }
    if (dispute.resolution != null && (typeof dispute.resolution !== "object" || !RESOLUTIONS.has(String(dispute.resolution.status)))) {
      problems.push(`${where}.resolution.status is not a known status`);
    }
  }

  if (!problems.length && Array.isArray(file.records)) {
    const parsed = parseAnswerCorpusJson(JSON.stringify({ formatVersion: ANSWER_CORPUS_FORMAT_VERSION, benchmarkVersion: "learner-dispute-v1", records: file.records }));
    if (parsed.errors.length) problems.push(...parsed.errors);
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, records: (file.records ?? []) as AnswerCorpusRecord[], disputes };
}