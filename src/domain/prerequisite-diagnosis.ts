// ---------------------------------------------------------------------------
// Prerequisite-weakness diagnosis.
//
// When a topic keeps losing marks, more questions on that same topic repeat
// the miss instead of fixing it. The real cause is often upstream: a student
// failing Photosynthesis may actually be missing Enzymes (the enzyme-controlled
// Calvin cycle) or membrane transport (diffusion of CO₂/O₂), and no amount of
// extra photosynthesis questions repairs a broken foundation.
//
// This module answers, for one repeatedly-failing topic:
//   1. Is it actually repeatedly failing? (recent misses, marks lost)
//   2. Along its prerequisite chains, where is the weakness?
//        weak       — measured negative signal (open/recent mistakes, low
//                      recent accuracy, a weak or fading schedule)
//        unmeasured — no evidence at all that the foundation is secure
//        secure     — evidence exists and holds
//   3. What should happen? (verdict)
//        prereq-first      — fix the weakest upstream topic first
//        prereq-unmeasured — secure the unproven foundation first
//        topic-itself      — prerequisites hold; keep practising this topic
//
// Honesty rule: "weak" and "secure" are only ever claimed from measured
// evidence; a topic with no evidence is "unmeasured", never called weak and
// never called secure. `now` is passed in so tests stay deterministic.
// ---------------------------------------------------------------------------

import { prerequisiteEdges, rootPrerequisitePaths, type PrerequisiteEdge } from "./prerequisites";
import type { Attempt, Card, Id, IsoInstant, Mistake, Topic, TopicMastery } from "./types";

/** How far back a "recent" miss goes. Same convention as the weak-topic exam. */
export const DIAG_WINDOW_DAYS = 7;
/** Repeated failures start here: distinct misses in the window. */
export const DIAG_MIN_RECENT_MISSES = 2;
/** Recent accuracy below which evidence counts against a topic. */
export const DIAG_LOW_ACCURACY = 0.6;
/** Mastery/retention bar under which a scheduled topic counts as fading. */
export const DIAG_SECURE_MASTERY = 0.6;
export const DIAG_SECURE_RETENTION = 0.7;

export type PrereqState = "weak" | "unmeasured" | "secure";

export interface TopicSignal {
  topicId: Id;
  state: PrereqState;
  /** Distinct misses recorded in the window. */
  recentMisses: number;
  /** Marks dropped in the window. */
  recentMarksLost: number;
  /** Open (never resolved) mistakes, any age. */
  unresolvedMistakes: number;
  /** Marked attempts in the window. */
  attemptsRecent: number;
  /** 0–1 awarded/max over window attempts; null until one exists. */
  accuracyRecent: number | null;
  /** 0–1 over all attempts; null until one exists. */
  accuracyAll: number | null;
  /** Cards ever reviewed in the topic. */
  studiedCards: number;
  mastery: {
    mastery: number;
    retention: number;
    weak: boolean;
    attempts: number;
    cardsDue: number;
  } | null;
}

