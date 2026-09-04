// ---------------------------------------------------------------------------
// Knowledge vs answering — exam-technique modelling.
//
// A dropped mark has two possible causes: the content was not known
// (knowledge) or the content was known but the *answer* failed it (exam
// technique: the command word was not obeyed, the point was not separated,
// the working was wrong, time ran out, the data was misread). The two need
// different medicine: knowledge leaks are fixed by learning the topic;
// answering leaks are fixed by sitting timed exam questions and marking
// against the scheme.
//
// Every mistake is first classified by the mark-scheme-aware nine-way
// classifier (src/domain/mistake-classification.ts), which reads the lost
// point, the command, the AO, the written answer and the marking evidence.
// Each class then maps to a documented knowledge/answering split:
//
//   knowledge gap    → 100% knowledge   (the point was simply not known)
//   terminology      →  75% knowledge   (idea there, precise term not — an
//                                         AO1 precision loss, mostly content)
//   application      →  40% knowledge   (fact known, transfer to the context
//                                         failed — half depth, half writing)
//   calculation      →  20% knowledge   (the leak is in the working/units)
//   command word     →   0% knowledge   (the verb was not obeyed)
//   interpretation   →  25% knowledge   (mostly reading the figure wrongly)
//   careless error   →   0% knowledge   (a slip on an otherwise strong answer)
//   structure        →  15% knowledge   (content present, not signposted)
//   timing           →   0% knowledge   (the clock, not the content)
//
// Rows classified from the student's actual answer carry high/medium
// confidence and count fully; rows with no attempt context fall back to
// their capture-time category at low confidence and count at a quarter
// weight, so an old unclassified row can never dominate the split. Pure
// domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import { classifyMistake, type MistakeClass } from "./mistake-classification";
import { quickSessionQuestionLimit } from "./quick-session";
import type { Attempt, Id, Mistake, Question } from "./types";

/** Fraction of a class's lost marks attributed to missing knowledge (rest = answering). */
const CLASS_KNOWLEDGE_FRACTION: Record<MistakeClass, number> = {
  "knowledge gap": 1,
  terminology: 0.75,
  application: 0.4,
  calculation: 0.2,
  "command word": 0,
  interpretation: 0.25,
  "careless error": 0,
  structure: 0.15,
  timing: 0,
};

/** How much a row counts towards the split, by classifier confidence. */
const CONFIDENCE_WEIGHT = { high: 1, medium: 0.6, low: 0.25 } as const;

export type TechniqueVerdict = "knowledge" | "answering" | "mixed" | "too-early" | "none";

export interface ClassDriver {
  klass: MistakeClass;
  /** Raw marks lost on this class (not confidence-weighted) — the "why". */
  marksLost: number;
  losses: number;
}

export interface KnowledgeAnsweringReport {
  subjectId: string;
  /** Topic scope of this report, when aggregated for one topic (null = whole subject). */
  topicId: Id | null;
  /** Confidence-weighted mark contributions (0.01 precision). */
  knowledgeMarks: number;
  answeringMarks: number;
  totalMarks: number;
  knowledgeShare: number;
  answeringShare: number;
  /** Row counts. */
  mistakes: number;
  /** Rows whose class came from the actual attempt/question (high/medium confidence). */
  classifiedFromAnswers: number;
  /** Rows mapped from the capture-time category because context is gone. */
  mappedFromLegacy: number;
  /** Strong enough evidence to call a direction. */
  reliable: boolean;
  verdict: TechniqueVerdict;
  narrative: string;
  drivers: ClassDriver[];
}

export interface KnowledgeAnsweringInput {
  subjectId: string;
  /** Optional topic scope: when set, only this topic's losses are aggregated. */
  topicId?: Id;
  mistakes: Mistake[];
  /** Optional lookups that let each mistake be classified from its real context. */
  questions?: Question[];
  attempts?: Attempt[];
}

function lookupContext(
  mistake: Mistake,
  questions: Map<string, Question> | undefined,
  attempts: Map<string, Attempt> | undefined,
): { question: Question | null; part: Question["parts"][number] | null; attempt: Attempt | null } {
  const question = mistake.questionId && questions ? (questions.get(mistake.questionId) ?? null) : null;
  const attempt = mistake.attemptId && attempts ? (attempts.get(mistake.attemptId) ?? null) : null;
  const part =
    question && mistake.partId ? (question.parts.find((p) => p.id === mistake.partId) ?? null) : null;
  return { question, part, attempt };
}

