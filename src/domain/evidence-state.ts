// ---------------------------------------------------------------------------
// Evidence states for efficacy claims — prevents converting "implemented"
// into "proven effective" without explicit escalation through each tier.
//
//   insufficient-data       not enough paired observations
//   early-directional       enough for descriptive statistics, not causal claims
//   adequately-sampled      minimum preregistered sample met, primary outcome computed
//   replicated              effect observed consistently across subgroups/time windows
//   externally-validated    independent replication or peer review completed
//
// Each tier must be explicitly set; nothing auto-escalates without meeting
// the documented thresholds.
// ---------------------------------------------------------------------------

export type EvidenceState =
  | "insufficient-data"
  | "early-directional"
  | "adequately-sampled"
  | "replicated"
  | "externally-validated";

export interface EvidenceThresholds {
  /** Minimum participants per arm before descriptive stats are shown. */
  minParticipantsPerArm: number;
  /** Minimum closed prediction→actual pairs before calibration is reported. */
  minClosedLoops: number;
  /** Minimum delayed-retention probes before retention % is meaningful. */
  minRetentionProbes: number;
  /** Minimum days of follow-up before dropout/adherence rates are reported. */
  minFollowUpDays: number;
}

export const DEFAULT_THRESHOLDS: EvidenceThresholds = {
  minParticipantsPerArm: 5,
  minClosedLoops: 10,
  minRetentionProbes: 15,
  minFollowUpDays: 14,
};

/**
 * Determine the current evidence state from observable data quality signals.
 * Never auto-advances past "adequately-sampled" — "replicated" and
 * "externally-validated" require human judgement and are set manually.
 */
export function assessEvidenceState(input: {
  participantsPerArm: number;
  closedLoops: number;
  retentionProbes: number;
  followUpDays: number;
  /** Set only by a human after reviewing replicated results. */
  manualOverride?: EvidenceState;
  thresholds?: Partial<EvidenceThresholds>;
}): EvidenceState {
  if (input.manualOverride) return input.manualOverride;
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };

  if (
    input.participantsPerArm >= t.minParticipantsPerArm &&
    input.closedLoops >= t.minClosedLoops &&
    input.retentionProbes >= t.minRetentionProbes &&
    input.followUpDays >= t.minFollowUpDays
  ) {
    return "adequately-sampled";
  }
  if (input.participantsPerArm >= 2 && input.followUpDays >= t.minFollowUpDays) {
    return "early-directional";
  }
  return "insufficient-data";
}

/** Human-readable description for the UI badge/tooltip. */
export function evidenceStateLabel(state: EvidenceState): string {
  switch (state) {
    case "insufficient-data":
      return "Not enough data yet";
    case "early-directional":
      return "Early directional signal";
    case "adequately-sampled":
      return "Adequately sampled";
    case "replicated":
      return "Replicated across conditions";
    case "externally-validated":
      return "Externally validated";
  }
}
