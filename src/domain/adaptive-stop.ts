// ---------------------------------------------------------------------------
// Adaptive stopping — when sufficient evidence exists, stop the core loop.
//
// The tutor loop measures learning through delayed retention and unfamiliar
// transfer, not completion. Once a topic's readiness row says the evidence is
// there (ready status, no high-severity blocker, exam not imminent), the
// session keeps retrieval and repair but drops the independent and transfer
// rungs — the proof already exists, and repeating it wastes minutes that
// belong to weaker topics. Unknown or at-risk topics never stop early.
//
// Pure domain: no React, storage, network, or model calls.
// ---------------------------------------------------------------------------

import type { ExamReadiness } from "./exam-readiness";

/** Why the core loop may stop early for one topic. */
export interface AdaptiveStop {
  /** True when the independent/transfer rungs may be dropped. */
  stop: boolean;
  /** Student-facing reason, or null while the loop continues. */
  reason: string | null;
}

/**
 * Readiness-gated stop for one subject's topic. High-severity blockers and an
 * imminent exam (within two weeks) always keep the full loop; a ready row
 * with neither stops the core early. Everything else continues.
 */
export function readinessStopFor(readiness: ExamReadiness[], subjectId: string): AdaptiveStop {
  const row = readiness.find((candidate) => candidate.subjectId === subjectId);
  if (!row) return { stop: false, reason: null };
  if (row.status !== "ready") return { stop: false, reason: null };
  if (row.blockers.some((blocker) => blocker.severity === "high")) {
    return { stop: false, reason: null };
  }
  if (row.examDays != null && row.examDays <= 14) {
    return { stop: false, reason: null };
  }
  return {
    stop: true,
    reason: "This topic's evidence is already strong — retrieval and repair only, so the minutes go to weaker topics.",
  };
}
