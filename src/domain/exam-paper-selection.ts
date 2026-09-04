// ---------------------------------------------------------------------------
// Intelligent exam-paper selection — which paper to sit next.
//
// Every extracted paper is a candidate; sitting the right one next is worth
// more than sitting any one. A paper is ranked on six measured signals:
//
//   coverage   — how much of the enrolled syllabus it samples (breadth)
//   weakness   — share of its marks that land on topics with real negative
//                evidence (recent losses, open mistakes, a weak/fading
//                schedule, low recent accuracy)
//   difficulty — fit: no penalty for challenge that is within reach, a real
//                penalty for papers that are hard *and* on topics the student
//                has not secured
//   recency    — days since it was last sat (never sat = freshest)
//   exposure   — how many times it has been sat (fewer runs preferred)
//   gain       — predicted mark gain: marks recently lost in the topics this
//                paper tests (recoverable by re-sitting), plus a predicted
//                percentage when enough of its marks are on measured topics
//
// Honesty rules: recency/exposure come only from recorded paper runs
// (attempts carrying paperId); a paper is never called weak on speculation;
// predicted percent is shown only when most of the paper's marks sit on
// topics with measured mastery, and the *predicted mark gain* figure is real
// marks the student has actually dropped recently — never an invented score.
// Pure domain: no React, no storage; `now` is passed in.
// ---------------------------------------------------------------------------

import type { Attempt, Id, IsoInstant, Mistake, Paper, Question, Topic, TopicMastery } from "./types";

/** Losses older than this count as history, not as "what is wrong now". */
export const PAPER_SELECT_WINDOW_DAYS = 7;
/** A paper sat longer ago than this scores full recency. */
export const RECENCY_FULL_DAYS = 21;
/** More than this many runs earns no further "new paper" credit. */
export const EXPOSURE_SATURATION_RUNS = 3;
/** Paper marks on measured topics before a whole-paper predicted % is honest. */
export const PREDICT_MIN_MEASURED_SHARE = 0.6;
/** Accuracy below which recent attempts on a topic count against it. */
export const SELECT_LOW_ACCURACY = 0.6;

/**
 * Target-grade fit gate. A paper is only skipped when its predicted percent
 * lands FAR from what the target needs — never for a near miss (a paper you
 * scrape is still worth sitting). Percentages, not difficulty stars: a
 * 4/5-average paper on mastered topics can be exactly what a B needs.
 */
export const TARGET_SKIP_MARGIN = 15;

/** Minimum percent needed to reach a grade, from the subject's boundaries. */
export function neededPercentForGrade(
  gradeBoundaries: { grade: string; percent: number }[] | undefined,
  targetGrade: string | null | undefined,
): number | null {
  if (!gradeBoundaries?.length || !targetGrade) return null;
  const row = gradeBoundaries.find((b) => b.grade === targetGrade);
  return row ? row.percent : null;
}

/** Factor weights — weakness and gain lead; coverage, recency, exposure and difficulty balance it. */
export const PAPER_SELECT_WEIGHTS = {
  coverage: 0.15,
  weakness: 0.25,
  difficulty: 0.1,
  recency: 0.15,
  exposure: 0.15,
  gain: 0.2,
} as const;

export interface PaperFactor {
  score: number;
  label: string;
  /** Human sentence fragment for chips, e.g. "covers 4 of 14 topics". */
  detail: string;
}

/** The six ranking factors, keyed as in PAPER_SELECT_WEIGHTS. */
export type PaperFactorKey = keyof typeof PAPER_SELECT_WEIGHTS;

/**
 * The factor costing a paper the most rank position — surfaced under each
 * runner-up so skipping the top pick is an informed choice, not a shrug.
 */
export interface WeakestFactor {
  key: PaperFactorKey;
  label: string;
  detail: string;
  /** Weighted rank points lost versus a perfect factor score (0–weight]. */
  shortfall: number;
  /**
   * The concrete fix this factor points at, when one exists: review the weak
   * topic (knowledge gap) or a timed run on the topic where marks are going
   * (recoverable losses). Null for factors no session can fix (recency,
   * exposure, difficulty, coverage) — the line explains, it does not invent.
   */
  fix?: WeakestFactorFix | null;
}

