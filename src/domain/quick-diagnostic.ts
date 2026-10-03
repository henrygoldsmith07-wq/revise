// ---------------------------------------------------------------------------
// Quick cold-start diagnostic (about 5–10 minutes). It samples dimensions of
// skill rather than random questions, then reports what is weak, what merely
// looks strong, which errors repeat, and where evidence is missing.
//
// Questions are answered through the normal attempt pipeline, so this module
// only selects and summarises. It never predicts a grade.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { questionFamily } from "./learning-evidence";
import { ROOT_CAUSE_LABEL, type RootCause } from "./mistake-patterns";
import type { Id, Question } from "./types";

export type DiagnosticDimension =
  | "recall"
  | "standard-application"
  | "unfamiliar-application"
  | "calculation"
  | "explanation"
  | "command-word"
  | "prerequisite";

export const DIAGNOSTIC_DIMENSIONS: readonly DiagnosticDimension[] = [
  "recall", "standard-application", "calculation", "unfamiliar-application", "explanation", "command-word", "prerequisite",
];

export const DIMENSION_LABEL: Record<DiagnosticDimension, string> = {
  recall: "recall",
  "standard-application": "standard application",
  "unfamiliar-application": "unfamiliar application",
  calculation: "calculations",
  explanation: "explanation",
  "command-word": "command-word technique",
  prerequisite: "prerequisite knowledge",
};

export const QUICK_MIN_MINUTES = 5;
export const QUICK_MAX_MINUTES = 10;
const COMMAND_WORDS = /^\s*(evaluate|assess|discuss|justify|compare|suggest)\b/i;
const PASS = 0.6;
const STRONG = 0.75;

export interface QuickItem {
  questionId: Id;
  topicId: Id;
  dimension: DiagnosticDimension;
  marks: number;
  seconds: number;
}

export function dimensionOf(question: Question, opts: { prerequisite?: boolean } = {}): DiagnosticDimension {
  if (opts.prerequisite) return "prerequisite";
  const demand = question.learning?.demand ?? question.parts.map((p) => p.learning?.demand).find(Boolean);
  if (question.kind === "calculation" || demand === "calculation") return "calculation";
  if (demand === "transfer" || demand === "synoptic") return "unfamiliar-application";
  if (question.parts.some((p) => COMMAND_WORDS.test(p.prompt))) return "command-word";
  if (demand === "application") return "standard-application";
  if (demand === "explanation" || demand === "misconception" || question.kind === "extended") return "explanation";
  if (question.kind === "mcq" || question.kind === "short" || demand === "recall") return "recall";
  return "standard-application";
}

export interface QuickSelection {
  items: QuickItem[];
  minutes: number;
  /** Dimensions with no trusted question available: reported as unmeasured, never skipped silently. */
  uncovered: DiagnosticDimension[];
}

/** Round-robin over dimensions, spreading topics, until the time budget is used. */
export function selectQuickDiagnostic(input: {
  questions: readonly Question[];
  /** Topics to sample, in priority order (enrolled / highest weight first). */
  topicIds: readonly Id[];
  prerequisiteTopicIds?: ReadonlySet<Id>;
  budgetMinutes?: number;
}): QuickSelection {
  const budget = Math.min(QUICK_MAX_MINUTES, Math.max(QUICK_MIN_MINUTES, input.budgetMinutes ?? 8)) * 60;
  const topics = new Set(input.topicIds);
  const pool = input.questions.filter((q) => trustedAssessmentContent(q) && q.topicIds.some((t) => topics.has(t)));
  const byDimension = new Map<DiagnosticDimension, QuickItem[]>();
  for (const q of pool) {
    const topicId = input.topicIds.find((t) => q.topicIds.includes(t))!;
    const dimension = dimensionOf(q, { prerequisite: input.prerequisiteTopicIds?.has(topicId) });
    const item: QuickItem = { questionId: q.id, topicId, dimension, marks: q.totalMarks, seconds: Math.max(45, q.totalMarks * 45, (q.learning?.expectedMinutes ?? 0) * 60) };
    byDimension.set(dimension, [...(byDimension.get(dimension) ?? []), item]);
  }
  for (const list of byDimension.values()) list.sort((a, b) => a.seconds - b.seconds || a.questionId.localeCompare(b.questionId));

  const items: QuickItem[] = [];
  const families = new Set<string>();
  const byId = new Map(pool.map((q) => [q.id, q] as const));
  const topicCount = new Map<Id, number>();
  let used = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const dimension of DIAGNOSTIC_DIMENSIONS) {
      const list = byDimension.get(dimension) ?? [];
      const pick = [...list]
        .filter((i) => !families.has(questionFamily(byId.get(i.questionId)!)) && used + i.seconds <= budget)
        .sort((a, b) => (topicCount.get(a.topicId) ?? 0) - (topicCount.get(b.topicId) ?? 0) || input.topicIds.indexOf(a.topicId) - input.topicIds.indexOf(b.topicId))[0];
      if (!pick) continue;
      items.push(pick);
      families.add(questionFamily(byId.get(pick.questionId)!));
      topicCount.set(pick.topicId, (topicCount.get(pick.topicId) ?? 0) + 1);
      list.splice(list.indexOf(pick), 1);
      used += pick.seconds;
      progressed = true;
    }
  }
  return {
    items,
    minutes: Math.round(used / 60),
    uncovered: DIAGNOSTIC_DIMENSIONS.filter((d) => !items.some((i) => i.dimension === d)),
  };
}

