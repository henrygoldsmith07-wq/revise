// ---------------------------------------------------------------------------
// Past-paper extraction: input limits and mark-scheme provenance. Pure.
//
// Two honesty rules for the AI extraction path (src/ai/tasks.ts
// extractQuestions, src/app/papers/page.tsx):
//
// 1. Nothing is silently cut. The paper and the uploaded mark scheme travel as
//    separate fields with separate caps, the browser refuses an over-long
//    paper before spending a request on it, and the server says when it had
//    to truncate (an older client can still send more than it reads).
// 2. A mark scheme the model wrote is never the paper's mark scheme. Each
//    extracted part records where its scheme came from. "uploaded-scheme" is
//    granted only when the model says it took the points from the upload AND
//    every point can be found in the uploaded scheme text; anything else —
//    no upload, a missing or "written" claim, a point the upload does not
//    contain — is "model-written". Only a question whose every part is
//    "uploaded-scheme" can carry official-paper trust (official-papers.ts);
//    ticking "This matches the paper" checks the question, not a scheme the
//    model invented.
// ---------------------------------------------------------------------------

import type { MarkSchemeSource, Question } from "./types";

/**
 * What one extraction request may carry. The server prompt reads exactly
 * these many characters of each, so a request the browser lets through is
 * never truncated server-side.
 */
export const EXTRACTION_LIMITS = {
  paperChars: 40_000,
  markSchemeChars: 20_000,
} as const;

export type ExtractionInputCheck =
  | { ok: true }
  | { ok: false; reason: "paper-too-long" | "mark-scheme-too-long"; message: string };

function thousands(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Check an extraction request before it is sent; the message is learner-facing. */
export function checkExtractionInput(paper: string, markScheme: string): ExtractionInputCheck {
  const paperChars = paper.trim().length;
  const schemeChars = markScheme.trim().length;
  if (paperChars > EXTRACTION_LIMITS.paperChars) {
    return {
      ok: false,
      reason: "paper-too-long",
      message: `That paper is too long to extract in one go (${thousands(paperChars)} characters; the limit is ${thousands(EXTRACTION_LIMITS.paperChars)}). Split it into sections and extract each one with its part of the mark scheme. Nothing was sent.`,
    };
  }
  if (schemeChars > EXTRACTION_LIMITS.markSchemeChars) {
    return {
      ok: false,
      reason: "mark-scheme-too-long",
      message: `That mark scheme is too long to send with the paper (${thousands(schemeChars)} characters; the limit is ${thousands(EXTRACTION_LIMITS.markSchemeChars)}). Paste only the part of the mark scheme for these questions. Nothing was sent.`,
    };
  }
  return { ok: true };
}

/** The marker older clients put between paper and scheme in one text field. */
export const LEGACY_MARK_SCHEME_DIVIDER = "\n--- MARK SCHEME ---\n";

/** Split a legacy combined payload into paper and scheme; a no-op without the divider. */
export function splitLegacyExtractionText(text: string): { paper: string; markScheme: string } {
  const at = text.indexOf(LEGACY_MARK_SCHEME_DIVIDER);
  if (at < 0) return { paper: text, markScheme: "" };
  return { paper: text.slice(0, at), markScheme: text.slice(at + LEGACY_MARK_SCHEME_DIVIDER.length) };
}

function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []).filter((t) => t.length >= 3 || /\d/.test(t));
}

/** Share of a point's content words that must appear in the uploaded scheme. */
const UPLOAD_MATCH_SHARE = 0.8;

/**
 * Where one extracted part's mark scheme came from. Fails closed: the
 * model's claim alone is never enough, and a point the uploaded scheme does
 * not contain makes the whole part "model-written".
 */
export function markSchemeSourceFor(
  points: readonly string[],
  claimed: "uploaded" | "written" | undefined,
  uploadedScheme: string,
): MarkSchemeSource {
  if (claimed !== "uploaded" || !points.length || !uploadedScheme.trim()) return "model-written";
  const vocabulary = new Set(contentTokens(uploadedScheme));
  for (const point of points) {
    const tokens = contentTokens(point);
    if (!tokens.length) return "model-written";
    const found = tokens.filter((t) => vocabulary.has(t)).length;
    if (found / tokens.length < UPLOAD_MATCH_SHARE) return "model-written";
  }
  return "uploaded-scheme";
}

/**
 * True only when every part of the question has a mark scheme taken from the
 * learner's upload. A question with no parts, or any part with a model-written
 * or unrecorded scheme, is false.
 */
export function markSchemeFromUpload(question: Pick<Question, "parts">): boolean {
  return question.parts.length > 0 && question.parts.every((part) => part.markSchemeSource === "uploaded-scheme");
}
