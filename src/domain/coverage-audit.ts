// ---------------------------------------------------------------------------
// Content coverage audit — reports coverage by subject, spec point, topic,
// subtopic, command word, mark total, question type, difficulty, misconception,
// required practical, calculator/non-calculator, with provenance/review states.
// ---------------------------------------------------------------------------

import type { Id, Question, Topic } from "./types";

export type ProvenanceState = "official/past-paper" | "examiner-reviewed" | "teacher-reviewed" | "internally authored" | "ai-generated-draft" | "unreviewed";

function provenanceForQuestion(q: Question): ProvenanceState {
  const v = q.verification;
  const src = q.source;
  if (src === "past-paper" || q.origin === "past-paper") return "official/past-paper";
  if (v === "verified" && q.reviewer) return "examiner-reviewed";
  if (v === "checked") return "teacher-reviewed";
  if (src === "authored") return "internally authored";
  if (src === "generated") return "ai-generated-draft";
  return "unreviewed";
}

export interface CoverageByKey {
  key: string;
  total: number;
  percent: number;
}

export interface CoverageAuditReport {
  subjects: CoverageByKey[];
  specPoints: { total: number; verified: number; unverified: number; coveragePercent: number };
  topics: { total: number; withQuestions: number; withoutQuestions: number };
  subtopics: CoverageByKey[];
  commandWords: CoverageByKey[];
  markTotals: CoverageByKey[];
  questionTypes: CoverageByKey[];
  difficulties: CoverageByKey[];
  misconceptions: CoverageByKey[];
  requiredPracticals: CoverageByKey[];
  calculatorSplit: { calculator: number; nonCalculator: number; either: number };
  provenance: CoverageByKey[];
}

function groupCount<T>(items: T[], keyFn: (x: T) => string | string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const keys = (() => {
      const k = keyFn(item);
      return Array.isArray(k) ? k : [k];
    })();
    for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

function toPercents(map: Map<string, number>, total: number): CoverageByKey[] {
  return [...map.entries()]
    .map(([key, totalForKey]) => ({
      key,
      total: totalForKey,
      percent: total ? Math.round((totalForKey / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export function coverageAudit(input: {
  subjects: Array<{ id: Id }>;
  topics: Topic[];
  questions: Question[];
}): CoverageAuditReport {
  const { subjects, topics, questions } = input;
  const totalQuestions = questions.length;

  // Subjects
  const bySubject = groupCount(questions, (q) => q.subjectId);
  const subjectsReport = subjects.length
    ? subjects.map((s) => {
        const cnt = bySubject.get(s.id) ?? 0;
        return { key: s.id, total: cnt, percent: totalQuestions ? Math.round((cnt / totalQuestions) * 1000) / 10 : 0 };
      }).sort((a, b) => b.total - a.total)
    : toPercents(bySubject, totalQuestions);

  // Spec points
  const allSpecPoints = topics.flatMap((t) => t.specPoints ?? []);
  const verified = allSpecPoints.filter((sp) => sp.verification === "verified").length;
  const specPointsReport = {
    total: allSpecPoints.length,
    verified,
    unverified: allSpecPoints.length - verified,
    coveragePercent: allSpecPoints.length ? Math.round((verified / allSpecPoints.length) * 1000) / 10 : 0,
  };

  // Topics
  const topicsWithQ = new Set(questions.flatMap((q) => q.topicIds));
  const topicsReport = {
    total: topics.length,
    withQuestions: [...topicsWithQ].filter((id) => topics.some((t) => t.id === id)).length,
    withoutQuestions: topics.length - [...topicsWithQ].filter((id) => topics.some((t) => t.id === id)).length,
  };

  // Subtopics — approximated by unitId
  const byUnit = groupCount(topics, (t) => t.unitId);
  const subtopics = toPercents(byUnit, topics.length);

  // Command words — inferred from question text + command detection
  const byCommand = groupCount(questions, (q) => {
    const hay = `${q.stem} ${q.parts.map((p) => p.prompt).join(" ")}`.toLowerCase();
    const words = ["calculate", "describe", "explain", "evaluate", "compare", "state", "suggest", "discuss"];
    for (const w of words) if (hay.includes(w)) return w;
    return "other";
  });

  // Mark totals
  const byMarks = groupCount(questions, (q) => String(q.totalMarks));

  // Question types
  const byKind = groupCount(questions, (q) => q.kind);

  // Difficulties
  const byDiff = groupCount(questions, (q) => String(q.difficulty));

  // Misconceptions — via topic commonErrors presence (proxy)
  const misconceptionTopics = topics.filter((t) => t.commonErrors.length > 0).length;
  const misconceptions: CoverageByKey[] = [
    { key: "topics-with-misconception-library", total: misconceptionTopics, percent: topics.length ? Math.round((misconceptionTopics / topics.length) * 1000) / 10 : 0 },
    { key: "topics-without-misconception-library", total: topics.length - misconceptionTopics, percent: topics.length ? Math.round(((topics.length - misconceptionTopics) / topics.length) * 1000) / 10 : 0 },
  ];

  // Required practicals — questions tagged with practical
  const practicalCount = questions.filter((q) => {
    const hay = `${q.stem} ${q.parts.map((p) => p.prompt).join(" ")}`.toLowerCase();
    return hay.includes("practical") || hay.includes("experiment") || hay.includes("method") || q.topicIds.some((id) => id.includes("practical"));
  }).length;
  const requiredPracticals: CoverageByKey[] = [
    { key: "practical-linked", total: practicalCount, percent: totalQuestions ? Math.round((practicalCount / totalQuestions) * 1000) / 10 : 0 },
    { key: "non-practical", total: totalQuestions - practicalCount, percent: totalQuestions ? Math.round(((totalQuestions - practicalCount) / totalQuestions) * 1000) / 10 : 0 },
  ];

  // Calculator split
  const calculator = questions.filter((q) => q.calculatorAllowed).length;
  const nonCalculator = totalQuestions - calculator;

  // Provenance
  const byProv = groupCount(questions, (q) => provenanceForQuestion(q));

  return {
    subjects: subjectsReport,
    specPoints: specPointsReport,
    topics: topicsReport,
    subtopics,
    commandWords: toPercents(byCommand, totalQuestions),
    markTotals: toPercents(byMarks, totalQuestions),
    questionTypes: toPercents(byKind, totalQuestions),
    difficulties: toPercents(byDiff, totalQuestions),
    misconceptions,
    requiredPracticals,
    calculatorSplit: { calculator, nonCalculator, either: 0 },
    provenance: toPercents(byProv, totalQuestions),
  };
}