export interface QuickProbe {
  topicId: Id;
  dimension: DiagnosticDimension;
  awarded: number;
  max: number;
  cause?: RootCause;
}

export interface QuickFinding {
  topicId: Id;
  verdict: "weak" | "strong" | "unproven" | "unmeasured";
  line: string;
}

export interface QuickDiagnosticReport {
  findings: QuickFinding[];
  weakDimensions: DiagnosticDimension[];
  repeatedErrors: Array<{ cause: RootCause; count: number }>;
  /** Topics with too little evidence either way. */
  needsEvidence: Id[];
  firstMission: { topicId: Id; reason: string } | null;
  caveat: string;
  lines: { found: string[]; next: string };
}

const frac = (p: QuickProbe) => (p.max > 0 ? p.awarded / p.max : 0);

export function quickDiagnosticReport(input: { probes: readonly QuickProbe[]; topicIds: readonly Id[]; topicTitle?: (id: Id) => string }): QuickDiagnosticReport {
  const title = input.topicTitle ?? ((id: Id) => id);
  const findings: QuickFinding[] = [];
  const needsEvidence: Id[] = [];
  for (const topicId of input.topicIds) {
    const probes = input.probes.filter((p) => p.topicId === topicId);
    if (!probes.length) {
      needsEvidence.push(topicId);
      findings.push({ topicId, verdict: "unmeasured", line: `Too little evidence for ${title(topicId)}.` });
      continue;
    }
    const rate = probes.reduce((s, p) => s + p.awarded, 0) / Math.max(1, probes.reduce((s, p) => s + p.max, 0));
    const failed = probes.filter((p) => frac(p) < PASS);
    const dims = new Set(probes.map((p) => p.dimension));
    if (rate < PASS) {
      const worst = failed[0] ?? probes[0]!;
      findings.push({ topicId, verdict: "weak", line: `${DIMENSION_LABEL[worst.dimension][0]!.toUpperCase()}${DIMENSION_LABEL[worst.dimension].slice(1)} looks weak in ${title(topicId)}.` });
    } else if (rate >= STRONG && probes.length >= 2 && dims.size >= 2) {
      findings.push({ topicId, verdict: "strong", line: `${title(topicId)} looks strong across ${dims.size} kinds of question, but a delayed check is still needed.` });
    } else {
      needsEvidence.push(topicId);
      findings.push({ topicId, verdict: "unproven", line: `${title(topicId)} looks fine so far, but ${probes.length === 1 ? "one question" : "this"} is too little to be sure.` });
    }
  }

  const weakByDim = new Map<DiagnosticDimension, { n: number; failed: number }>();
  for (const p of input.probes) {
    const e = weakByDim.get(p.dimension) ?? { n: 0, failed: 0 };
    weakByDim.set(p.dimension, { n: e.n + 1, failed: e.failed + (frac(p) < PASS ? 1 : 0) });
  }
  const weakDimensions = [...weakByDim].filter(([, e]) => e.failed > 0 && e.failed / e.n >= 0.5).map(([d]) => d);

  const causes = new Map<RootCause, number>();
  for (const p of input.probes) if (p.cause && p.cause !== "unclassified" && frac(p) < PASS) causes.set(p.cause, (causes.get(p.cause) ?? 0) + 1);
  const repeatedErrors = [...causes].filter(([, n]) => n >= 2).map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count);

  const weak = findings.filter((f) => f.verdict === "weak");
  const weakest = weak
    .map((f) => ({ f, rate: input.probes.filter((p) => p.topicId === f.topicId).reduce((s, p) => s + frac(p), 0) / input.probes.filter((p) => p.topicId === f.topicId).length }))
    .sort((a, b) => a.rate - b.rate || a.f.topicId.localeCompare(b.f.topicId))[0];
  const firstMission = weakest
    ? { topicId: weakest.f.topicId, reason: repeatedErrors[0] ? `${ROOT_CAUSE_LABEL[repeatedErrors[0].cause]} repeated across ${repeatedErrors[0].count} questions.` : `The clearest weakness found in ${title(weakest.f.topicId)}.` }
    : null;

  const found = [
    ...findings.filter((f) => f.verdict !== "unmeasured").map((f) => f.line),
    ...repeatedErrors.map((e) => `Repeated ${ROOT_CAUSE_LABEL[e.cause]} (${e.count} questions).`),
    ...findings.filter((f) => f.verdict === "unmeasured").map((f) => f.line),
  ];
  const next = firstMission
    ? `Start a repair mission on ${title(firstMission.topicId)}.`
    : needsEvidence.length ? `Answer a few more questions on ${title(needsEvidence[0]!)} so Revise can judge it.` : "Nothing clearly weak yet. Revise will schedule delayed checks on what looks strong.";
  return {
    findings, weakDimensions, repeatedErrors, needsEvidence, firstMission,
    caveat: "This is a quick sample, not a grade. Anything with one or two questions behind it is a first impression.",
    lines: { found, next },
  };
}
