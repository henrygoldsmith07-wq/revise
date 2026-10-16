import { examinerSummaryParts, rubricPartComment } from "./marking";
import type { MarkedPart } from "./types";

// ---------------------------------------------------------------------------
// What the marked-result view shows once, not five times.
//
// A wrong answer marked on the device used to list the same missed points in
// the per-part list, the part comment ("No marks yet. The scheme wants: …"),
// the examiner summary ("The scheme still wants: …"), the evidence list, the
// remediation card and the guiding-question panel. The view now lists them
// once ("What you missed") and these helpers recognise the device marker's own
// restatements so they can be dropped. Recognition is by exact match with the
// text the device marker generates, so an AI marker's comment or summary, or
// anything else written in its own words, is always shown unchanged.
// ---------------------------------------------------------------------------

/** True when a part comment is exactly the device marker's restatement of its missed points. */
export function commentRestatesMarkedPoints(marked: Pick<MarkedPart, "awarded" | "max" | "missedPoints" | "comment">): boolean {
  if (!marked.comment || !marked.missedPoints.length) return false;
  return marked.comment.trim() === rubricPartComment(marked.awarded, marked.max, marked.missedPoints);
}

/**
 * The overall feedback without the device marker's score and missed-point
 * restatement. Anything after the generated summary (a relevant common slip,
 * the "no AI was involved" provenance line) is kept exactly. Feedback that
 * does not begin with the generated summary is returned unchanged.
 */
export function condenseMarkedFeedback(feedback: string, marked: readonly MarkedPart[]): string {
  const awarded = marked.reduce((sum, m) => sum + m.awarded, 0);
  const max = marked.reduce((sum, m) => sum + m.max, 0);
  const { score, opening, detail, advice } = examinerSummaryParts(awarded, max, [...marked]);
  if (!detail) return feedback;
  const generated = `${score} ${opening}${detail}${advice}`;
  if (!feedback.startsWith(generated)) return feedback;
  return `${opening}${advice}${feedback.slice(generated.length)}`;
}
