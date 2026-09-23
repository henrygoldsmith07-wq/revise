import { describe, expect, it } from "vitest";
import {
  buildPaperOutcomeRecord,
  closePaperOutcome,
  GAIN_MULTIPLIER_MAX,
  GAIN_MULTIPLIER_MIN,
  paperOutcomeGainMultiplier,
  paperOutcomeNarrative,
  subjectPredictionDrift,
} from "../src/domain/paper-outcome";
import type { PaperOutcomeRecord } from "../src/domain/paper-outcome";

let seq = 0;
function outcome(overrides: Partial<PaperOutcomeRecord> = {}): PaperOutcomeRecord {
  seq += 1;
  const totalMarks = overrides.totalMarks ?? 100;
  const predictedMarks = overrides.predictedMarks ?? 60;
  return {
    id: `po-${seq}`,
    userId: "local",
    subjectId: overrides.subjectId ?? "bio",
    paperId: `paper-${seq}`,
    predictedMarks,
    totalMarks,
    actualMarks: overrides.actualMarks ?? predictedMarks,
    satAt: overrides.satAt ?? new Date(Date.UTC(2026, 5, seq)).toISOString(),
  };
}

describe("buildPaperOutcomeRecord / closePaperOutcome", () => {
  it("freezes the prediction at sit time and clamps actuals to the paper", () => {
    const record = buildPaperOutcomeRecord({
      userId: "local",
      subjectId: "bio",
      paperId: "p1",
      paperRunId: "run-1",
      predictedMarks: 58,
      totalMarks: 90,
      satAt: "2026-06-01T09:00:00.000Z",
    });
    expect(record.predictedMarks).toBe(58);
    expect(record.actualMarks).toBe(0);
    expect(record.paperRunId).toBe("run-1");

    const closed = closePaperOutcome(record, 70);
    expect(closed.actualMarks).toBe(70);
    // Pure: the frozen record is unchanged.
    expect(record.actualMarks).toBe(0);

    // Actuals beyond the paper total clamp (defensive).
    expect(closePaperOutcome(record, 999).actualMarks).toBe(90);
  });
});

describe("subjectPredictionDrift", () => {
  it("weights newer outcomes more than older ones", () => {
    const records = [
      outcome({ actualMarks: 80, satAt: "2026-06-01T00:00:00.000Z" }), // newest, +0.20
      outcome({ actualMarks: 55, satAt: "2026-01-01T00:00:00.000Z" }), // oldest, −0.05
    ];
    const drift = subjectPredictionDrift(records).get("bio")!;
    // Newest dominates: drift is positive, pulled toward +0.20.
    expect(drift.drift).toBeGreaterThan(0.08);
    expect(drift.outcomes).toBe(2);
  });

  it("separates subjects and averages plain drifts when outcomes are contemporaneous", () => {
    const records = [
      outcome({ subjectId: "bio", actualMarks: 70 }), // +0.10
      outcome({ subjectId: "chem", actualMarks: 50, predictedMarks: 60, satAt: "2026-05-01T00:00:00.000Z" }), // −0.10
    ];
    const drifts = subjectPredictionDrift(records);
    expect(drifts.get("bio")!.drift).toBeCloseTo(0.1, 2);
    expect(drifts.get("chem")!.drift).toBeCloseTo(-0.1, 2);
  });
});

describe("paperOutcomeGainMultiplier", () => {
  it("is neutral below the evidence floor", () => {
    const single = [outcome({ actualMarks: 90 })]; // huge over-performance, but only one paper
    expect(paperOutcomeGainMultiplier(single, "bio")).toBe(1);
    expect(paperOutcomeGainMultiplier([], "bio")).toBe(1);
  });

  it("raises the paper gain when the student beats the prediction", () => {
    const records = [
      outcome({ actualMarks: 75, satAt: "2026-06-01T00:00:00.000Z" }), // +0.15
      outcome({ actualMarks: 75, satAt: "2026-05-01T00:00:00.000Z" }), // +0.15
    ];
    expect(paperOutcomeGainMultiplier(records, "bio")).toBeGreaterThan(1);
  });

  it("lowers the paper gain when papers over-promise", () => {
    const records = [
      outcome({ actualMarks: 45, satAt: "2026-06-01T00:00:00.000Z" }), // −0.15
      outcome({ actualMarks: 45, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeGainMultiplier(records, "bio")).toBeLessThan(1);
  });

  it("stays neutral when reality matches the prediction", () => {
    const records = [
      outcome({ actualMarks: 60, satAt: "2026-06-01T00:00:00.000Z" }),
      outcome({ actualMarks: 60, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeGainMultiplier(records, "bio")).toBe(1);
  });

  it("clamps extreme evidence into the honesty band", () => {
    const records = [
      outcome({ predictedMarks: 55, actualMarks: 100, satAt: "2026-06-01T00:00:00.000Z" }), // +0.45
      outcome({ predictedMarks: 55, actualMarks: 100, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeGainMultiplier(records, "bio")).toBe(GAIN_MULTIPLIER_MAX);

    const disaster = [
      outcome({ actualMarks: 5, satAt: "2026-06-01T00:00:00.000Z" }), // −0.55
      outcome({ actualMarks: 5, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeGainMultiplier(disaster, "bio")).toBe(GAIN_MULTIPLIER_MIN);
    expect(GAIN_MULTIPLIER_MIN).toBeLessThan(1);
    expect(GAIN_MULTIPLIER_MAX).toBeGreaterThan(1);
  });

  it("never mixes another subject's outcomes", () => {
    const records = [
      outcome({ subjectId: "bio", actualMarks: 100, satAt: "2026-06-01T00:00:00.000Z" }),
      outcome({ subjectId: "bio", actualMarks: 100, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeGainMultiplier(records, "chem")).toBe(1);
  });
});

describe("paperOutcomeNarrative", () => {
  it("speaks only with enough evidence and names the direction", () => {
    expect(paperOutcomeNarrative([outcome()], "bio")).toBeNull();
    const beating = [
      outcome({ actualMarks: 75, satAt: "2026-06-01T00:00:00.000Z" }),
      outcome({ actualMarks: 75, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeNarrative(beating, "bio")).toContain("headroom");
    const matching = [
      outcome({ actualMarks: 60, satAt: "2026-06-01T00:00:00.000Z" }),
      outcome({ actualMarks: 61, satAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(paperOutcomeNarrative(matching, "bio")).toContain("within");
  });
});
