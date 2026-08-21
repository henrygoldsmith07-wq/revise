// Assessment depth — the five assessment-specific slices that make revision feel
// like exam prep rather than flashcard completion.
// Pure functions: no React, no I/O.
import type {
  AoCode,
  AssessmentInsight,
  Attempt,
  Calibration,
  CommandWord,
  Id,
  MisconceptionTag,
  Mistake,
  PaperSimulation,
  Question,
  Topic,
  TopicMastery,
} from "./types";
import { gradeForPercent } from "./grades";
import type { Subject } from "./types";
import { measureQuestionBankDiscrimination } from "./question-discrimination";
import { techniqueVsKnowledge } from "./retention-analytics";

export const COMMAND_WORDS: CommandWord[] = [
  "state","describe","explain","calculate","show that","suggest","compare","evaluate","discuss","justify","deduce","predict","outline","other",
];

export const MISCONCEPTIONS: MisconceptionTag[] = [
  "units","significant-figures","rearrangement","substitution-slips","graph-reading","method-skipped","misread-command","terminology","conceptual","other",
];

const COMMAND_RE: Record<CommandWord, RegExp> = {
  "state": /\bstate\b/i,
  "describe": /\bdescribe\b/i,
  "explain": /\bexplain\b/i,
  "calculate": /\bcalculate\b/i,
  "show that": /\bshow that\b/i,
  "suggest": /\bsuggest\b/i,
  "compare": /\bcompare\b/i,
  "evaluate": /\bevaluate\b/i,
  "discuss": /\bdiscuss\b/i,
  "justify": /\bjustify\b/i,
  "deduce": /\bdeduce\b/i,
  "predict": /\bpredict\b/i,
  "outline": /\boutline\b/i,
  "other": /.^/,
};

const MISCONCEPTION_PATTERNS: Array<{ tag: MisconceptionTag; re: RegExp }> = [
  { tag: "units", re: /\bunit|kJ|J\b|m s-1|mol dm/i },
  { tag: "significant-figures", re: /sig fig|significant|decimal place/i },
  { tag: "rearrangement", re: /rearrange|subject of/i },
  { tag: "substitution-slips", re: /substitut|into the equation/i },
  { tag: "graph-reading", re: /\bgraph|gradient|intercept|area under/i },
  { tag: "method-skipped", re: /method|working|step/i },
  { tag: "misread-command", re: /command word|instruction/i },
  { tag: "terminology", re: /term|define|terminolog/i },
  { tag: "conceptual", re: /concept|misconception|principle/i },
];

export function commandOf(text: string): CommandWord {
  for (const c of COMMAND_WORDS) if (c !== "other" && COMMAND_RE[c].test(text)) return c;
  return "other";
}

export function misconceptionOf(missedPoints: string[]): MisconceptionTag {
  const hay = missedPoints.join(" ");
  for (const { tag, re } of MISCONCEPTION_PATTERNS) if (re.test(hay)) return tag;
  return "other";
}

export function timingLabel(secondsSpent: number | undefined, marks: number): Mistake["timing"] {
  if (secondsSpent == null) return "unknown";
  // 90s per mark is the honest A-level budget; <45 is rushed, >180 is stuck.
  const budget = marks * 90;
  if (secondsSpent < budget * 0.5) return "rushed";
  if (secondsSpent > budget * 2) return "slow";
  return "ok";
}

