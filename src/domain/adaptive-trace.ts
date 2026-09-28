// ---------------------------------------------------------------------------
// Adaptive trace — one readable path from action to next decision.
//
// student action → recorded evidence → learner-state update → next-action
// decision. Pure and tiny: the UI calls this to explain what changed, the
// domain calls it to keep evidence collection, state derivation and ranking
// in separate steps instead of one tangled hotspot.
// ---------------------------------------------------------------------------

import { valueNextAction, type NextActionCandidate } from "./next-best-action";

export interface TraceStep {
  action: string;
  evidence: string;
  stateUpdate: string;
  nextDecision: string;
  policyScore: number;
  evidenceLevel: "limited" | "developing" | "strong";
}

/** Explain one loop iteration in the product's own vocabulary. */
export function traceTransition(input: {
  action: string;
  evidence: string;
  stateUpdate: string;
  candidate: NextActionCandidate;
}): TraceStep {
  const valued = valueNextAction(input.candidate);
  return {
    action: input.action,
    evidence: input.evidence,
    stateUpdate: input.stateUpdate,
    nextDecision: valued.reason,
    policyScore: valued.score,
    evidenceLevel: valued.evidenceLevel,
  };
}
