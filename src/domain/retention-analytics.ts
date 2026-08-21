// ---------------------------------------------------------------------------
// Retention at 1/7/30 days + marks-per-hour (marks gained per revision hour).
//
// Why these live together: both answer "is today's revision sticking?".
// - Retention answers it from spaced-repetition evidence (FSRS stability,
//   graded review logs).
// - Marks-per-hour answers it from assessment evidence (awarded marks over
//   elapsed time on exam questions / papers).
//
// Both are *measured* from real attempts and review logs — not predicted.
// The prediction layer (mastery, recommender, grade calibration) reads these.
// Thin-evidence branches return null rather than a noisy number, so the UI can
// say "not enough yet" instead of flashing a volatile 73%.
// ---------------------------------------------------------------------------

import type { AssessmentInsight, Attempt, Card, Id, IsoDate, Mistake, ReviewLog, TechniqueVsKnowledge } from "./types";
import { retrievability, todayIso } from "./scheduling";

export const RETENTION_CHECKPOINTS: ReadonlyArray<1 | 7 | 30> = [1, 7, 30] as const;
export type RetentionCheckpoint = (typeof RETENTION_CHECKPOINTS)[number];
export const MIN_REVIEWS_FOR_RETENTION = 20;
export const MIN_ATTEMPTS_FOR_MARKS_PER_HOUR = 6;

/** True retention measured from review logs over a trailing window. */
export interface RetentionWindow {
  checkpoint: RetentionCheckpoint;
  /** Trailing window in days ending today (1: yesterday only, 7: last 7 days, 30: last 30 days). */
  windowDays: number;
  reviews: number;
  recalled: number;
  /** recalled / reviews, null when thin evidence. */
  retention: number | null;
  /** Predicted retention from average FSRS retrievability, for honesty. */
  predictedRetention: number | null;
  /** |retention - predictedRetention| when both present. */
  gap: number | null;
}

export interface RetentionReport {
  /** One point per checkpoint, newest-first by checkpoint size. */
  checkpoints: RetentionWindow[];
  /** Overall (30d) measured retention, or null when < MIN_REVIEWS. */
  overallRetention: number | null;
  /** One-line explainer for the UI. */
  narrative: string;
}

function daysBetweenIso(a: IsoDate, b: IsoDate): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

