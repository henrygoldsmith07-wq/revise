// ---------------------------------------------------------------------------
// Mark-scheme-aware mistake classification.
//
// Every dropped mark is currently filed under a coarse keyword category
// (recall / method / arithmetic / …) guessed from the question stem. The
// mark scheme knows more than the stem: the exact point that was lost, the
// command that governed it, the AO it sits under, the term it demands, and
// what the student actually wrote. This module reads those signals and sorts
// a mistake into one of nine honest classes:
//
//   knowledge gap  — the required point was simply not known / not written
//   application    — the fact was known but not applied to the context
//   calculation    — the point was lost in the numbers, units or working
//   command word   — the answer did not do what the verb demanded
//   interpretation — a graph/table/data point was misread
//   careless error — a slip on an otherwise strong answer
//   terminology    — the answer talked around the required term instead of
//                    using it
//   structure      — content was there but spread/unlabelled across a
//                    multi-point part
//   timing         — the loss happened because the student was rushed
//
// Rules are deterministic and ordered most-specific first; every result
// carries the reasons that justify it and a confidence, so a chip can say
// *why* a mistake is labelled what it is and how sure the system is. When a
// stored mistake predates the rich signals (no question/part/attempt), a
// documented legacy mapping is used instead of pretending to know more.
// Pure domain: no React, no storage.
// ---------------------------------------------------------------------------

import type { AoCode, Attempt, Mistake, Question, QuestionPart } from "./types";

export const MISTAKE_CLASSES = [
  "knowledge gap",
  "application",
  "calculation",
  "command word",
  "interpretation",
  "careless error",
  "terminology",
  "structure",
  "timing",
] as const;
export type MistakeClass = (typeof MISTAKE_CLASSES)[number];

export type ClassConfidence = "high" | "medium" | "low";

export interface MistakeClassResult {
  klass: MistakeClass;
  confidence: ClassConfidence;
  /** Human reasons — shown verbatim in the chip tooltip. */
  reasons: string[];
}

/** Meaning shown in tooltips and the taxonomy key. */
export const MISTAKE_CLASS_MEANING: Record<MistakeClass, string> = {
  "knowledge gap": "The required point was not known or not written — no evidence of it in the answer.",
  application: "The underlying fact was there, but it was not applied to the context the question set.",
  calculation: "The mark was lost in the numbers, units or working, not in the subject content itself.",
  "command word": "The answer did not do what the command verb asked (e.g. a 'compare' with only one side).",
  interpretation: "A graph, table or data point was misread or misdescribed.",
  "careless error": "A slip on an otherwise strong answer — most of the part was earned.",
  terminology: "The answer talked around the required term instead of using it.",
  structure: "The content existed but was not signposted or separated across a multi-point part.",
  timing: "The point was lost because the run was rushed or time ran out.",
};

/** Fallback used only when a stored mistake has no question/part/attempt context. */
const LEGACY_TO_CLASS: Record<Mistake["category"], MistakeClass> = {
  recall: "knowledge gap",
  arithmetic: "calculation",
  method: "application",
  interpretation: "interpretation",
  communication: "terminology",
  unclassified: "knowledge gap",
};

export interface ClassificationInput {
  mistake: Pick<
    Mistake,
    "category" | "timing" | "secondsSpent" | "marksLost" | "command" | "misconception" | "ao" | "partId" | "point"
  >;
  question?: Question | null;
  part?: QuestionPart | null;
  attempt?: Attempt | null;
}

const COMMAND_RE =
  /\b(state|describe|explain|calculate|suggest|compare|evaluate|discuss|justify|deduce|predict|outline|show that|identify|define|name)\b/i;

/** First command verb in a prompt; mirrors the capture-time detector. */
export function detectCommand(prompt: string): string | null {
  const m = prompt.match(COMMAND_RE);
  return m ? (m[1] ?? "").toLowerCase() : null;
}

