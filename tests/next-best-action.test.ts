import { describe, expect, it } from "vitest";
import { rankNextActions, valueNextAction, type NextActionCandidate } from "@/domain/next-best-action";
import { buildPostSessionClosure } from "@/domain/post-session-closure";
import { capabilityState, recordObservation, emptyProfile } from "@/domain/capability-mastery";

const candidate = (overrides: Partial<NextActionCandidate> = {}): NextActionCandidate => ({
  id: "topic-a", kind: "practice-topic", subjectId: "maths", topicId: "topic-a",
  minutes: 20, signals: { weakness: 0.7, learningBenefit: 0.7, evidenceConfidence: 0.8 },
  ...overrides,
});

describe("next best action policy", () => {
  it("keeps unknown separate from measured weakness and values a short diagnostic", () => {
    const unknown = candidate({
      id: "unknown", kind: "diagnose",
      signals: { weakness: 1, diagnosticValue: 1, evidenceConfidence: 0 },
    });
    const weak = candidate({
      id: "weak", signals: { weakness: 1, learningBenefit: 0.8, evidenceConfidence: 1 },
    });
    expect(valueNextAction(unknown).evidenceLevel).toBe("limited");
    expect(valueNextAction(unknown).factors.weakness).toBe(1);
    expect(valueNextAction(unknown).reason).toContain("limited");
    expect(valueNextAction(weak).score).toBeGreaterThan(valueNextAction(unknown).score);
  });

  it("combines urgency, mistakes, retention and time with stable tie breaking", () => {
    const base = candidate();
    const urgent = candidate({
      id: "urgent", minutes: 12,
      signals: { weakness: 0.7, learningBenefit: 0.7, evidenceConfidence: 0.8,
        examUrgency: 1, examWeighting: 1, mistakePressure: 0.8, retrievalPressure: 0.5 },
    });
    expect(rankNextActions([base, urgent])[0].candidate.id).toBe("urgent");
    expect(rankNextActions([candidate({ id: "b" }), candidate({ id: "a" })])
      .map((row) => row.candidate.id)).toEqual(["a", "b"]);
  });

  it("does not present prior marks per hour as observed outcome evidence", () => {
    const thin = valueNextAction(candidate({ observedMarksPerHour: 9, outcomeSamples: 2 }));
    const supported = valueNextAction(candidate({ observedMarksPerHour: 9, outcomeSamples: 12 }));
    expect(thin.observedMarksPerHour).toBeNull();
    expect(supported.observedMarksPerHour).toBe(9);
    expect(supported.score).not.toBe(thin.score);
  });

  it("routes a session ending to the fresh recommendation when supplied", () => {
    const closure = buildPostSessionClosure({
      session: "practice", attempted: 2, total: 2, awarded: 1, available: 4,
      elapsedMs: 600_000,
      recommended: { href: "/adaptive-session?topic=topic-a&start=1", label: "Start next session",
        reason: "Based on your recent answers, repair this gap." },
    });
    expect(closure.nextAction).toBe("mistakes");
    expect(closure.recommended?.href).toContain("adaptive-session");
  });

  it("does not call a single high-scoring answer secure", () => {
    const first = recordObservation(emptyProfile().application,
      { source: "independent", score: 1 });
    expect(capabilityState(first)).toBe("developing");
  });
});