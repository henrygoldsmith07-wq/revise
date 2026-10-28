// ---------------------------------------------------------------------------
// QER level-of-response view for 6-mark extended answers.
//
// WJEC science papers mark the quality-of-extended-response question by
// level: a 6-mark answer sits in the 1–2, 3–4 or 5–6 band (0 for nothing
// creditable). Revise's marker already awards the marks; this module only
// restates that mark as a band, says what moves the answer to the next band,
// and lists writing-quality risks the examiner's "logical, linked" descriptor
// cares about. It never changes the awarded mark, and the writing checks are
// labelled as text heuristics, not an examiner's judgement.
// ---------------------------------------------------------------------------

import { analyseWriting, commandWordOf, type WritingIssue } from "./long-answer-feedback";
import type { MarkedPart, Question, QuestionPart } from "./types";

export const QER_MARKS = 6;

export interface QerBand {
  level: 0 | 1 | 2 | 3;
  min: number;
  max: number;
}

export const QER_BANDS: readonly QerBand[] = [
  { level: 0, min: 0, max: 0 },
  { level: 1, min: 1, max: 2 },
  { level: 2, min: 3, max: 4 },
  { level: 3, min: 5, max: 6 },
];

/** Writing issues that bear on a level descriptor's "coherent, logically linked" demand. */
const COHERENCE_ISSUES: ReadonlySet<WritingIssue["kind"]> = new Set(["no-linking", "no-conclusion", "contradiction-risk", "vague-terms", "no-evaluation", "one-sided"]);

export interface QerLevelView {
  level: 0 | 1 | 2 | 3;
  band: { min: number; max: number };
  awarded: number;
  /** Position inside the band: "bottom", "middle" or "top" (level 0 has none). */
  placement: "none" | "bottom" | "top";
  /** Marks still needed to enter the next band; null at level 3. */
  marksToNextLevel: number | null;
  /** The missed points to secure first, as many as the next band needs (at least one). */
  nextLevelPoints: string[];
  /** Whole-number marks the answer could still gain in its own band. */
  headroomInBand: number;
  coherenceRisks: WritingIssue[];
  /** Heuristic only: scientifically full-band content that reads as unlinked. */
  presentationRisk: boolean;
  summary: string;
}

/** True for a part the QER trainer applies to: a 6-mark, written (non-MCQ) part. */
export function isQerPart(question: Pick<Question, "kind">, part: Pick<QuestionPart, "marks">): boolean {
  return question.kind !== "mcq" && part.marks === QER_MARKS;
}

export function bandForMarks(marks: number): QerBand {
  const whole = Math.max(0, Math.min(QER_MARKS, Math.floor(marks + 1e-9)));
  return QER_BANDS.find((band) => whole >= band.min && whole <= band.max) ?? QER_BANDS[0]!;
}

export function buildQerLevelView(input: {
  question: Pick<Question, "stem">;
  part: Pick<QuestionPart, "prompt" | "marks">;
  marked: Pick<MarkedPart, "awarded" | "max" | "missedPoints">;
  answer: string;
}): QerLevelView | null {
  const { part, marked } = input;
  if (part.marks !== QER_MARKS || marked.max !== QER_MARKS) return null;
  const band = bandForMarks(marked.awarded);
  const next = QER_BANDS.find((candidate) => candidate.level === band.level + 1) ?? null;
  const awarded = Math.floor(marked.awarded + 1e-9);
  const marksToNextLevel = next ? Math.max(1, next.min - awarded) : null;
  const nextLevelPoints = next ? marked.missedPoints.slice(0, marksToNextLevel ?? 1) : [];
  const command = commandWordOf(part.prompt) ?? commandWordOf(input.question.stem);
  const coherenceRisks = input.answer.trim()
    ? analyseWriting(input.answer, command, QER_MARKS).filter((issue) => COHERENCE_ISSUES.has(issue.kind))
    : [];
  const presentationRisk = band.level === 3 && coherenceRisks.some((issue) => issue.kind === "no-linking" || issue.kind === "contradiction-risk");
  const placement: QerLevelView["placement"] = band.level === 0 ? "none" : awarded === band.max ? "top" : "bottom";
  const headroomInBand = band.level === 0 ? 0 : band.max - awarded;

  let summary: string;
  if (band.level === 0) summary = "No creditable point yet. One correct, relevant idea reaches level 1.";
  else if (next) summary = `Level ${band.level} (${band.min}–${band.max} marks). ${marksToNextLevel} more mark${marksToNextLevel === 1 ? "" : "s"} reach level ${next.level}.`;
  else summary = `Level 3 (${band.min}–${band.max} marks), the top band${awarded < QER_MARKS ? `; ${QER_MARKS - awarded} mark short of full marks` : ""}.`;

  return { level: band.level, band: { min: band.min, max: band.max }, awarded, placement, marksToNextLevel, nextLevelPoints, headroomInBand, coherenceRisks, presentationRisk, summary };
}
