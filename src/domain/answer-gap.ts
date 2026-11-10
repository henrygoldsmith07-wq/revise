// ---------------------------------------------------------------------------
// What a lost mark says about the answer itself.
//
// The marker says which scheme points were missed. The offline error
// classifier then guessed *why* from the wording of the question ("there is a
// number in it, so: calculation"), which told a student who wrote "I don't
// know" that they had a calculation problem, and one who divided the wrong
// way round that their answer "does not yet address the question".
//
// This module reads the answer the student actually wrote against the points
// they missed and separates the cases that call for different repairs:
//
//   not-attempted  blank, or only "I don't know"           -> learn it first
//   guessed        hedged ("not sure") and nothing credited -> learn it first
//   opposite       states what a scheme point contradicts   -> fix the idea
//   inverted       final value is the reciprocal            -> fix the method
//   arithmetic     a line of their own that does not add up -> redo the sum
//   power-of-ten   right digits, wrong power of ten         -> fix the unit
//   working        right numbers in, wrong value out        -> redo the working
//   bare-number    a wrong final value with no working      -> show the working
//   incomplete     most marks earned, points not in the answer -> state each point
//   partial        some credit, most still missing
//   off-target     a real answer, none of it credited       -> uncertain
//
// Every reading carries how sure it is. Only readings that rest on something
// the student wrote (or on writing nothing) are offered to the classifier as
// confident; the rest are worded as possibilities and never drive a repair on
// their own. Nothing here changes a mark.
//
// Detection lives in ./answer-gap-detect.ts, which the classifier and the
// mistake pipeline import on their own; this module adds the sentences the
// marked result shows, so they stay off every other screen's boot path.
//
// Pure: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { detectAnswerGap, type AnswerGapCertainty, type AnswerGapDetection, type AnswerGapInput, type AnswerGapKind, type AnswerGapRepair } from "./answer-gap-detect";
import { contradictionExplanation } from "./marking-contradiction";
import type { MarkedPart, Question } from "./types";

export type { AnswerGapCertainty, AnswerGapInput, AnswerGapKind, AnswerGapRepair } from "./answer-gap-detect";

export interface AnswerGap {
  kind: AnswerGapKind;
  certainty: AnswerGapCertainty;
  /** One sentence to the student about this answer. */
  happened: string;
  /** What to do about it, in one sentence. */
  fix: string;
  repair: AnswerGapRepair;
  /** The error category this reading supports; null when it is only a possibility. */
  verdict: AnswerGapDetection["verdict"];
}

function quote(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 110 ? `${trimmed.slice(0, 107)}…` : trimmed;
}

function listPoints(points: readonly string[]): string {
  const shown = points.slice(0, 2).map((point) => `“${quote(point).replace(/[.]$/, "")}”`);
  return points.length > 2 ? `${shown.join("; ")} and ${points.length - 2} more` : shown.join("; ");
}