export interface DiagnosisInput {
  topicId: Id;
  topics: Topic[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  cards: Card[];
  edges?: PrerequisiteEdge[];
  now?: Date;
}

export interface TopicSignalInput {
  topicId: Id;
  topics: Topic[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  cards: Card[];
  now: Date;
}

/** Measured state of one topic. Pure over its inputs. */
export function signalForTopic(input: TopicSignalInput): TopicSignal {
  const { topicId, attempts, mistakes, mastery, cards, now } = input;
  const cutoffMs = now.getTime() - DIAG_WINDOW_DAYS * 86_400_000;
  const afterCutoff = (at: IsoInstant) => new Date(at).getTime() >= cutoffMs;

  const allAttempts = attempts.filter((a) => a.topicIds.includes(topicId));
  const recentAttempts = allAttempts.filter((a) => afterCutoff(a.createdAt));

  const topicMistakes = mistakes.filter((m) => m.topicId === topicId);
  const recentMisses = topicMistakes.filter((m) => m.marksLost > 0 && afterCutoff(m.createdAt)).length;
  const recentMarksLost = topicMistakes
    .filter((m) => afterCutoff(m.createdAt))
    .reduce((sum, m) => sum + m.marksLost, 0);
  const unresolvedMistakes = topicMistakes.filter((m) => !m.resolved).length;

  const studiedCards = cards.filter((c) => c.topicId === topicId && c.reps > 0).length;
  const masteryRow = mastery.find((m) => m.topicId === topicId);

  const accuracyOf = (rows: Attempt[]): number | null => {
    const scorable = rows.filter((a) => a.max > 0);
    if (!scorable.length) return null;
    const awarded = scorable.reduce((sum, a) => sum + a.awarded, 0);
    const max = scorable.reduce((sum, a) => sum + a.max, 0);
    return max > 0 ? awarded / max : null;
  };

  const accuracyRecent = accuracyOf(recentAttempts);
  const accuracyAll = accuracyOf(allAttempts);
  const scheduled = masteryRow && masteryRow.attempts > 0 ? masteryRow : null;

  // Negative signals are all measured: recent misses, open mistakes, low
  // recent or overall accuracy, or a schedule the FSRS state calls weak/fading.
  const negative =
    recentMisses > 0 ||
    unresolvedMistakes > 0 ||
    (accuracyRecent != null && accuracyRecent < DIAG_LOW_ACCURACY) ||
    (accuracyAll != null && accuracyAll < DIAG_LOW_ACCURACY) ||
    Boolean(masteryRow?.weak) ||
    Boolean(scheduled && scheduled.retention < DIAG_SECURE_RETENTION) ||
    Boolean(scheduled && scheduled.mastery < DIAG_SECURE_MASTERY && accuracyAll == null);

  const hasPositiveEvidence =
    allAttempts.length > 0 ||
    studiedCards > 0 ||
    Boolean(scheduled) ||
    topicMistakes.length > 0;

  const state: PrereqState = negative ? "weak" : hasPositiveEvidence ? "secure" : "unmeasured";

  return {
    topicId,
    state,
    recentMisses,
    recentMarksLost,
    unresolvedMistakes,
    attemptsRecent: recentAttempts.length,
    accuracyRecent,
    accuracyAll,
    studiedCards,
    mastery: masteryRow
      ? {
          mastery: masteryRow.mastery,
          retention: masteryRow.retention,
          weak: masteryRow.weak,
          attempts: masteryRow.attempts,
          cardsDue: masteryRow.cardsDue,
        }
      : null,
  };
}

export type PrerequisiteVerdict =
  | { kind: "prereq-first"; prereqTopicId: Id; state: "weak" }
  | { kind: "prereq-unmeasured"; prereqTopicId: Id }
  | { kind: "topic-itself" };

export interface PrerequisiteDiagnosis {
  topicId: Id;
  /** False whenever the topic is not repeatedly failing — the module stays silent. */
  failing: boolean;
  recentMisses: number;
  recentMarksLost: number;
  signal: TopicSignal;
  /** Signals for every prerequisite topic on the chains behind this topic. */
  prerequisites: TopicSignal[];
  verdict: PrerequisiteVerdict | null;
}

/**
 * Every topic upstream of this one (each step on every prerequisite chain,
 * not just the deepest root) — so a weak mid-chain topic like "Equilibria"
 * inside acids-bases ← equilibria ← moles is still seen.
 */
export function prerequisiteAncestors(topicId: Id, edges: PrerequisiteEdge[]): Id[] {
  const ancestors = new Set<Id>();
  for (const path of rootPrerequisitePaths(topicId, edges)) {
    for (const step of path.path) {
      if (step !== topicId) ancestors.add(step);
    }
  }
  return [...ancestors];
}

/**
 * Pick the best upstream topic to fix. Weak topics beat unmeasured ones; a
 * deeper (more foundational) cause beats a nearer one; ties go to the topic
 * that lost the most marks recently.
 */
export function bestUpstreamCause(
  targetId: Id,
  signals: TopicSignal[],
  edges: PrerequisiteEdge[],
): TopicSignal | null {
  const upstream = new Set(prerequisiteAncestors(targetId, edges));
  const candidates = signals.filter((s) => upstream.has(s.topicId));
  const weak = candidates.filter((c) => c.state === "weak");
  const pool = weak.length ? weak : candidates.filter((c) => c.state === "unmeasured");
  if (!pool.length) return null;

  const depthOf = (topicId: Id): number => {
    // A node's depth is its farthest position along any chain: the deeper the
    // node, the more of the chain is downstream of it, so the more it is a
    // "root" cause. Direct prerequisites sit at depth 1.
    let depth = 0;
    for (const path of rootPrerequisitePaths(targetId, edges)) {
      const index = path.path.lastIndexOf(topicId);
      if (index > depth) depth = index;
    }
    return depth;
  };

  return [...pool].sort((a, b) => {
    const depthDiff = depthOf(b.topicId) - depthOf(a.topicId);
    if (depthDiff !== 0) return depthDiff;
    // Within one state: most marks lost recently first; ties by id.
    if (b.recentMarksLost !== a.recentMarksLost) return b.recentMarksLost - a.recentMarksLost;
    return a.topicId.localeCompare(b.topicId);
  })[0] ?? null;
}

/**
 * Diagnose one topic: is it repeatedly failing, and if so does the real
 * problem sit upstream? Returns a diagnosis with the topic's own signal, the
 * upstream signals, and a verdict — or a non-failing diagnosis (no verdict).
 */
export function diagnosePrerequisiteWeakness(input: DiagnosisInput): PrerequisiteDiagnosis {
  const edges = input.edges ?? prerequisiteEdges();
  const now = input.now ?? new Date();
  const { topicId, topics, attempts, mistakes, mastery, cards } = input;

  const signal = signalForTopic({ topicId, topics, attempts, mistakes, mastery, cards, now });
  const failing = signal.recentMisses >= DIAG_MIN_RECENT_MISSES || signal.unresolvedMistakes > 0;

  const upstreamIds = prerequisiteAncestors(topicId, edges).filter((id) =>
    topics.some((t) => t.id === id),
  );
  const prerequisites = upstreamIds.map((id) =>
    signalForTopic({ topicId: id, topics, attempts, mistakes, mastery, cards, now }),
  );

  if (!failing) {
    return { topicId, failing: false, recentMisses: signal.recentMisses, recentMarksLost: signal.recentMarksLost, signal, prerequisites, verdict: null };
  }

  const best = bestUpstreamCause(topicId, prerequisites, edges);
  let verdict: PrerequisiteVerdict | null;
  if (best && best.state === "weak") {
    verdict = { kind: "prereq-first", prereqTopicId: best.topicId, state: "weak" };
  } else if (best) {
    verdict = { kind: "prereq-unmeasured", prereqTopicId: best.topicId };
  } else {
    verdict = { kind: "topic-itself" };
  }

  return {
    topicId,
    failing: true,
    recentMisses: signal.recentMisses,
    recentMarksLost: signal.recentMarksLost,
    signal,
    prerequisites,
    verdict,
  };
}

export interface SentenceInput {
  diagnosis: PrerequisiteDiagnosis;
  targetTitle: string;
  prereqTitle?: string;
}

/** One plain sentence for the UI; null when the topic is not failing. */
export function diagnosisSentence(input: SentenceInput): string | null {
  const { diagnosis, targetTitle, prereqTitle } = input;
  if (!diagnosis.failing) return null;
  const lost = diagnosis.recentMarksLost > 0 ? `lost ${diagnosis.recentMarksLost} mark${diagnosis.recentMarksLost === 1 ? "" : "s"} on ${targetTitle} in the last ${DIAG_WINDOW_DAYS} days` : `misses on ${targetTitle} are still unresolved`;

  const verdict = diagnosis.verdict;
  if (!verdict || verdict.kind === "topic-itself") {
    const list = diagnosis.prerequisites
      .filter((p) => p.state === "secure")
      .map(() => prereqTitle ?? "its foundations");
    void list;
    return `You've ${lost}, but the topics ${targetTitle} builds on are holding. Keep practising ${targetTitle} — the break is here, not upstream.`;
  }

  if (verdict.kind === "prereq-first" && prereqTitle) {
    const cause = diagnosis.prerequisites.find((p) => p.topicId === verdict.prereqTopicId);
    const accuracy = cause?.accuracyRecent != null ? `${Math.round(cause.accuracyRecent * 100)}% recent accuracy` : null;
    const open = cause && cause.unresolvedMistakes > 0 ? `${cause.unresolvedMistakes} open mistake${cause.unresolvedMistakes === 1 ? "" : "s"}` : null;
    const evidence = [accuracy, open, cause && cause.recentMisses > 0 ? `${cause.recentMisses} recent miss${cause.recentMisses === 1 ? "" : "es"}` : null]
      .filter(Boolean)
      .join(" · ");
    return `You've ${lost} — and the evidence points earlier, not at more ${targetTitle} questions. ${prereqTitle} is where it breaks${evidence ? ` (${evidence})` : ""}. Fix ${prereqTitle} first; when it holds, re-test ${targetTitle}.`;
  }

  if (verdict.kind === "prereq-unmeasured" && prereqTitle) {
    return `You've ${lost}, but there's no evidence yet that ${prereqTitle} — the foundation ${targetTitle} builds on — is secure. Establish ${prereqTitle} first, then re-test ${targetTitle}.`;
  }

  // prereq-title unknown (defensive): still actionable.
  if (verdict.kind === "prereq-first" || verdict.kind === "prereq-unmeasured") {
    return `You've ${lost} — the likely cause is a prerequisite topic. Secure it first, then re-test ${targetTitle}.`;
  }
  return null;
}
