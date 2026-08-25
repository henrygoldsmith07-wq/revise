import { describe, expect, it } from "vitest";
import { assessEvidenceState, evidenceStateLabel, DEFAULT_THRESHOLDS } from "@/domain/evidence-state";

describe("evidence state", () => {
  it("starts at insufficient-data with no data", () => {
    expect(assessEvidenceState({ participantsPerArm: 0, closedLoops: 0, retentionProbes: 0, followUpDays: 0 })).toBe("insufficient-data");
  });

  it("escalates to early-directional with some data and follow-up", () => {
    const state = assessEvidenceState({ participantsPerArm: 3, closedLoops: 4, retentionProbes: 5, followUpDays: 14 });
    expect(state).toBe("early-directional");
  });

  it("reaches adequately-sampled when all preregistered thresholds are met", () => {
    const state = assessEvidenceState({
      participantsPerArm: 5,
      closedLoops: 10,
      retentionProbes: 15,
      followUpDays: 14,
    });
    expect(state).toBe("adequately-sampled");
  });

  it("does NOT auto-escalate past adequately-sampled", () => {
    const state = assessEvidenceState({
      participantsPerArm: 100,
      closedLoops: 200,
      retentionProbes: 300,
      followUpDays: 90,
    });
    // Replicated/externally-validated require manual override
    expect(state).toBe("adequately-sampled");
  });

  it("manual override takes precedence", () => {
    expect(assessEvidenceState({
      participantsPerArm: 0,
      closedLoops: 0,
      retentionProbes: 0,
      followUpDays: 0,
      manualOverride: "externally-validated",
    })).toBe("externally-validated");
  });

  it("labels are human-readable", () => {
    expect(evidenceStateLabel("insufficient-data")).toContain("Not enough");
    expect(evidenceStateLabel("adequately-sampled")).toContain("Adequately");
  });
});
