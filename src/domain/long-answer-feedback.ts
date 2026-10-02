// ---------------------------------------------------------------------------
// Long-answer feedback — structured, ordered, and honest about its limits.
//
// Sequence: marks earned → marks lost → why → highest-impact fix → rewrite
// only the weakest section → attempt an equivalent question. Scientific
// credit comes only from the marker's credited/missed points. The writing
// checks (linking, vagueness, evaluation, comparison, conclusion) are
// transparent text heuristics and are labelled as such; they never change the
// marks. Low marker confidence is surfaced, never hidden.
// ---------------------------------------------------------------------------

import { questionFamilies } from "./learning-evidence";
import type { Attempt, CommandWord, Id, MarkedPart, Question, QuestionPart } from "./types";

export type WritingIssueKind =
  | "no-linking"
  | "vague-terms"
  | "no-evaluation"
  | "one-sided"
  | "no-conclusion"
  | "too-short"
  | "contradiction-risk";

export interface WritingIssue {
  kind: WritingIssueKind;
  message: string;
}

export interface LongAnswerFeedback {
  earned: { marks: number; of: number; credited: string[] };
  lost: { marks: number; missed: string[] };
  why: string[];
  writing: WritingIssue[];
  commandWord: { word: CommandWord | null; fulfilled: boolean | null; note: string };
  highestImpact: string;
  rewrite: { focus: string; instruction: string } | null;
  equivalentQuestionId: Id | null;
  confidence: { level: "normal" | "low"; note: string | null; humanReview: boolean };
}

const LINKING = /\b(because|therefore|so that|so |hence|thus|which means|this means|leading to|leads to|results in|as a result|due to|causes?|since)\b/gi;
const VAGUE = /\b(thing|things|stuff|it gets bigger|it gets smaller|goes up|goes down|a lot|quite|sort of|kind of|basically)\b/gi;
const EVALUATIVE_WORDS = /\b(however|although|but|whereas|on the other hand|limitation|advantage|disadvantage|overall|most important|less important|outweigh|justified|evidence suggests)\b/gi;
const CONCLUSION = /\b(therefore|overall|in conclusion|to conclude|so the|hence|this shows|thus)\b/i;
const CONTRAST = /\b(whereas|while|however|in contrast|but|both|similarly|unlike|compared)\b/gi;
const CONTRADICT = /\b(increases?|decreases?)\b.*\b(not|never)\s+\1\b/i;

const EVAL_COMMANDS: ReadonlySet<string> = new Set(["evaluate", "assess", "discuss", "justify"]);
const CAUSAL_COMMANDS: ReadonlySet<string> = new Set(["explain", "evaluate", "assess", "discuss", "justify"]);

const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const round = (v: number) => Math.round(v * 10) / 10;

export function analyseWriting(answer: string, command: CommandWord | null, marks: number): WritingIssue[] {
  const text = answer.trim();
  const out: WritingIssue[] = [];
  const n = words(text);
  if (n < Math.max(12, marks * 6)) out.push({ kind: "too-short", message: `Only ${n} words for ${marks} marks; each mark usually needs a separate, developed point.` });
  if (command && CAUSAL_COMMANDS.has(command) && marks >= 3 && count(LINKING, text) < Math.min(2, Math.ceil(marks / 3))) {
    out.push({ kind: "no-linking", message: "Ideas are stated but not linked with cause-and-effect language (because, therefore, which leads to)." });
  }
  const vague = count(VAGUE, text);
  if (vague >= 2) out.push({ kind: "vague-terms", message: `${vague} vague phrases found; replace them with the precise term or quantity.` });
  if (command && EVAL_COMMANDS.has(command) && count(EVALUATIVE_WORDS, text) < 2) {
    out.push({ kind: "no-evaluation", message: "Little weighing-up: say which factor matters most and why, or what limits the evidence." });
  }
  if (command === "compare" && count(CONTRAST, text) < 2) out.push({ kind: "one-sided", message: "The answer reads as two separate descriptions; compare directly point by point." });
  if (command && EVAL_COMMANDS.has(command) && marks >= 6 && !CONCLUSION.test(text)) out.push({ kind: "no-conclusion", message: "No clear concluding judgement." });
  if (CONTRADICT.test(text)) out.push({ kind: "contradiction-risk", message: "Parts of the answer may contradict each other; check direction words." });
  return out;
}

