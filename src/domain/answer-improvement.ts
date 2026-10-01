// ---------------------------------------------------------------------------
// Improve my answer — tell the student what is missing, not what to write.
//
// After a part loses marks, each missed mark-scheme point becomes a cue that
// names the ground to cover without quoting the point. The student rewrites,
// and the rewrite is re-marked by the same offline rubric as the original
// answer (so the comparison is like for like, never AI-versus-rubric).
//
// A rewrite is practice only. The student has already seen the feedback, so it
// is never saved as an attempt and never changes mastery or the mistake record.
// ---------------------------------------------------------------------------

import { answerLooksCopied } from "./learning-evidence";
import { markPart, type PartialCreditCalibration } from "./marking";
import { STOP_WORDS } from "./marking-language";
import { isNumericPoint } from "./marking-numeric";
import type { MarkedPart, Question, QuestionPart } from "./types";

/** Most content words a cue names, so it points at the idea without dictating the answer. */
const CUE_TERMS = 3;
const MIN_TERM_LENGTH = 4;

function keyTerms(point: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  const words = point.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
  const ranked = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => word.length >= MIN_TERM_LENGTH && !STOP_WORDS.has(word.toLowerCase()))
    .sort((a, b) => b.word.length - a.word.length || a.index - b.index)
    .slice(0, CUE_TERMS)
    .sort((a, b) => a.index - b.index);
  for (const { word } of ranked) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(key);
  }
  return terms;
}

/** One cue per missed point. Numeric points get a method-and-units nudge instead of keywords. */
export function improvementCues(missedPoints: string[]): string[] {
  return missedPoints.map((point, index) => {
    if (isNumericPoint(point)) {
      return `Mark ${index + 1}: check your final value — the number, its unit and the precision asked for.`;
    }
    const terms = keyTerms(point);
    return terms.length
      ? `Mark ${index + 1}: say something specific about ${terms.map((term) => `“${term}”`).join(", ")}.`
      : `Mark ${index + 1}: add one more precise, relevant point.`;
  });
}

export type RewriteVerdict = "unchanged" | "copied" | "improved" | "same-marks" | "lower" | "full-marks";

export interface RewriteAssessment {
  verdict: RewriteVerdict;
  /** The original answer marked by the offline rubric. */
  before: MarkedPart;
  /** The rewrite marked by the same rubric; equals `before` when it was unchanged or copied. */
  after: MarkedPart;
  /** Marks gained over the original under the same rubric (never negative). */
  gained: number;
  /** Cues for the points the rewrite still misses. */
  remainingCues: string[];
  message: string;
}

function normalised(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function assessRewrite(input: {
  question: Question;
  part: QuestionPart;
  original: string;
  rewrite: string;
  calibration?: PartialCreditCalibration;
}): RewriteAssessment {
  const { question, part, original, rewrite, calibration } = input;
  const before = markPart(part, original, calibration);
  const unchanged = (verdict: "unchanged" | "copied", message: string): RewriteAssessment => ({
    verdict,
    before,
    after: before,
    gained: 0,
    remainingCues: improvementCues(before.missedPoints),
    message,
  });

  if (!normalised(rewrite) || normalised(rewrite) === normalised(original)) {
    return unchanged("unchanged", "Change the answer first. Use the cues to add what is missing.");
  }
  if (answerLooksCopied(question, { [part.id]: rewrite })) {
    return unchanged("copied", "That matches the model answer too closely to show what you can do. Put it in your own words.");
  }

  const after = markPart(part, rewrite, calibration);
  const gained = Math.max(0, after.awarded - before.awarded);
  const remainingCues = improvementCues(after.missedPoints);
  if (after.awarded >= after.max) {
    return { verdict: "full-marks", before, after, gained, remainingCues, message: `Full marks on the rewrite: ${after.awarded}/${after.max}.` };
  }
  if (after.awarded > before.awarded) {
    return { verdict: "improved", before, after, gained, remainingCues, message: `Up from ${before.awarded} to ${after.awarded} of ${after.max}. ${remainingCues.length} mark${remainingCues.length === 1 ? "" : "s"} still to find.` };
  }
  if (after.awarded < before.awarded) {
    return { verdict: "lower", before, after, gained: 0, remainingCues, message: `That scores ${after.awarded} against ${before.awarded} for your first answer. Something that earned a mark was lost in the rewrite.` };
  }
  return { verdict: "same-marks", before, after, gained: 0, remainingCues, message: `Still ${after.awarded} of ${after.max}. Try the cues again with more specific wording.` };
}
