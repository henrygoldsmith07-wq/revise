// ---------------------------------------------------------------------------
// Revision sheet — one printable page per topic.
//
// Save My Exams sells condensed revision notes per topic; Seneca puts a
// summary before its questions. Revise already holds every ingredient:
// the spec summary, what earns marks, where marks are lost, the
// misconception library, and — uniquely — the student's own open mistakes
// and measured evidence. This module condenses all of it onto a single
// printable sheet, ordered by what earns marks, not by what reads nicely.
//
// Honesty rules:
//   — only trusted misconception content is included;
//   — the student's open mistakes are reported as recorded (point, command,
//     category) and never paraphrased into a confidence the record lacks;
//   — measured evidence (attempts, accuracy, mastery, forecast marks) is
//     shown only when it exists, and the sheet says "no measured evidence
//     yet" rather than inventing a baseline;
//   — the sheet is a *condensation* of authored content: nothing is
//     generated, so it stays offline-first and drift-proof.
// Pure domain: no React, no storage; `now` is passed in.
// ---------------------------------------------------------------------------

import { misconceptionsForTopic } from "@/content";
import { trustworthyAttempt } from "./learning-evidence";
import type { Attempt, Id, Mistake, Question, Topic } from "./types";

export type SheetSection = "spec" | "mark-points" | "common-errors" | "misconceptions" | "my-mistakes" | "self-check";

export interface SheetMisconception {
  statement: string;
  correction: string;
  tag?: string;
}

export interface SheetMistake {
  /** The exact mark-scheme point lost, when recorded. */
  point: string | null;
  command: string | null;
  category: Mistake["category"];
  marksLost: number;
  /** What the student said went wrong, in their own words. */
  description: string;
  when: string;
}

export interface RevisionSheet {
  topicId: Id;
  topicTitle: string;
  subjectId: Id;
  specRef: string | null;
  summary: string;
  keyPoints: string[];
  commonErrors: string[];
  misconceptions: SheetMisconception[];
  myMistakes: SheetMistake[];
  /** Evidence line for the header, or an explicit no-evidence note. */
  evidenceNote: string;
  /** Retrieval prompts generated from the spec's own key points. */
  selfCheck: string[];
  /** Rough completion state of the sheet's own inputs. */
  sectionsIncluded: SheetSection[];
  headline: string;
}

export interface RevisionSheetInput {
  topicId: Id;
  attempts: Attempt[];
  questions: Question[];
  mistakes: Mistake[];
  now?: Date;
}

const MAX_MISCONCEPTIONS = 4;
const MAX_MISTAKES = 6;

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Build a one-page revision sheet for one topic.
 *
 * `questions` are the student's attempt history; the topic's questions are
 * resolved internally so accuracy reflects the topic, not the whole subject.
 * Open (unresolved) mistakes lead the personal section — a revision sheet is
 * exactly where a recorded loss should be confronted again.
 */
export function buildRevisionSheet(input: RevisionSheetInput, topic: Topic): RevisionSheet {
  const questionById = new Map(input.questions.map((question) => [question.id, question] as const));

  // Trusted attempts on this topic's questions (or explicitly tagged with it).
  const topicAttempts = input.attempts.filter((attempt) => {
    if (attempt.subjectId !== topic.subjectId || !trustworthyAttempt(attempt)) return false;
    const question = questionById.get(attempt.questionId);
    if (question && question.topicIds.includes(topic.id)) return true;
    return attempt.topicIds.includes(topic.id) && !question;
  });
  const scorable = topicAttempts.filter((attempt) => attempt.max > 0);
  const available = scorable.reduce((sum, attempt) => sum + attempt.max, 0);
  const awarded = scorable.reduce((sum, attempt) => sum + attempt.awarded, 0);
  const accuracy = available > 0 ? awarded / available : null;

  const openMistakes = input.mistakes
    .filter((mistake) => mistake.subjectId === topic.subjectId && mistake.topicId === topic.id && !mistake.resolved)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_MISTAKES)
    .map((mistake) => ({
      point: mistake.point?.trim() || null,
      command: mistake.command ?? null,
      category: mistake.category,
      marksLost: mistake.marksLost,
      description: mistake.description,
      when: new Date(mistake.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    }));

  const misconceptions = misconceptionsForTopic(topic.id)
    .filter((misconception) => misconception.verification !== "unverified")
    .slice(0, MAX_MISCONCEPTIONS)
    .map((misconception) => ({
      statement: misconception.statement,
      correction: misconception.correction,
      tag: misconception.tag,
    }));

  const evidenceNote = scorable.length
    ? `${scorable.length} marked attempt${scorable.length === 1 ? "" : "s"} on this topic${accuracy != null ? `, ${Math.round(accuracy * 100)}% of marks secured` : ""}${openMistakes.length ? ` · ${openMistakes.length} open mistake${openMistakes.length === 1 ? "" : "s"}` : ""}`
    : openMistakes.length
      ? `${openMistakes.length} open mistake${openMistakes.length === 1 ? "" : "s"} recorded, but no marked attempts yet`
      : "No measured evidence yet — work through the sheet, then attempt questions to establish one";

  // Self-check prompts come from the sheet's own mark points: turn each into a
  // blank-page retrieval question. Deterministic, no generation.
  const selfCheck = topic.keyPoints.slice(0, 6).map((point) => {
    const clipped = point.replace(/^(You must|Always|Remember to|Make sure you)\s+/i, "").trim();
    return `Can you state, from memory: ${clipped}?`;
  });

  const sectionsIncluded: SheetSection[] = ["spec", "mark-points"];
  if (topic.commonErrors.length) sectionsIncluded.push("common-errors");
  if (misconceptions.length) sectionsIncluded.push("misconceptions");
  if (openMistakes.length) sectionsIncluded.push("my-mistakes");
  if (selfCheck.length) sectionsIncluded.push("self-check");

  const headline = openMistakes.length
    ? `${topic.title}: ${openMistakes.length} open mistake${openMistakes.length === 1 ? "" : "s"} to repair — start with "your recorded losses".`
    : scorable.length
      ? `${topic.title}: ${Math.round((accuracy ?? 0) * 100)}% of marks secured across ${scorable.length} attempt${scorable.length === 1 ? "" : "s"}.`
      : `${topic.title}: fresh topic — read the mark points, then close the sheet and self-check.`;

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    subjectId: topic.subjectId,
    specRef: topic.specRef ?? null,
    summary: topic.summary,
    keyPoints: topic.keyPoints,
    commonErrors: topic.commonErrors,
    misconceptions,
    myMistakes: openMistakes,
    evidenceNote,
    selfCheck,
    sectionsIncluded,
    headline,
  };
}

/** Printable title line, e.g. "Biology — Homeostasis and the kidney (3.2.1)". */
export function sheetTitleLine(sheet: RevisionSheet, subjectName: string): string {
  const ref = sheet.specRef ? ` (${sheet.specRef})` : "";
  return `${titleCase(subjectName)} — ${sheet.topicTitle}${ref}`;
}