const COMMANDS = ["show that", "state", "describe", "explain", "calculate", "suggest", "compare", "evaluate", "assess", "discuss", "justify", "deduce", "predict", "outline"] as const;

/** First recognised command word in the prompt text; the marker's own wording is not trusted for this. */
export function commandWordOf(text: string): CommandWord | null {
  const lower = text.toLowerCase();
  let best: { word: string; at: number } | null = null;
  for (const word of COMMANDS) {
    const at = lower.search(new RegExp(`\\b${word}\\b`));
    if (at >= 0 && (!best || at < best.at)) best = { word, at };
  }
  return best ? (best.word as CommandWord) : null;
}

export interface LongAnswerInput {
  question: Question;
  part: QuestionPart;
  marked: MarkedPart;
  answer: string;
  attempt?: { markConfidence?: number; markEscalation?: { status: "pending" | "resolved" }; markedBy?: Attempt["markedBy"] };
  /** Candidate questions for the final step; the picker rejects familiar families. */
  candidates?: readonly Question[];
  attemptedQuestionIds?: ReadonlySet<Id>;
}

function pickEquivalent(input: LongAnswerInput): Id | null {
  const familiar = new Set(questionFamilies(input.question));
  const seen = input.attemptedQuestionIds ?? new Set<Id>();
  const target = input.part.marks;
  return (input.candidates ?? [])
    .filter((c) => c.id !== input.question.id && !seen.has(c.id) && c.subjectId === input.question.subjectId &&
      c.topicIds.some((id) => input.question.topicIds.includes(id)) && c.kind === input.question.kind &&
      !questionFamilies(c).some((family) => familiar.has(family)))
    .sort((a, b) => Math.abs(a.totalMarks - target) - Math.abs(b.totalMarks - target) || a.id.localeCompare(b.id))[0]?.id ?? null;
}

export function buildLongAnswerFeedback(input: LongAnswerInput): LongAnswerFeedback {
  const { part, marked } = input;
  const command = commandWordOf(part.prompt) ?? commandWordOf(input.question.stem);
  const lostMarks = round(Math.max(0, marked.max - marked.awarded));
  const writing = analyseWriting(input.answer, command, marked.max);
  const missed = marked.missedPoints;

  const why: string[] = missed.map((point) => `Missing from the answer: ${point}`);
  for (const issue of writing) if (issue.kind !== "too-short" || lostMarks > 0) why.push(issue.message);
  if (!why.length && lostMarks > 0) why.push("The marker did not record which points were missed; compare with the mark scheme.");

  const evalMissing = writing.find((w) => w.kind === "no-evaluation" || w.kind === "one-sided");
  const fulfilled = command === null ? null : EVAL_COMMANDS.has(command) || command === "compare" ? !evalMissing : true;
  const note = command === null ? "No command word recorded for this part."
    : fulfilled ? `The answer is structured the way "${command}" asks for.` : `The command word "${command}" asks for more than the answer gives.`;

  const lowConfidence = (input.attempt?.markConfidence !== undefined && input.attempt.markConfidence < 0.6) ||
    input.attempt?.markEscalation?.status === "pending";

  let highestImpact: string;
  if (lostMarks === 0) highestImpact = "Full marks. Check it holds up on a different question rather than re-reading this answer.";
  else if (missed.length) highestImpact = `Secure the missing point: ${missed[0]}`;
  else highestImpact = writing[0]?.message ?? "Compare your answer to the mark scheme point by point.";

  const rewrite = lostMarks > 0
    ? { focus: missed[0] ?? writing[0]?.message ?? "weakest paragraph", instruction: `Rewrite only the part that should earn this point${missed[0] ? ` ("${missed[0]}")` : ""}. Do not copy a model answer; use your own words and link each idea to the next.` }
    : null;

  return {
    earned: { marks: round(marked.awarded), of: marked.max, credited: marked.creditedPoints },
    lost: { marks: lostMarks, missed },
    why,
    writing,
    commandWord: { word: command, fulfilled, note },
    highestImpact,
    rewrite,
    equivalentQuestionId: pickEquivalent(input),
    confidence: lowConfidence
      ? { level: "low", note: "This automated mark is low-confidence and has been queued for human review. Treat it as provisional.", humanReview: true }
      : { level: "normal", note: null, humanReview: false },
  };
}
