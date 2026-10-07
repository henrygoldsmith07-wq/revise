// ---------------------------------------------------------------------------
// The "Proven" moment.
//
// A topic becomes Proven only after an unseen question is answered unaided at
// least MIN_PROOF_DELAY_DAYS after study (src/domain/proof-of-improvement.ts
// owns that rule). This module only decides *when to celebrate*: a topic whose
// learner state has moved to "proven" since the learner last saw the proof
// panel. The caller keeps the last-seen map (a UI preference, not evidence),
// so nothing here can ever change what counts as proof.
// ---------------------------------------------------------------------------

import type { LearnerState } from "./learner-state";

/** At most this many topics animate at once, so a backlog is not a light show. */
export const MAX_PROVEN_MOMENTS = 3;

export type SeenProofStates = Readonly<Record<string, LearnerState>>;

/**
 * Topics to celebrate: proven now, and not proven the last time they were
 * seen. A topic never seen before counts as newly proven, so the first view
 * after a proof still gets its moment; the cap keeps that bounded.
 */
export function newlyProvenTopics(
  seen: SeenProofStates,
  current: ReadonlyArray<{ topicId: string; state: LearnerState }>,
  max = MAX_PROVEN_MOMENTS,
): string[] {
  return current
    .filter((row) => row.state === "proven" && seen[row.topicId] !== "proven")
    .slice(0, Math.max(0, max))
    .map((row) => row.topicId);
}

/** The map to store after this view: every topic's current state. */
export function nextSeenProofStates(
  seen: SeenProofStates,
  current: ReadonlyArray<{ topicId: string; state: LearnerState }>,
): Record<string, LearnerState> {
  const next: Record<string, LearnerState> = { ...seen };
  for (const row of current) next[row.topicId] = row.state;
  return next;
}

const STATES: readonly LearnerState[] = ["not-checked", "needs-work", "improving", "awaiting-proof", "proven", "regressed"];

/** Parse a stored map defensively: anything malformed is dropped, never thrown. */
export function parseSeenProofStates(raw: string | null): Record<string, LearnerState> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const out: Record<string, LearnerState> = {};
    for (const [key, state] of Object.entries(value as Record<string, unknown>)) {
      if (typeof state === "string" && (STATES as readonly string[]).includes(state)) out[key] = state as LearnerState;
    }
    return out;
  } catch {
    return {};
  }
}