export function buildAssessmentInsight(input: {
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  questionsById: Map<Id, Question>;
}): AssessmentInsight {
  const byCommand = Object.fromEntries(COMMAND_WORDS.map((c) => [c, 0])) as Record<CommandWord, number>;
  const byMisconception = Object.fromEntries(MISCONCEPTIONS.map((m) => [m, 0])) as Record<MisconceptionTag, number>;
  const byAo: Record<string, number> = { AO1: 0, AO2: 0, AO3: 0 };
  const lostByTopic = new Map<string, { subjectId: Id; lost: number }>();
  for (const m of input.mistakes) {
    if (m.command) byCommand[m.command] = (byCommand[m.command] ?? 0) + m.marksLost;
    if (m.misconception) byMisconception[m.misconception] = (byMisconception[m.misconception] ?? 0) + m.marksLost;
    if (m.ao) byAo[m.ao] = (byAo[m.ao] ?? 0) + m.marksLost;
    const k = m.topicId;
    const cur = lostByTopic.get(k) ?? { subjectId: m.subjectId, lost: 0 };
    cur.lost += m.marksLost;
    lostByTopic.set(k, cur);
  }
  const masteryById = new Map(input.mastery.map((m) => [m.topicId, m]));
  const marksLostByTopic = [...lostByTopic.entries()].map(([topicId, v]) => {
    const mastery = masteryById.get(topicId)?.mastery ?? 0.4;
    // Recoverable: higher when mastery is low (fixing works) but not zero (some learning exists).
    const recoverable = Math.round(v.lost * (0.65 - mastery * 0.25));
    return { topicId, subjectId: v.subjectId, lost: v.lost, recoverable: Math.max(0, recoverable) };
  }).sort((a, b) => b.lost - a.lost);

  const marksLostByAo = byAo;
  // Repeated weak: topic appears 3+ times and is still weak.
  const countByTopic = new Map<string, number>();
  for (const m of input.mistakes) countByTopic.set(m.topicId, (countByTopic.get(m.topicId) ?? 0) + 1);
  const repeatedWeakSubtopics = [...countByTopic.entries()].filter(([, n]) => n >= 3).map(([id]) => id)
    .filter((id) => (masteryById.get(id)?.mastery ?? 1) < 0.65);

  // Expected marks per study hour: recoverable / cost, cost = 60min * (1.5 - mastery).
  const expectedMarksPerHour = marksLostByTopic.slice(0, 8).map((row) => ({
    topicId: row.topicId,
    value: Math.round((row.recoverable / 60) * 60 * 10) / 10, // ~marks per 60m for now; scale refined below
  }));
  // Normalise: scale so the best topic shows the true rate — use recoverable directly as 60m gain.
  for (const r of expectedMarksPerHour) {
    const row = marksLostByTopic.find((x) => x.topicId === r.topicId)!;
    // 1h on a topic recovers ~60-80% of recoverable if mastery < 0.6
    r.value = Math.round((row.recoverable * 0.75) * 10) / 10;
  }
  expectedMarksPerHour.sort((a, b) => b.value - a.value);

  const questionDiscrimination = measureQuestionBankDiscrimination({
    questions: [...input.questionsById.values()],
    attempts: input.attempts,
  });

  return {
    byCommand,
    byMisconception,
    marksLostByTopic,
    marksLostByAo,
    repeatedWeakSubtopics,
    expectedMarksPerHour,
    techniqueVsKnowledge: techniqueVsKnowledge(input.mistakes),
    questionDiscrimination,
  };
}

export function simulatePaper(input: {
  subject: Subject;
  paperSpecId: Id;
  questions: Question[];
  topicMastery: Map<Id, number>;
  calibration?: Calibration;
}): PaperSimulation {
  const totalMarks = input.questions.reduce((a, q) => a + q.totalMarks, 0);
  const timeMinutes = input.subject.papers.find((p) => p.id === input.paperSpecId)?.durationMinutes ?? 90;
  // Naive prediction: sum over questions of (topic mastery avg for that question).
  let raw = 0;
  const byTopic = new Map<string, { expected: number; available: number }>();
  for (const q of input.questions) {
    const masteryAvg = q.topicIds.length ? q.topicIds.reduce((a, id) => a + (input.topicMastery.get(id) ?? 0.4), 0) / q.topicIds.length : 0.4;
    const expected = q.totalMarks * (0.35 + masteryAvg * 0.6);
    raw += expected;
    for (const tid of q.topicIds) {
      const cur = byTopic.get(tid) ?? { expected: 0, available: 0 };
      cur.expected += expected / q.topicIds.length;
      cur.available += q.totalMarks / q.topicIds.length;
      byTopic.set(tid, cur);
    }
  }
  const calibrated = input.calibration ? raw * input.calibration.slope + input.calibration.bias : raw;
  const predictedMarks = Math.round(Math.max(0, Math.min(totalMarks, calibrated)));
  const grade = gradeForPercent(input.subject, totalMarks ? (predictedMarks / totalMarks) * 100 : 0);
  // Recoverable: 30% of the gap closes with one focused hour per weak topic.
  const recoverableMarks = Math.round((totalMarks - predictedMarks) * 0.3);
  return {
    paperSpecId: input.paperSpecId,
    subjectId: input.subject.id,
    questionIds: input.questions.map((q) => q.id),
    totalMarks,
    timeMinutes,
    predictedMarks,
    predictedGrade: grade,
    recoverableMarks,
    marksByTopic: [...byTopic.entries()].map(([topicId, v]) => ({ topicId, expected: Math.round(v.expected), available: Math.round(v.available) })),
  };
}

export function calibrateFromHistory(input: {
  subjectId: Id;
  pairs: Array<{ predicted: number; actual: number }>;
}): Calibration {
  const n = input.pairs.length;
  if (n < 3) return { subjectId: input.subjectId, bias: 0, slope: 1, sampleSize: n, mae: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of input.pairs) { sx += p.predicted; sy += p.actual; sxx += p.predicted * p.predicted; sxy += p.predicted * p.actual; }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 1 : (n * sxy - sx * sy) / denom;
  const bias = (sy - slope * sx) / n;
  const mae = input.pairs.reduce((a, p) => a + Math.abs(p.actual - (p.predicted * slope + bias)), 0) / n;
  return { subjectId: input.subjectId, bias, slope: Number.isFinite(slope) ? slope : 1, sampleSize: n, mae };
}