const SHARE_DECISIVE = 0.62;
/** Marks (weighted) and row counts below which a direction is not called. */
const RELIABLE_MARKS = 4;
const RELIABLE_MISTAKES = 4;

// ---------------------------------------------------------------------------
// Time-boxed prescription for an answering leak.
//
// "Do timed exam questions" is not a plan — a student told to practise
// technique will ask "for how long?". The recommendation names a concrete
// session the app can actually run: the /practice?quick=N timed mode comes
// only in 5- and 10-minute lengths (2 and 4 questions respectively), so the
// advice is sized to one of those two boxes rather than an unusable number.
//
// Sizing is proportional to the size of the leak: a run needs roughly one
// question per two marks of answering loss to be worth starting, and the
// 5-minute box covers the evidence floor (~4 weighted marks) while anything
// past 8 marks of answering loss earns the 10-minute box. The named focus
// comes from the top answering driver, so the student knows what to fix
// inside the clock — pacing for timing, obedience for command words, layout
// for structure. Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

export interface TimedSessionRecommendation {
  minutes: 5 | 10;
  questionCount: number;
  headline: string;
  rationale: string;
}

/** Weighted answering marks at or past which the 10-minute box wins. */
const TEN_MINUTE_MARKS = 8;

// ---------------------------------------------------------------------------
// Per-topic aggregation.
//
// A subject-level split can hide the shape of the leak: one topic's losses
// may be pure technique while the rest of the subject loses marks to missing
// knowledge. Splitting per topic — aggregating each topic's own losses with
// the same classifier, confidence weights and fractions as the subject view —
// lets the app aim the medicine: learn THIS topic, run timed questions on
// THAT one. Topics are keyed by the mistake's topicId, so a loss always lands
// on the topic where the mark was actually dropped.
// ---------------------------------------------------------------------------

export interface TopicTechniqueReport {
  topicId: Id;
  subjectId: string;
  report: KnowledgeAnsweringReport;
}

/**
 * Knowledge-vs-answering split aggregated per topic within one subject.
 * Returns one report per topic that has at least one loss, sorted by total
 * weighted marks lost (worst first) — the natural "where to aim" order.
 */
export function knowledgeVsAnsweringByTopic(
  input: Omit<KnowledgeAnsweringInput, "topicId">,
): TopicTechniqueReport[] {
  const byTopic = new Map<Id, Mistake[]>();
  for (const m of input.mistakes) {
    if (m.subjectId !== input.subjectId) continue;
    const list = byTopic.get(m.topicId) ?? [];
    list.push(m);
    byTopic.set(m.topicId, list);
  }
  const out = [...byTopic.entries()].map(([topicId, topicMistakes]) => ({
    topicId,
    subjectId: input.subjectId,
    report: knowledgeVsAnswering({ ...input, topicId, mistakes: topicMistakes }),
  }));
  return out.sort(
    (a, b) =>
      b.report.totalMarks - a.report.totalMarks || a.topicId.localeCompare(b.topicId),
  );
}

const DRIVER_FOCUS: Partial<Record<MistakeClass, string>> = {
  timing: "Watch the clock per part — the leak is pacing, not knowing.",
  "command word": "Obey the verb before writing: compare means both sides, state means the point only.",
  structure: "Signpost each point so the examiner can find it — separate lines, one idea per line.",
  "careless error": "Leave a minute to check units, signs and the question actually answered.",
  calculation: "Lay the working out line by line — the marks are in the method as much as the answer.",
  interpretation: "Read the figure twice before answering — the data was there.",
};

export function timedSessionRecommendation(
  report: KnowledgeAnsweringReport,
): TimedSessionRecommendation | null {
  if (report.verdict !== "answering") return null;

  const minutes: 5 | 10 = report.answeringMarks >= TEN_MINUTE_MARKS ? 10 : 5;
  const questionCount = quickSessionQuestionLimit(minutes);
  const focus = DRIVER_FOCUS[report.drivers[0]?.klass ?? "timing"];

  return {
    minutes,
    questionCount,
    headline: `A ${minutes}-minute timed run — ${questionCount} question${questionCount === 1 ? "" : "s"} against the clock, marked against the scheme.`,
    rationale:
      focus ?
        `Focus the run on ${report.drivers[0]?.klass}: ${focus}` :
        "Answer as you would in the hall, then mark honestly against the scheme.",
  };
}