/** Words that never count as "the required term". */
const STOP_WORDS = new Set([
  "with", "from", "that", "this", "which", "would", "their", "there", "these", "those", "because", "due",
  "between", "through", "after", "before", "during", "about", "where", "when", "than", "then", "have", "has",
  "into", "over", "using", "used", "use", "state", "give", "what", "your", "each", "both", "some", "other",
  "also", "must", "can", "not", "are", "was", "were", "will", "may", "one", "two", "three", "four", "five",
  "describe", "explain", "compare", "calculat", "suggest", "identify", "outline", "discuss", "justify",
  "evaluate", "predict", "deduce", "show", "name", "define", "answer", "mark", "question", "required",
  "down", "its", "lot", "less", "how", "why", "who", "does", "did", "been", "being", "very", "just",
  "only", "within", "without", "inside", "along", "onto", "under", "after", "before", "around", "against",
]);

/** Lower-case tokens, stemmed lightly (plural/suffix) so "membranes" matches "membrane". */
function tokens(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const raw of words) {
    const w = raw.replace(/(?:ing|ed)$/i, "").replace(/(?:es|s)$/i, "");
    if (w.length >= 3 && !STOP_WORDS.has(w)) out.add(w);
  }
  return out;
}

/** Words the lost point requires that the answer never used (stemmed). */
function missingTerms(point: string | undefined, answer: string): string[] {
  if (!point) return [];
  const wanted = tokens(point);
  const given = tokens(answer);
  return [...wanted].filter((t) => t.length >= 4 && !given.has(t)).slice(0, 4);
}

/** Content words two texts share — evidence the answer engaged the idea. */
function sharedTerms(a: string, b: string): string[] {
  const ta = tokens(a);
  const tb = tokens(b);
  return [...ta].filter((t) => tb.has(t));
}

const NUMERIC_RE =
  /\d|%|mol dm|kPa|°c|cm|mm|nm|kj|\bj\b|dm3|\bkg\b|m s|\bhz\b|\bw\b|\bpa\b|\bmv\b|\bΩ\b|moles|equation|rate constant|show that/i;

// Graph words are split into tiers: 'gradient', 'data' and 'results' appear
// constantly as *content* in science answers ("water potential gradient",
// "this results in…"), so a bare mention must never read as a graph.
const GRAPH_STRONG_RE =
  /\b(graph|curve|figure|trend|plateau|intercept|extrapolat|correlat|peak|reading|sampling)\b/i;
const GRAPH_TABLE_RE = /\b(table|data|results?)\b/i;
const GRAPH_READING_RE =
  /\b(shows?|below|read off|values|interpret|describe the|from the (table|data|graph|results)|plot|axis|scale|line of best fit)\b/i;

const COMPARE_NEED = /\b(both|than|whereas|while|as well as|unlike|similar|different|compared|in contrast|relative to)\b/i;

const STANCE_NEED =
  /\b(because|therefore|this (means|shows|supports|suggests)|more (effective|valid|reliable)|advantage|disadvantage|strength|limitation|most|however|overall)\b/i;

const CONTEXT_MARKERS =
  /\b(in this (experiment|investigation|patient|plant|organism|context|solution|reaction|sample)|applied to|when applied|for this case|given the|on the chromosome|in the cell)\b/i;

const AO_OF = (aos: AoCode[] | undefined): AoCode[] => aos ?? [];

interface DerivedContext {
  command: string | null;
  point: string;
  markScheme: string[];
  maxMarks: number;
  awarded: number;
  missedPoints: string[];
  evidenceOfMissed: string;
  answer: string;
  ao: AoCode[];
  prompt: string;
  calculatorAllowed: boolean;
}

function derive(input: ClassificationInput): DerivedContext {
  const { mistake, question, part, attempt } = input;
  const partLabel = part?.id ?? mistake.partId;
  const markedPart = attempt?.marked?.find((m) => !partLabel || m.partId === partLabel) ?? attempt?.marked?.[0];

  const point = mistake.point ?? markedPart?.missedPoints?.[0] ?? "";
  const markScheme = part?.markScheme ?? [];
  const maxMarks = markedPart?.max ?? part?.marks ?? 0;
  const awarded = markedPart?.awarded ?? (attempt ? attempt.awarded : 0);
  const answer = (attempt?.answers ?? {})[part?.id ?? ""] ?? "";

  const missedEvidence = (markedPart?.evidence ?? [])
    .filter((e) => e.status === "missed" && Boolean(e.evidence))
    .map((e) => e.evidence as string)
    .join(" ");

  const prompt = part?.prompt ?? question?.stem ?? "";
  return {
    command: mistake.command ?? detectCommand(prompt),
    point,
    markScheme,
    maxMarks: maxMarks || 1,
    awarded,
    missedPoints: markedPart?.missedPoints ?? (point ? [point] : []),
    evidenceOfMissed: missedEvidence,
    answer: answer || missedEvidence,
    ao: AO_OF(part?.aos ?? question?.aos),
    prompt,
    calculatorAllowed: question?.calculatorAllowed ?? false,
  };
}