export interface WeakestFactorFix {
  /** "review" re-learns the weak topic; "timed" clocks questions against the leak. */
  kind: "review" | "timed";
  topicId: Id;
  topicTitle: string | null;
  href: string;
}

export interface PaperCandidate {
  paperId: Id;
  title: string;
  totalMarks: number;
  questionCount: number;
  /** Distinct syllabus topics the paper samples. */
  topicCount: number;
  /** Average question difficulty (1–5) weighted by marks. */
  averageDifficulty: number | null;
  /** 0–1 composite; bigger = sit this one next. */
  score: number;
  factors: {
    coverage: PaperFactor;
    weakness: PaperFactor;
    difficulty: PaperFactor;
    recency: PaperFactor;
    exposure: PaperFactor;
    gain: PaperFactor;
  };
  /** The factor costing this paper the most rank position; null when nothing is holding it back. */
  weakestFactor: WeakestFactor | null;
  /** Predicted % on this paper from measured topic mastery; null when too little is measured. */
  predictedPercent: number | null;
  /** Marks dropped in the window on the topics this paper tests. */
  recentLossMarks: number;
  /** Number of recorded runs of this paper. */
  runs: number;
  /** Days since the last run, or null when never sat. */
  daysSinceLastRun: number | null;
  /** One plain sentence: why this paper ranks where it does. */
  reason: string;
}

export interface PaperSelectionResult {
  /** All sit-able papers for the subject, best first. */
  candidates: PaperCandidate[];
  recommended: PaperCandidate | null;
  /** Papers set aside by the target-grade fit gate, with the honest why. */
  skipped: SkippedPaper[];
}

/** A paper held back because its predicted result is far from the target grade. */
export interface SkippedPaper {
  paperId: Id;
  title: string;
  predictedPercent: number;
  neededPercent: number;
  targetGrade: string;
  direction: "easier" | "harder";
  reason: string;
}