/** The two sentences for a reading: what happened, and what to do about it. */
function wording(found: AnswerGapDetection): { happened: string; fix: string } {
  const { facts } = found;
  const missed = facts.missed;
  switch (found.kind) {
    case "not-attempted":
      return {
        happened: facts.blank
          ? "You left this blank, so there was nothing to give marks for."
          : "You said you did not know this one, so there was nothing to give marks for.",
        fix: "That is a gap in what you know, not a slip. Learn the idea first, then try a question on it.",
      };
    case "opposite":
      return facts.contradiction
        ? {
            happened: contradictionExplanation(facts.contradiction).replace(/^Not awarded: your answer/, "Your answer"),
            fix: "You did not leave this out; you stated something the mark scheme rules out. Check the idea itself before practising more.",
          }
        : {
            happened: `You wrote “${facts.comparison?.said ?? ""}”, but the mark scheme needs “${quote(facts.comparison?.needed ?? "")}”.`,
            fix: "You did not leave this out; you stated something different from what is credited. Check the idea itself before practising more.",
          };
    case "arithmetic":
      return {
        happened: `Your own line “${facts.sum?.line ?? ""}” does not work out: it comes to ${facts.sum?.correct ?? ""}.`,
        fix: "The method is there; this is a slip in the arithmetic. Check each line on the calculator as you write it, then redo it.",
      };
    case "inverted":
      return {
        happened: facts.written
          ? `You worked out ${facts.said}, but the mark scheme needs ${facts.needed}: the division is the wrong way round.`
          : `Your value ${facts.said} is what you get by dividing the wrong way round; the mark scheme reaches ${facts.needed}.`,
        fix: "You picked the right quantities, so this is about the relationship itself. Check which quantity goes on top, then redo it.",
      };
    case "power-of-ten":
      return {
        happened: `Your value ${facts.said} has the right digits but the wrong power of ten; the mark scheme reaches ${facts.needed}.`,
        fix: "The method looks right. Check each unit prefix and conversion (milli, kilo, cm to m) before you substitute.",
      };
    case "guessed":
      return {
        happened: "You said you were not sure, and nothing in the answer matched the mark scheme.",
        fix: "That points to the idea not being learned yet, rather than a slip. Learn it first, then try a question on it.",
      };
    case "working":
      return {
        happened: `You used the right numbers but reached ${facts.said}; the mark scheme reaches ${facts.needed}.`,
        fix: "Compare how you combined them with the worked example, one line at a time, to find where it changed.",
      };
    case "bare-number":
      return {
        happened: `Your final value ${facts.said} does not match the mark scheme's ${facts.needed}, and there is no working to show where it went wrong.`,
        fix: "Write each step. Method marks can be earned even when the final value is wrong, and a slip can be found.",
      };
    case "incomplete":
      return {
        happened: `Most of this was credited. The ${missed.length === 1 ? "mark you dropped was for a point that is" : "marks you dropped were for points that are"} not in your answer: ${listPoints(missed)}.`,
        fix: "This looks like something left unsaid rather than something not known. Write each step down, one point per mark, even when it feels obvious.",
      };
    case "partial":
      return {
        happened: `Part of this was credited, but most of the marks were for points that are not in your answer: ${listPoints(missed)}.`,
        fix: "Read the worked example for this idea, then try a fresh question on it.",
      };
    case "off-target":
      return {
        happened: "None of what you wrote matched the points this question gives marks for.",
        fix: "Either the idea is new to you, or the question wanted something different from what you answered. The idea and the model answer will show which.",
      };
  }
}

/**
 * Read one part's answer against the points it missed, in words. Null when
 * the part lost nothing, was multiple choice, or there is nothing to read.
 */
export function readAnswerGap(input: AnswerGapInput): AnswerGap | null {
  const found = detectAnswerGap(input);
  if (!found) return null;
  return { kind: found.kind, certainty: found.certainty, repair: found.repair, verdict: found.verdict, ...wording(found) };
}

export interface PartAnswerGap {
  partId: string;
  /** The part's printed label, "" for a single-part question. */
  label: string;
  lost: number;
  gap: AnswerGap;
}

/**
 * Every part of a marked question that lost marks and can be read, most
 * certain first. Empty for multiple choice and for full marks.
 */
export function readQuestionGaps(
  question: Pick<Question, "kind" | "stem" | "parts">,
  marked: readonly MarkedPart[],
  answers: Record<string, string> | undefined,
): PartAnswerGap[] {
  if (question.kind === "mcq" || !answers) return [];
  const rows: PartAnswerGap[] = [];
  for (const mark of marked) {
    if (mark.awarded >= mark.max) continue;
    const part = question.parts.find((candidate) => candidate.id === mark.partId);
    if (!part) continue;
    const gap = readAnswerGap({
      answer: answers[part.id] ?? "",
      missedPoints: mark.missedPoints,
      creditedPoints: mark.creditedPoints,
      awarded: mark.awarded,
      max: mark.max,
      prompt: `${question.stem}\n${part.prompt}`,
    });
    if (gap) rows.push({ partId: part.id, label: part.label ?? "", lost: mark.max - mark.awarded, gap });
  }
  const rank: Record<AnswerGapCertainty, number> = { clear: 0, likely: 1, unsure: 2 };
  return rows.sort((a, b) => rank[a.gap.certainty] - rank[b.gap.certainty] || b.lost - a.lost);
}