/** Mark-scheme-aware classification of one dropped mark. */
export function classifyMistake(input: ClassificationInput): MistakeClassResult {
  const ctx = derive(input);
  const { mistake, attempt } = input;

  const earnedShare = ctx.maxMarks > 0 ? ctx.awarded / ctx.maxMarks : 0;
  const lostFraction = ctx.maxMarks > 0 ? mistake.marksLost / ctx.maxMarks : 1;
  const lostOneOrTwo = mistake.marksLost <= 2 || lostFraction <= 0.25;
  const answerReached = ctx.answer.trim().length > 0;
  const isCalculationCommand = ctx.command === "calculate" || ctx.command === "show that";
  const looksNumeric = NUMERIC_RE.test(`${ctx.point} ${ctx.markScheme.join(" ")} ${ctx.prompt}`) && !GRAPH_STRONG_RE.test(ctx.point);
  const graphText = `${ctx.prompt} ${ctx.point}`;
  const looksGraphical =
    (GRAPH_STRONG_RE.test(graphText) || (GRAPH_TABLE_RE.test(graphText) && GRAPH_READING_RE.test(graphText))) &&
    !isCalculationCommand;
  const promptGraphical =
    GRAPH_STRONG_RE.test(ctx.prompt) || (GRAPH_TABLE_RE.test(ctx.prompt) && GRAPH_READING_RE.test(ctx.prompt));

  // 1. Interpretation — a data/graph point misread (beats calc when the loss
  //    is reading a figure, unless the question explicitly said calculate).
  if (looksGraphical) {
    return {
      klass: "interpretation",
      confidence: promptGraphical ? "high" : "medium",
      reasons: [
        `the lost point sits in graph/table/data territory${ctx.point ? ` (“${truncate(ctx.point)}”)` : ""}`,
        "classed as a reading/interpretation loss, not a knowledge gap",
      ],
    };
  }

  // 2. Command word — the verb was not obeyed. A one-sided "compare", or an
  //    "evaluate/discuss" with no stance, fails the verb rather than the fact.
  //    Outranks calculation: when the question said "compare", the missing
  //    comparison is the actionable loss even when the point quantifies it.
  if (ctx.command === "compare" && answerReached && !COMPARE_NEED.test(ctx.answer)) {
    return {
      klass: "command word",
      confidence: "high",
      reasons: [
        "the command was compare, and the answer gives one side without the comparative link (both/whereas/than/unlike)",
        "the mark was for the comparison itself, not the individual facts",
      ],
    };
  }
  if (
    (ctx.command === "evaluate" || ctx.command === "discuss" || ctx.command === "justify") &&
    answerReached &&
    !STANCE_NEED.test(ctx.answer)
  ) {
    return {
      klass: "command word",
      confidence: "medium",
      reasons: [
        `${ctx.command} demanded a judgement or link, and the answer states without supporting or weighing it`,
        "a command-word loss means failing the verb, not lacking the fact",
      ],
    };
  }

  // 3. Calculation — numbers/units/working were the point of the loss.
  if (isCalculationCommand || looksNumeric) {
    const digits = /\d/.test(ctx.point) || /\d/.test(ctx.markScheme.join(" "));
    return {
      klass: "calculation",
      confidence: digits ? "high" : "medium",
      reasons: [
        isCalculationCommand
          ? "the command demanded working with numbers (calculate / show that)"
          : "the lost point is about a number, unit or equation",
        digits ? "numeric content is present in the mark-scheme point" : "quantitative context marks this as a working loss",
      ],
    };
  }

  // 4. Timing — the loss happened under time pressure on an otherwise known part.
  if (mistake.timing === "rushed" && earnedShare >= 0.5) {
    return {
      klass: "timing",
      confidence: earnedShare >= 0.75 ? "high" : "medium",
      reasons: [
        "the attempt was rushed and most of this part was still earned",
        mistake.secondsSpent != null
          ? `only ${mistake.secondsSpent}s was spent on the part where the mark dropped`
          : "the timing record marks this as rushed",
      ],
    };
  }

  // 5. Application — the answer engaged the demanded content (shared
  //    vocabulary — the fact was known) but the transfer to the context or
  //    the AO2/AO3 step failed. AO2/AO3, an application command or an
  //    explicit context outranks a terminology nuance: when the question
  //    says 'apply to this patient', a missing demanded term usually *is*
  //    the failed application.
  const appliedAos = ctx.ao.some((a) => a === "AO2" || a === "AO3");
  const contextPresent = CONTEXT_MARKERS.test(`${ctx.prompt} ${ctx.point}`);
  const applicationCommand =
    ctx.command === "suggest" || ctx.command === "predict" || ctx.command === "deduce";
  const answerSharesPoint =
    answerReached && sharedTerms(ctx.answer, `${ctx.point} ${ctx.markScheme.join(" ")}`).length > 0;
  if ((appliedAos || applicationCommand || contextPresent) && answerSharesPoint) {
    return {
      klass: "application",
      confidence: contextPresent || applicationCommand ? "high" : "medium",
      reasons: [
        contextPresent
          ? "the point required applying knowledge to the given context"
          : `the point sits under ${ctx.ao.join("/") || "an application-level command"} (${ctx.command ?? "context"})`,
        "the failure is the transfer to the situation, not the raw fact",
      ],
    };
  }

  // 6. Terminology — the answer engaged the point's idea but avoided the
  //    specific term the mark scheme demands. With no shared vocabulary at
  //    all the answer never reached the idea, which is a knowledge gap, not
  //    a wording problem.
  const missing = missingTerms(ctx.point, ctx.answer);
  if (missing.length > 0 && answerSharesPoint && !looksNumeric) {
    const confident = mistake.misconception === "terminology" || ctx.ao.includes("AO1");
    return {
      klass: "terminology",
      confidence: confident ? "high" : "medium",
      reasons: [
        `the lost point (“${truncate(ctx.point)}”) demands a term the answer did not use (${missing.slice(0, 3).join(", ")})`,
        "the mark was for the term itself — the idea was talked around, not stated",
      ],
    };
  }

  // 7. Structure — a multi-point part where several points were lost together
  //    despite content being present: the answer did not separate/signpost.
  if (ctx.markScheme.length >= 3 && ctx.missedPoints.length >= 2 && earnedShare > 0 && earnedShare < 0.9 && answerReached) {
    return {
      klass: "structure",
      confidence: "medium",
      reasons: [
        `this part carries ${ctx.markScheme.length} mark-scheme points and ${ctx.missedPoints.length} were lost together`,
        "with content present elsewhere, the loss pattern reads as points not separated or signposted",
      ],
    };
  }

  // 8. Careless — a small slip on an otherwise strong answer.
  if (answerReached && earnedShare >= 0.6 && lostOneOrTwo && mistake.timing !== "rushed") {
    return {
      klass: "careless error",
      confidence: earnedShare >= 0.75 ? "high" : "medium",
      reasons: [
        `most of the part was earned (${ctx.awarded}/${ctx.maxMarks})`,
        `only ${mistake.marksLost} mark${mistake.marksLost === 1 ? "" : "s"} dropped — a slip rather than a gap`,
      ],
    };
  }

  // 9. Knowledge gap — nothing reached the point. Only claimable when the
  //    attempt is present: without it there is no way to know what was
  //    written, and an older row falls through to the legacy mapping instead
  //    of being guessed at.
  if (attempt && !answerReached) {
    return {
      klass: "knowledge gap",
      confidence: "high",
      reasons: ["no answer evidence reached the lost point", "nothing written suggests the fact was known"],
    };
  }
  if (attempt && !ctx.evidenceOfMissed) {
    return {
      klass: "knowledge gap",
      confidence: "medium",
      reasons: [
        "something was written, but no evidence reached the specific point",
        "no application, terminology or structure signal dominated",
      ],
    };
  }

  // Legacy fallback — old rows without rich context.
  return {
    klass: LEGACY_TO_CLASS[mistake.category] ?? "knowledge gap",
    confidence: "low",
    reasons: ["stored without mark-scheme context — mapped from the capture-time category"],
  };
}

function truncate(text: string, at = 48): string {
  return text.length > at ? `${text.slice(0, at)}…` : text;
}