export function knowledgeVsAnswering(input: KnowledgeAnsweringInput): KnowledgeAnsweringReport {
  const { subjectId, mistakes } = input;
  const rows = mistakes.filter(
    (m) => m.subjectId === subjectId && (input.topicId == null || m.topicId === input.topicId),
  );
  const questions = input.questions ? new Map(input.questions.map((q) => [q.id, q] as const)) : undefined;
  const attempts = input.attempts ? new Map(input.attempts.map((a) => [a.id, a] as const)) : undefined;

  let knowledgeMarks = 0;
  let answeringMarks = 0;
  let classifiedFromAnswers = 0;
  let mappedFromLegacy = 0;
  const byClass = new Map<MistakeClass, { marksLost: number; losses: number }>();

  for (const mistake of rows) {
    const { question, part, attempt } = lookupContext(mistake, questions, attempts);
    const result = classifyMistake({ mistake, question, part, attempt });
    const evidenceWeight = CONFIDENCE_WEIGHT[result.confidence];
    if (result.confidence !== "low") classifiedFromAnswers += 1;
    else mappedFromLegacy += 1;

    const k = CLASS_KNOWLEDGE_FRACTION[result.klass];
    const contributed = mistake.marksLost * evidenceWeight;
    knowledgeMarks += contributed * k;
    answeringMarks += contributed * (1 - k);

    const tally = byClass.get(result.klass) ?? { marksLost: 0, losses: 0 };
    tally.marksLost += mistake.marksLost;
    tally.losses += 1;
    byClass.set(result.klass, tally);
  }

  // Round to 0.01: 0.1 precision would inflate quarter-weight legacy rows
  // (0.05 → 0.1) and shift an honest 50/50 towards a direction.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  knowledgeMarks = round2(knowledgeMarks);
  answeringMarks = round2(answeringMarks);
  const totalMarks = round2(knowledgeMarks + answeringMarks);
  const knowledgeShare = totalMarks ? knowledgeMarks / totalMarks : 0;
  const answeringShare = totalMarks ? answeringMarks / totalMarks : 0;

  const reliable = rows.length >= RELIABLE_MISTAKES && totalMarks >= RELIABLE_MARKS;
  let verdict: TechniqueVerdict = "none";
  let narrative = "";
  if (!rows.length) {
    verdict = "none";
    narrative = "No marks lost on this subject yet.";
  } else if (!reliable) {
    verdict = "too-early";
    narrative =
      rows.length === 1
        ? "One loss isn't a pattern — the knowledge/answering split firms up after a few marked questions."
        : `Only ${rows.length} losses so far — the knowledge/answering split firms up as marked questions add up.`;
  } else if (knowledgeShare >= SHARE_DECISIVE) {
    verdict = "knowledge";
    narrative = `Knowledge is the leak: ~${Math.round(knowledgeShare * 100)}% of lost marks are content not known. Learning the topic will earn more than another question run.`;
  } else if (answeringShare >= SHARE_DECISIVE) {
    verdict = "answering";
    narrative = `Answering is the leak: ~${Math.round(answeringShare * 100)}% of lost marks are exam technique (command words, structure, timing, working) on content you know. Timed exam questions, marked against the scheme, are the fix.`;
  } else {
    verdict = "mixed";
    narrative = `Mixed leak: ~${Math.round(knowledgeShare * 100)}% knowledge / ~${Math.round(answeringShare * 100)}% answering. Alternate learning with timed exam questions.`;
  }

  const drivers: ClassDriver[] = [...byClass.entries()]
    .map(([klass, tally]) => ({ klass, marksLost: tally.marksLost, losses: tally.losses }))
    .sort((a, b) => b.marksLost - a.marksLost || a.klass.localeCompare(b.klass))
    .slice(0, 3);

  return {
    subjectId,
    topicId: input.topicId ?? null,
    knowledgeMarks,
    answeringMarks,
    totalMarks,
    knowledgeShare: Math.round(knowledgeShare * 1000) / 1000,
    answeringShare: Math.round(answeringShare * 1000) / 1000,
    mistakes: rows.length,
    classifiedFromAnswers,
    mappedFromLegacy,
    reliable,
    verdict,
    narrative,
    drivers,
  };
}
