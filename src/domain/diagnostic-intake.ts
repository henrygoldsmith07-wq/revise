// ---------------------------------------------------------------------------
// Diagnostic intake — a short adaptive diagnostic after onboarding.
//
// Topic mastery starts from a cohort prior, which is honest but coarse. This
// optional diagnostic gives Revise *initial capability evidence*: a handful of
// branching questions, at most two per topic, stopping as soon as a topic's
// capability is placed. Unknown topics stay unknown — the diagnostic never
// guesses from silence.
//
// Shape: pick the weakest-evidence topic with eligible questions, probe recall
// first (cheap), escalate to application when recall passes. Two probes and a
// topic is placed for now. Pure and deterministic.
// ---------------------------------------------------------------------------

import {
  capabilityState,
  recordAttemptObservations,
  type Capability,
  type CapabilityProfile,
  type EvidenceSource,
} from "./capability-mastery";

export interface DiagnosticQuestionRef {
  id: string;
  topicId: string;
  /** Which capability this probe measures. */
  capability: Capability;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface DiagnosticState {
  /** Topics still worth probing. */
  remaining: string[];
  asked: Record<string, number>;
  /** Max probes per topic before the topic is placed. */
  maxPerTopic: number;
  /** Total question budget for the whole diagnostic. */
  budget: number;
  askedTotal: number;
  done: boolean;
}

export const DIAGNOSTIC_BUDGET = 8;
export const DIAGNOSTIC_MAX_PER_TOPIC = 2;

export function newDiagnosticSession(topicIds: string[]): DiagnosticState {
  return {
    remaining: [...topicIds],
    asked: Object.fromEntries(topicIds.map((t) => [t, 0])),
    maxPerTopic: DIAGNOSTIC_MAX_PER_TOPIC,
    budget: DIAGNOSTIC_BUDGET,
    askedTotal: 0,
    done: topicIds.length === 0,
  };
}

/**
 * The next probe: recall first from the next unprobed topic, escalating to
 * application once recall shows life. `questionsByTopic` supplies the pool.
 */
export function nextDiagnosticQuestion(
  state: DiagnosticState,
  questionsByTopic: Record<string, DiagnosticQuestionRef[]>,
): DiagnosticQuestionRef | null {
  if (state.done || state.askedTotal >= state.budget) return null;
  for (const topicId of state.remaining) {
    if ((state.asked[topicId] ?? 0) >= state.maxPerTopic) continue;
    const pool = questionsByTopic[topicId] ?? [];
    const askedHere = state.asked[topicId] ?? 0;
    // Probe 1: easy recall. Probe 2: application at mid difficulty.
    const capability: Capability = askedHere === 0 ? "recall" : "application";
    const difficulty = askedHere === 0 ? 2 : 3;
    const pick =
      pool.find((q) => q.capability === capability && q.difficulty === difficulty) ??
      pool.find((q) => q.capability === capability) ??
      null;
    if (pick) return pick;
  }
  return null;
}

/**
 * Record one probe. A confident pass escalates the topic to application;
 * a fail places the topic immediately (recall-unknown evidence, honestly
 * weak rather than silently unknown).
 */
export function recordDiagnosticAnswer(
  state: DiagnosticState,
  profile: CapabilityProfile,
  question: DiagnosticQuestionRef,
  result: { correct: boolean; score: number; seconds: number },
): { state: DiagnosticState; profile: CapabilityProfile } {
  if (state.done) return { state, profile };
  const asked = { ...state.asked, [question.topicId]: (state.asked[question.topicId] ?? 0) + 1 };
  const askedTotal = state.askedTotal + 1;
  const source: EvidenceSource = "independent";

  // Recall passed: keep the topic in rotation so application gets probed.
  // Recall failed or budget spent on this topic: place it and move on.
  const keep = question.capability === "recall" && result.correct && asked[question.topicId] < state.maxPerTopic;
  const remaining = keep ? state.remaining : state.remaining.filter((t) => t !== question.topicId);

  const updated = recordAttemptObservations(profile, [
    { capability: question.capability, source, score: result.score, seconds: result.seconds },
  ]);

  return {
    state: {
      ...state,
      remaining,
      asked,
      askedTotal,
      done: remaining.length === 0 || askedTotal >= state.budget,
    },
    profile: updated,
  };
}

/** The evidence the diagnostic produced, for the closure screen. */
export function diagnosticSummary(profile: CapabilityProfile): string[] {
  return (Object.keys(profile) as Capability[])
    .filter((c) => capabilityState(profile[c]) !== "unknown")
    .map((c) => `${c}: ${Math.round((profile[c].score ?? 0) * 100)}% over ${Math.round(profile[c].evidence * 10) / 10} obs`);
}