function isoDateDaysAgo(today: IsoDate, days: number): IsoDate {
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Mean FSRS retrievability for the given cards right now. */
export function averageRetrievability(cards: Card[], now: Date = new Date()): number | null {
  if (!cards.length) return null;
  const vals = cards
    .map((c) => retrievability(c, now))
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Build the 1/7/30-day retention report from real review logs.
 * Scoped to the given cards where relevant (for predicted retention).
 */
export function retentionReport(input: {
  reviewLogs: ReviewLog[];
  cards?: Card[];
  today?: IsoDate;
  now?: Date;
}): RetentionReport {
  const now = input.now ?? new Date();
  const today = input.today ?? todayIso(now);
  const logs = input.reviewLogs;
  const avgPred = input.cards?.length ? averageRetrievability(input.cards, now) : null;

  const checkpoints: RetentionWindow[] = RETENTION_CHECKPOINTS.map((cp) => {
    const windowDays = cp === 1 ? 1 : cp;
    const since = isoDateDaysAgo(today, windowDays);
    const inWindow = logs.filter((l) => {
      const d = l.reviewedAt.slice(0, 10);
      return d > since && d <= today;
    });
    const recalled = inWindow.filter((l) => l.grade !== "again").length;
    const retention = inWindow.length ? recalled / inWindow.length : null;
    const thin = inWindow.length < (cp === 1 ? 8 : MIN_REVIEWS_FOR_RETENTION / 3);
    const ret = thin && inWindow.length < 8 ? null : retention;
    return {
      checkpoint: cp,
      windowDays,
      reviews: inWindow.length,
      recalled,
      retention: ret != null ? Math.round(ret * 1000) / 1000 : null,
      predictedRetention: avgPred != null ? Math.round(avgPred * 1000) / 1000 : null,
      gap:
        ret != null && avgPred != null ? Math.round(Math.abs(ret - avgPred) * 1000) / 1000 : null,
    };
  });

  const overallWindow = checkpoints.find((c) => c.checkpoint === 30) ?? checkpoints[checkpoints.length - 1];
  const overallRetention =
    overallWindow.reviews >= MIN_REVIEWS_FOR_RETENTION ? overallWindow.retention : null;

  let narrative: string;
  if (logs.length < MIN_REVIEWS_FOR_RETENTION) {
    narrative = `Only ${logs.length} reviews recorded — retention will stabilise once you have ${MIN_REVIEWS_FOR_RETENTION}+.`;
  } else if (overallRetention == null) {
    narrative = "Not enough recent reviews to measure 30-day retention.";
  } else if (overallRetention < 0.82) {
    narrative = `${Math.round(overallRetention * 100)}% recall over 30 days — below the 90% target. Intervals may be too long or study gaps too frequent.`;
  } else if (overallRetention <= 0.94) {
    narrative = `${Math.round(overallRetention * 100)}% recall — on target. Revision is sticking.`;
  } else {
    narrative = `${Math.round(overallRetention * 100)}% recall — above target. You may be over-reviewing; challenge harder cards.`;
  }

  return { checkpoints, overallRetention, narrative };
}

// ---------------------------------------------------------------------------
// Marks per revision hour
// ---------------------------------------------------------------------------

export interface MarksPerHourPoint {
  windowLabel: "1d" | "7d" | "30d" | "all";
  attempts: number;
  marksGained: number;
  marksAvailable: number;
  hours: number;
  /** marksGained / hours, null when hours == 0 or attempts < threshold. */
  marksPerHour: number | null;
  accuracy: number | null;
}

export interface MarksPerHourReport {
  points: MarksPerHourPoint[];
  /** 30-day marks/hour, headline metric. */
  headlineMarksPerHour: number | null;
  narrative: string;
}

function hoursFromAttempts(attempts: Attempt[]): number {
  const ms = attempts.reduce((a, x) => a + (x.elapsedMs ?? 0), 0);
  return ms / 3_600_000;
}

function windowAttempts(attempts: Attempt[], today: IsoDate, windowLabel: MarksPerHourPoint["windowLabel"]): Attempt[] {
  if (windowLabel === "all") return attempts;
  const days = windowLabel === "1d" ? 1 : windowLabel === "7d" ? 7 : 30;
  const since = isoDateDaysAgo(today, days);
  return attempts.filter((a) => {
    const d = a.createdAt.slice(0, 10);
    return d > since && d <= today;
  });
}

/**
 * Marks gained per revision hour from real attempt timing.
 * `elapsedMs` is wall-clock time on the attempt — honest, not inflated.
 */
export function marksPerHourReport(input: {
  attempts: Attempt[];
  today?: IsoDate;
  now?: Date;
}): MarksPerHourReport {
  const today = input.today ?? todayIso(input.now ?? new Date());
  const windows: MarksPerHourPoint["windowLabel"][] = ["1d", "7d", "30d", "all"];
  const points: MarksPerHourPoint[] = windows.map((label) => {
    const inWindow = windowAttempts(input.attempts, today, label);
    const n = inWindow.length;
    const gained = inWindow.reduce((a, x) => a + x.awarded, 0);
    const avail = inWindow.reduce((a, x) => a + x.max, 0);
    const hours = hoursFromAttempts(inWindow);
    const perHour =
      hours > 0 && n >= (label === "1d" ? 2 : label === "7d" ? 4 : MIN_ATTEMPTS_FOR_MARKS_PER_HOUR)
        ? gained / hours
        : null;
    return {
      windowLabel: label,
      attempts: n,
      marksGained: gained,
      marksAvailable: avail,
      hours: Math.round(hours * 100) / 100,
      marksPerHour: perHour != null ? Math.round(perHour * 10) / 10 : null,
      accuracy: avail ? Math.round((gained / avail) * 1000) / 1000 : null,
    };
  });

  const headlineMarksPerHour = points.find((p) => p.windowLabel === "30d")?.marksPerHour ?? null;
  let narrative: string;
  const allAttempts = input.attempts.length;
  if (allAttempts < MIN_ATTEMPTS_FOR_MARKS_PER_HOUR) {
    narrative = `Only ${allAttempts} timed attempts — marks-per-hour will appear after ${MIN_ATTEMPTS_FOR_MARKS_PER_HOUR}.`;
  } else if (headlineMarksPerHour == null) {
    narrative = "Not enough timed attempts in the last 30 days to measure marks-per-hour.";
  } else if (headlineMarksPerHour < 8) {
    narrative = `${headlineMarksPerHour.toFixed(1)} marks/hour (30d) — focus on high-yield weak topics to lift throughput.`;
  } else {
    narrative = `${headlineMarksPerHour.toFixed(1)} marks/hour (30d) — keep targeting the highest marks-per-minute topics.`;
  }

  return { points, headlineMarksPerHour, narrative };
}

// ---------------------------------------------------------------------------
// Exam technique vs knowledge diagnosis
// ---------------------------------------------------------------------------

export type { TechniqueVsKnowledge } from "./types";

const KNOWLEDGE_TAGS = new Set(["recall", "conceptual", "terminology", "method-skipped", "rearrangement", "substitution-slips"]);
const TECHNIQUE_TAGS = new Set(["misread-command", "units", "significant-figures", "graph-reading", "method-skipped"]);

function mistakeWeightForKnowledgeTechnique(m: Mistake): { knowledge: number; technique: number } {
  // AO is the strongest signal; category/tag is the fallback.
  const ao = (m.ao ?? "").toUpperCase();
  if (ao === "AO1") return { knowledge: m.marksLost, technique: 0 };
  if (ao === "AO2" || ao === "AO3") {
    // AO2/3 mix; timing pushes to technique, otherwise 60/40 technique/knowledge
    if (m.timing === "rushed" || m.timing === "slow") return { knowledge: 0, technique: m.marksLost };
  }
  // Category / misconception fallback
  if (m.category === "recall") return { knowledge: m.marksLost, technique: 0 };
  if (m.category === "communication" || m.category === "interpretation") return { knowledge: 0, technique: m.marksLost };
  if (m.category === "arithmetic") return { knowledge: 0, technique: m.marksLost };
  if (m.category === "method") return { knowledge: m.marksLost * 0.6, technique: m.marksLost * 0.4 };
  if (m.misconception && KNOWLEDGE_TAGS.has(m.misconception)) {
    if (m.misconception === "method-skipped") return { knowledge: m.marksLost * 0.5, technique: m.marksLost * 0.5 };
    return { knowledge: m.marksLost, technique: 0 };
  }
  if (m.misconception && TECHNIQUE_TAGS.has(m.misconception)) return { knowledge: 0, technique: m.marksLost };
  // Unclassified → split
  return { knowledge: m.marksLost * 0.5, technique: m.marksLost * 0.5 };
}

export function techniqueVsKnowledge(
  mistakes: Mistake[],
  _insight?: AssessmentInsight,
): TechniqueVsKnowledge {
  let knowledgeLost = 0;
  let techniqueLost = 0;
  for (const m of mistakes) {
    const w = mistakeWeightForKnowledgeTechnique(m);
    knowledgeLost += w.knowledge;
    techniqueLost += w.technique;
  }
  const totalLost = knowledgeLost + techniqueLost;
  const knowledgeShare = totalLost ? knowledgeLost / totalLost : 0;
  const techniqueShare = totalLost ? techniqueLost / totalLost : 0;
  const reliable = mistakes.length >= 8 && totalLost >= 10;
  let narrative: string;
  const drivers: string[] = [];
  if (!mistakes.length) {
    narrative = "No marked mistakes yet — technique vs knowledge will appear after a few marked questions.";
  } else if (totalLost === 0) {
    narrative = "No marks lost to classify.";
  } else if (techniqueShare >= 0.62) {
    narrative = `Technique is the bottleneck: ~${Math.round(techniqueShare * 100)}% of lost marks are exam technique (timing, command words, units) rather than missing knowledge. Target timed practice.`;
    drivers.push("exam-technique");
  } else if (knowledgeShare >= 0.62) {
    narrative = `Knowledge is the bottleneck: ~${Math.round(knowledgeShare * 100)}% of lost marks trace to recall or conceptual gaps. Prioritise learning and flashcards.`;
    drivers.push("knowledge-gap");
  } else {
    narrative = `Mixed: ~${Math.round(techniqueShare * 100)}% technique / ~${Math.round(knowledgeShare * 100)}% knowledge. Balance timed practice with consolidation.`;
    drivers.push("mixed");
  }
  if (mistakes.some((m) => m.timing === "rushed")) drivers.push("rushing");
  if (mistakes.some((m) => m.timing === "slow")) drivers.push("time-management");
  return {
    knowledgeLost: Math.round(knowledgeLost * 10) / 10,
    techniqueLost: Math.round(techniqueLost * 10) / 10,
    knowledgeShare: Math.round(knowledgeShare * 1000) / 1000,
    techniqueShare: Math.round(techniqueShare * 1000) / 1000,
    totalLost: Math.round(totalLost * 10) / 10,
    reliable,
    narrative,
    drivers,
  };
}

// ---------------------------------------------------------------------------
// Paper-level analytics
// ---------------------------------------------------------------------------

export interface PaperAnalytics {
  /** Paper subject id. */
  subjectId: Id;
  paperSpecId: Id | null;
  attempts: number;
  marksGained: number;
  marksAvailable: number;
  /** Accuracy 0–1. */
  accuracy: number | null;
  hours: number;
  marksPerHour: number | null;
  /** Mean predicted vs actual delta — positive means outperforming prediction. */
  predictionBias: number | null;
  /** Best/worst topic on this paper by accuracy. */
  bestTopicId: Id | null;
  worstTopicId: Id | null;
}

/**
 * Group attempts into paper-level aggregates (by paperSpecId when present,
 * otherwise by subject). Requires each attempt to carry elapsedMs for hours.
 */
export function paperAnalytics(input: {
  attempts: Attempt[];
  questionsById?: Map<Id, import("./types").Question>;
}): PaperAnalytics[] {
  const attempts = input.attempts;
  if (!attempts.length) return [];

  // Group by (subjectId, paperSpecId). Fall back to subject-level when paper unknown.
  const keyFor = (a: Attempt): string => `${a.subjectId}::${a.paperSpecId ?? "unknown"}`;
  const byKey = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const k = keyFor(a);
    const list = byKey.get(k) ?? [];
    list.push(a);
    byKey.set(k, list);
  }

  const out: PaperAnalytics[] = [];
  for (const [key, list] of byKey) {
    const [subjectId, paperSpecIdRaw] = key.split("::");
    const paperSpecId = paperSpecIdRaw !== "unknown" ? paperSpecIdRaw : null;
    const marksGained = list.reduce((a, x) => a + x.awarded, 0);
    const marksAvailable = list.reduce((a, x) => a + x.max, 0);
    const accuracy = marksAvailable ? marksGained / marksAvailable : null;
    const hours = hoursFromAttempts(list);
    const marksPerHour = hours > 0 ? marksGained / hours : null;

    // Per-topic accuracy for best/worst
    const byTopic = new Map<Id, { gained: number; avail: number }>();
    for (const a of list) {
      for (const tid of a.topicIds) {
        const cur = byTopic.get(tid) ?? { gained: 0, avail: 0 };
        cur.gained += a.awarded / Math.max(1, a.topicIds.length);
        cur.avail += a.max / Math.max(1, a.topicIds.length);
        byTopic.set(tid, cur);
      }
    }
    let bestTopicId: Id | null = null;
    let worstTopicId: Id | null = null;
    let bestAcc = -1;
    let worstAcc = 2;
    for (const [tid, v] of byTopic) {
      const acc = v.avail ? v.gained / v.avail : 0;
      if (acc > bestAcc) { bestAcc = acc; bestTopicId = tid; }
      if (acc < worstAcc) { worstAcc = acc; worstTopicId = tid; }
    }

    out.push({
      subjectId,
      paperSpecId,
      attempts: list.length,
      marksGained,
      marksAvailable,
      accuracy: accuracy != null ? Math.round(accuracy * 1000) / 1000 : null,
      hours: Math.round(hours * 100) / 100,
      marksPerHour: marksPerHour != null ? Math.round(marksPerHour * 10) / 10 : null,
      predictionBias: null,
      bestTopicId,
      worstTopicId,
    });
  }

  return out.sort((a, b) => b.marksGained - a.marksGained);
}

// ---------------------------------------------------------------------------
// Unified dashboard snapshot — what Phase 5 adds to the existing analytics.
// Combines retention + marks/hour + paper + technique vs knowledge.
// ---------------------------------------------------------------------------

export interface DashboardSnapshot {
  retention: RetentionReport;
  marksPerHour: MarksPerHourReport;
  papers: PaperAnalytics[];
  techniqueVsKnowledge: TechniqueVsKnowledge;
  /** Short synthesis the page can render above the four cards. */
  headline: string;
}

export function dashboardSnapshot(input: {
  reviewLogs: ReviewLog[];
  cards?: Card[];
  attempts: Attempt[];
  mistakes: Mistake[];
  today?: IsoDate;
  now?: Date;
}): DashboardSnapshot {
  const retention = retentionReport({ reviewLogs: input.reviewLogs, cards: input.cards, today: input.today, now: input.now });
  const marksPerHour = marksPerHourReport({ attempts: input.attempts, today: input.today, now: input.now });
  const papers = paperAnalytics({ attempts: input.attempts });
  const tk = techniqueVsKnowledge(input.mistakes);
  let headline: string;
  if (!input.reviewLogs.length && !input.attempts.length) {
    headline = "Not enough evidence yet — complete a few reviews and a timed question to see retention, pace, and technique signals.";
  } else if (tk.techniqueShare >= 0.62 && tk.reliable) {
    headline = tk.narrative;
  } else if (retention.overallRetention != null && retention.overallRetention < 0.82) {
    headline = retention.narrative;
  } else if (marksPerHour.headlineMarksPerHour != null && marksPerHour.headlineMarksPerHour < 8) {
    headline = marksPerHour.narrative;
  } else {
    headline = retention.narrative !== techniqueVsKnowledge([], undefined).narrative
      ? retention.narrative
      : "Core signals are stable — tighten technique under timed conditions to squeeze the next grade.";
  }
  return { retention, marksPerHour, papers, techniqueVsKnowledge: tk, headline };
}