export interface PaperSelectionInput {
  subjectId: Id;
  papers: Paper[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  /** All topics of the subject (the syllabus it samples from). */
  topics: Topic[];
  /** The student's target grade for this subject; enables the fit gate when present. */
  targetGrade?: string | null;
  /** The subject's grade boundaries (grade → minimum percent); used with targetGrade. */
  gradeBoundaries?: { grade: string; percent: number }[];
  now?: Date;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function accuracyOf(rows: Attempt[]): number | null {
  const scorable = rows.filter((a) => a.max > 0);
  if (!scorable.length) return null;
  const awarded = scorable.reduce((sum, a) => sum + a.awarded, 0);
  const max = scorable.reduce((sum, a) => sum + a.max, 0);
  return max > 0 ? awarded / max : null;
}

/** Days between two ISO instants (0 when the older is after now). */
function daysBetween(fromIso: IsoInstant, toMs: number): number {
  return Math.max(0, Math.round((toMs - new Date(fromIso).getTime()) / 86_400_000));
}

/** Rank the subject's extracted papers. Papers with no usable questions are skipped. */
export function selectNextPaper(input: PaperSelectionInput): PaperSelectionResult {
  const now = input.now ?? new Date();
  const cutoffMs = now.getTime() - PAPER_SELECT_WINDOW_DAYS * 86_400_000;
  const inWindow = (at: IsoInstant) => new Date(at).getTime() >= cutoffMs;

  const questionById = new Map(input.questions.map((q) => [q.id, q] as const));
  const topicById = new Map(input.topics.map((t) => [t.id, t] as const));
  const masteryById = new Map(input.mastery.map((m) => [m.topicId, m] as const));

  const subjectPapers = input.papers.filter(
    (p) => p.subjectId === input.subjectId && p.questionIds.length > 0,
  );

  const paperPayloads = subjectPapers
    .map((paper) => {
      const resolved = paper.questionIds
        .map((id) => questionById.get(id))
        .filter((q): q is Question => Boolean(q));
      if (!resolved.length) return null;
      return { paper, resolved };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // --- per-paper signals -----------------------------------------------------

  interface PaperSignals {
    paperId: Id;
    title: string;
    topicIds: Id[];
    marksByTopic: Map<Id, number>;
    totalMarks: number;
    averageDifficulty: number;
    recentLossMarks: number;
    lossTopics: Id[];
    runs: number;
    lastRunAt: string | null;
    predictedPercent: number | null;
    measuredShare: number;
    measuredMarks: number;
  }

  const signals: PaperSignals[] = paperPayloads.map(({ paper, resolved }) => {
    const marksByTopic = new Map<Id, number>();
    let weightedDifficulty = 0;
    for (const q of resolved) {
      const marks = q.totalMarks || 1;
      weightedDifficulty += q.difficulty * marks;
      for (const topicId of q.topicIds) {
        if (!topicById.has(topicId)) continue;
        marksByTopic.set(topicId, (marksByTopic.get(topicId) ?? 0) + marks);
      }
    }
    const topicIds = [...marksByTopic.keys()];
    const totalMarks = Math.max(1, [...marksByTopic.values()].reduce((s, m) => s + m, 0));

    // Recent losses are marks dropped on these topics inside the window — the
    // recoverable pool this paper actually re-tests.
    let recentLossMarks = 0;
    const lossTopics = new Set<Id>();
    for (const mistake of input.mistakes) {
      if (mistake.subjectId !== input.subjectId) continue;
      if (!marksByTopic.has(mistake.topicId)) continue;
      if (!inWindow(mistake.createdAt)) continue;
      recentLossMarks += mistake.marksLost;
      lossTopics.add(mistake.topicId);
    }

    // Recorded runs of this paper: attempts carrying the paper's id.
    const paperAttempts = input.attempts.filter((a) => a.paperId === paper.id);
    const runTimes = new Set(paperAttempts.map((a) => a.paperRunId).filter((r): r is string => Boolean(r)));
    const runs = runTimes.size;
    let lastRunAt: string | null = null;
    for (const attempt of paperAttempts) {
      if (lastRunAt == null || attempt.createdAt > lastRunAt) lastRunAt = attempt.createdAt;
    }

    // Predicted %: only over marks that sit on measured topics.
    let measuredMarks = 0;
    let expectedMarks = 0;
    for (const [topicId, marks] of marksByTopic) {
      const mastery = masteryById.get(topicId);
      if (!mastery || mastery.attempts <= 0) continue;
      measuredMarks += marks;
      expectedMarks += marks * mastery.mastery;
    }
    const measuredShare = measuredMarks / totalMarks;
    const predictedPercent =
      measuredShare >= PREDICT_MIN_MEASURED_SHARE && measuredMarks > 0
        ? Math.round((expectedMarks / measuredMarks) * 100)
        : null;

    return {
      paperId: paper.id,
      title: paper.title,
      topicIds,
      marksByTopic,
      totalMarks,
      averageDifficulty: resolved.length ? weightedDifficulty / totalMarks : 0,
      recentLossMarks,
      lossTopics: [...lossTopics],
      runs,
      lastRunAt,
      predictedPercent,
      measuredShare,
      measuredMarks,
    };
  });

  // --- negative evidence per topic (window losses, open mistakes, schedule) ---

  const negativeTopics = new Map<Id, { lossMarks: number; openMistakes: number }>();
  for (const mistake of input.mistakes) {
    if (mistake.subjectId !== input.subjectId) continue;
    if (!topicById.has(mistake.topicId)) continue;
    const entry = negativeTopics.get(mistake.topicId) ?? { lossMarks: 0, openMistakes: 0 };
    if (inWindow(mistake.createdAt)) entry.lossMarks += mistake.marksLost;
    if (!mistake.resolved) entry.openMistakes += 1;
    negativeTopics.set(mistake.topicId, entry);
  }

  const topicIsWeak = (topicId: Id): boolean => {
    const negative = negativeTopics.get(topicId);
    if (negative && (negative.lossMarks > 0 || negative.openMistakes > 0)) return true;
    const mastery = masteryById.get(topicId);
    if (mastery?.weak) return true;
    if (mastery && mastery.attempts > 0 && mastery.retention < 0.7) return true;
    // Low recent accuracy on the topic's questions also counts as weak.
    const recent = input.attempts.filter(
      (a) => a.topicIds.includes(topicId) && a.subjectId === input.subjectId && inWindow(a.createdAt),
    );
    if (recent.length >= 2 && (accuracyOf(recent) ?? 1) < SELECT_LOW_ACCURACY) return true;
    return false;
  };

  // --- factor scores ---------------------------------------------------------

  const cohortMaxTopics = Math.max(1, ...signals.map((s) => s.topicIds.length));
  const cohortMaxLossShare = Math.max(0, ...signals.map((s) => s.recentLossMarks / s.totalMarks));

  const candidates: PaperCandidate[] = signals.map((s) => {
    // coverage — breadth over the syllabus, relative to the cohort.
    const coverageScore = s.topicIds.length / cohortMaxTopics;
    const coverageDetail = `covers ${s.topicIds.length} of ${input.topics.length} ${input.topics.length === 1 ? "topic" : "topics"}`;

    // weakness — share of this paper's marks on negative-evidence topics.
    let weakMarks = 0;
    for (const [topicId, marks] of s.marksByTopic) if (topicIsWeak(topicId)) weakMarks += marks;
    const weaknessScore = clamp01(weakMarks / s.totalMarks);
    const weaknessDetail = weaknessScore === 0
      ? "none of its topics are weak right now"
      : `${weakMarks} of ${s.totalMarks} marks sit on topics with recent losses, open mistakes or low accuracy`;

    // difficulty — challenge relative to what the student has secured on this
    // paper's topics. Hard is fine when the ability is there; punishing when not.
    const abilityOnPaper = measuredAbility(s, masteryById);
    const difficultyGap = Math.max(0, s.averageDifficulty / 5 - abilityOnPaper);
    const difficultyScore = clamp01(1 - 1.5 * difficultyGap);
    const difficultyDetail = `${s.averageDifficulty.toFixed(1)}/5 difficulty` +
      (difficultyGap > 0 && abilityOnPaper < 0.75
        ? ` · harder than your ${Math.round(abilityOnPaper * 100)}% mastery on these topics`
        : "");

    // recency — days since the last recorded run (never sat = freshest).
    const daysSince = s.lastRunAt ? daysBetween(s.lastRunAt, now.getTime()) : null;
    const recencyScore = daysSince == null ? 1 : clamp01(daysSince / RECENCY_FULL_DAYS);
    const recencyDetail = daysSince == null
      ? "never sat"
      : daysSince === 0
        ? "sat today"
        : `last sat ${daysSince} ${daysSince === 1 ? "day" : "days"} ago`;

    // exposure — fewer recorded runs preferred; saturation at 3.
    const exposureScore = s.runs === 0 ? 1 : clamp01(1 - s.runs / EXPOSURE_SATURATION_RUNS);
    const exposureDetail = s.runs === 0
      ? "no recorded runs"
      : `${s.runs} ${s.runs === 1 ? "run" : "runs"} so far`;

    // gain — predicted mark gain: real recent losses the paper can recover.
    const gainScore = cohortMaxLossShare > 0 ? clamp01((s.recentLossMarks / s.totalMarks) / cohortMaxLossShare) : 0;
    const gainDetail =
      s.recentLossMarks > 0
        ? `≈${s.recentLossMarks} mark${s.recentLossMarks === 1 ? "" : "s"} recently lost in the topics it tests`
        : s.predictedPercent != null
          ? `predicted ≈${s.predictedPercent}%`
          : "no recent losses in its topics yet";

    const score =
      PAPER_SELECT_WEIGHTS.coverage * coverageScore +
      PAPER_SELECT_WEIGHTS.weakness * weaknessScore +
      PAPER_SELECT_WEIGHTS.difficulty * difficultyScore +
      PAPER_SELECT_WEIGHTS.recency * recencyScore +
      PAPER_SELECT_WEIGHTS.exposure * exposureScore +
      PAPER_SELECT_WEIGHTS.gain * gainScore;

    const factors = {
      coverage: { score: coverageScore, label: "Coverage", detail: coverageDetail },
      weakness: { score: weaknessScore, label: "Weakness", detail: weaknessDetail },
      difficulty: { score: difficultyScore, label: "Difficulty", detail: difficultyDetail },
      recency: { score: recencyScore, label: "Recency", detail: recencyDetail },
      exposure: { score: exposureScore, label: "Exposure", detail: exposureDetail },
      gain: { score: gainScore, label: "Predicted gain", detail: gainDetail },
    };

    // The concrete fix behind the two actionable factors. Weakness: the
    // heaviest weak topic this paper touches — reviewing it beats sitting a
    // paper that barely targets the leak. Gain: the topic where the most
    // window marks were actually LOST (paper marks only break ties) — clocked
    // questions there recover them faster than another full paper.
    let topWeakTopic: { topicId: Id; marks: number } | null = null;
    let topLossTopic: { topicId: Id; lost: number; marks: number } | null = null;
    for (const [topicId, marks] of s.marksByTopic) {
      if (topicIsWeak(topicId) && (!topWeakTopic || marks > topWeakTopic.marks)) {
        topWeakTopic = { topicId, marks };
      }
      if (s.lossTopics.includes(topicId)) {
        const lost = negativeTopics.get(topicId)?.lossMarks ?? 0;
        if (!topLossTopic || lost > topLossTopic.lost || (lost === topLossTopic.lost && marks > topLossTopic.marks)) {
          topLossTopic = { topicId, lost, marks };
        }
      }
    }
    const fixFor: Partial<Record<PaperFactorKey, WeakestFactorFix>> = {};
    if (topWeakTopic) {
      fixFor.weakness = {
        kind: "review",
        topicId: topWeakTopic.topicId,
        topicTitle: topicById.get(topWeakTopic.topicId)?.title ?? null,
        href: `/review?subject=${input.subjectId}&topic=${topWeakTopic.topicId}`,
      };
    }
    if (topLossTopic && s.recentLossMarks > 0) {
      fixFor.gain = {
        kind: "timed",
        topicId: topLossTopic.topicId,
        topicTitle: topicById.get(topLossTopic.topicId)?.title ?? null,
        href: `/practice?quick=10&subject=${input.subjectId}&topic=${topLossTopic.topicId}`,
      };
    }

    // Weakest factor — the biggest weighted shortfall against a perfect 1.0
    // everywhere, i.e. the rank position this paper loses the most to. Raw
    // scores mislead: a 0 gain costs more than a 0 recency because gain
    // carries more weight. Ties break toward the heavier-weighted factor
    // (declared order among equal weights), so the label never flickers.
    const shortfallRows: { key: PaperFactorKey; loss: number }[] = [
      { key: "weakness", loss: PAPER_SELECT_WEIGHTS.weakness * (1 - weaknessScore) },
      { key: "gain", loss: PAPER_SELECT_WEIGHTS.gain * (1 - gainScore) },
      { key: "coverage", loss: PAPER_SELECT_WEIGHTS.coverage * (1 - coverageScore) },
      { key: "recency", loss: PAPER_SELECT_WEIGHTS.recency * (1 - recencyScore) },
      { key: "exposure", loss: PAPER_SELECT_WEIGHTS.exposure * (1 - exposureScore) },
      { key: "difficulty", loss: PAPER_SELECT_WEIGHTS.difficulty * (1 - difficultyScore) },
    ];
    const worst = shortfallRows.reduce((acc, row) => (row.loss > acc.loss + 1e-9 ? row : acc), shortfallRows[0]!);
    const weakestFactor: WeakestFactor | null =
      worst.loss <= 1e-9
        ? null
        : {
            key: worst.key,
            label: factors[worst.key].label,
            detail: factors[worst.key].detail,
            shortfall: worst.loss,
            fix: fixFor[worst.key] ?? null,
          };

    return {
      paperId: s.paperId,
      title: s.title,
      totalMarks: s.totalMarks,
      questionCount: 0,
      topicCount: s.topicIds.length,
      averageDifficulty: s.averageDifficulty,
      score,
      factors,
      weakestFactor,
      predictedPercent: s.predictedPercent,
      recentLossMarks: s.recentLossMarks,
      runs: s.runs,
      daysSinceLastRun: daysSince,
      reason: "",
    };
  });

  const questionCountByPaper = new Map(paperPayloads.map((p) => [p.paper.id, p.resolved.length] as const));
  for (const c of candidates) c.questionCount = questionCountByPaper.get(c.paperId) ?? 0;

  candidates.sort((a, b) => b.score - a.score || b.totalMarks - a.totalMarks || a.paperId.localeCompare(b.paperId));

  // --- target-grade fit gate ---------------------------------------------
  // With a target set, papers whose PREDICTED result lands far outside what
  // the target needs are set aside: far above needs no work (the grade is
  // already secure on this paper's topics), far below wastes a sitting the
  // student cannot afford. Near misses are never skipped — a paper you
  // scrape by is exactly the one that shows where the marks leak. Papers
  // without an honest prediction (too little measured) are never skipped:
  // no evidence, no gate.
  const needed = neededPercentForGrade(input.gradeBoundaries, input.targetGrade);
  const skipped: SkippedPaper[] = [];
  const sitting = needed == null ? candidates : candidates.filter((c) => {
    if (c.predictedPercent == null) return true;
    const gap = c.predictedPercent - needed;
    if (Math.abs(gap) <= TARGET_SKIP_MARGIN) return true;
    const direction: "easier" | "harder" = gap > 0 ? "easier" : "harder";
    skipped.push({
      paperId: c.paperId,
      title: c.title,
      predictedPercent: c.predictedPercent,
      neededPercent: needed,
      targetGrade: input.targetGrade!,
      direction,
      reason:
        direction === "easier"
          ? `Predicted ≈${c.predictedPercent}% — your target ${input.targetGrade} needs ${needed}%, so this paper would not change anything. Sit it when you want an easy win.`
          : `Predicted ≈${c.predictedPercent}% — your target ${input.targetGrade} needs ${needed}%. Close the gap on weaker topics first; this paper will still be here.`,
    });
    return false;
  });

  // Reason for the top paper — the honest "why now", from its strongest factors.
  if (candidates[0]) {
    const top = candidates[0];
    const strongest = [top.factors.weakness, top.factors.gain, top.factors.recency, top.factors.exposure]
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((f) => f.detail);
    const prediction = top.predictedPercent != null ? ` · expect ≈${top.predictedPercent}%` : "";
    top.reason = strongest.length
      ? `Ranked first: ${strongest.join(", ")}${prediction}.`
      : `Ranked first: it tests these topics more freshly than the others${prediction}.`;
  }

  return { candidates: sitting, skipped, recommended: sitting[0] ?? null };
}

/** Marks-weighted mastery over the paper's topics that actually have a schedule. */
function measuredAbility(s: { marksByTopic: Map<Id, number>; totalMarks: number }, masteryById: Map<Id, TopicMastery>): number {
  let measured = 0;
  let sum = 0;
  for (const [topicId, marks] of s.marksByTopic) {
    const mastery = masteryById.get(topicId);
    if (!mastery || mastery.attempts <= 0) continue;
    measured += marks;
    sum += marks * mastery.mastery;
  }
  return measured > 0 ? sum / measured : 1;
}
