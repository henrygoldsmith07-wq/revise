import { describe, expect, it } from "vitest";
import { valueNextAction, rankNextActions } from "@/domain/next-best-action";
import { buildRevisionTwinChoices } from "@/domain/revision-twin";
import type { Recommendation } from "@/domain/types";

function candidate(id: string, signals: Record<string, number>, minutes = 20) {
  return { id, kind: "practice-topic" as const, subjectId: "s1", minutes, signals };
}

function recommendation(id: string, score: number, marksPerHour = 6, minutes = 20): Recommendation {
  return {
    id, activity: "practice", subjectId: "wjec-alevel-maths", topicId: id,
    title: id, minutes, score,
    explanation: { recoverableMarks: (marksPerHour * minutes) / 60, marksPerHour, lastEvidencePercent: null, daysSinceRetrieval: null, daysToExam: null },
  } as unknown as Recommendation;
}

describe("canonical next-action policy", () => {
  it("unknown evidence stays unknown, never auto-weak", () => {
    const unknown = valueNextAction(candidate("u", {}));
    const weak = valueNextAction(candidate("w", { weakness: 1, evidenceConfidence: 1 }));
    // Unknown shrinks toward the neutral prior (0.35), not toward failure.
    expect(unknown.factors.weakness).toBe(0);
    expect(unknown.evidenceLevel).toBe("limited");
    expect(unknown.score).toBeLessThan(weak.score);
    expect(unknown.reason).toContain("limited");
  });

  it("ranks by one transparent comparison with bounded factors", () => {
    const ranked = rankNextActions([
      candidate("a", { weakness: 0.9, mistakePressure: 0.8, evidenceConfidence: 0.8 }),
      candidate("b", { weakness: 0.2, evidenceConfidence: 0.8 }),
    ]);
    expect(ranked[0]?.candidate.id).toBe("a");
    expect(ranked[0]?.factors.estimatedMinutes).toBe(20);
  });

  it("revision twin derives from the same recommendations and exposes the canonical score", () => {
    const recs = [recommendation("t1", 42, 6), recommendation("t2", 10, 6)];
    const choices = buildRevisionTwinChoices({ recommendations: recs });
    expect(choices.length).toBe(2);
    for (const choice of choices) {
      expect(choice.policyScore).toBe(choice.recommendation.score);
    }
    // With equal calibration, twin ordering must match canonical ordering.
    expect(choices[0]?.recommendation.score).toBeGreaterThanOrEqual(choices[1]?.recommendation.score ?? 0);
  });

  it("observed marks-per-hour cannot overwhelm sparse samples", () => {
    const sparse = valueNextAction({ ...candidate("s", { weakness: 0.5, evidenceConfidence: 0.5 }), observedMarksPerHour: 12, outcomeSamples: 2 });
    const calibrated = valueNextAction({ ...candidate("c", { weakness: 0.5, evidenceConfidence: 0.5 }), observedMarksPerHour: 12, outcomeSamples: 24 });
    // Sparse outcome evidence is ignored (<8 samples); calibrated evidence adjusts modestly.
    expect(sparse.observedMarksPerHour).toBeNull();
    expect(calibrated.observedMarksPerHour).toBe(12);
    expect(Math.abs(calibrated.score - sparse.score) / Math.max(1e-9, sparse.score)).toBeLessThan(0.25);
  });
});
