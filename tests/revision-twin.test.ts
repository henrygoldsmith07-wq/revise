import { describe, expect, it } from "vitest";
import {
  buildRevisionTwinChoices,
  calibrateRevisionTwin,
  completeRevisionTwinSession,
  createRevisionTwinState,
  revisionTwinReport,
  type RevisionTwinChoice,
  type RevisionTwinSession,
} from "@/domain/revision-twin";
import type { Recommendation } from "@/domain/types";

function recommendation(
  subjectId: string,
  topicId: string,
  marksPerHour: number,
  score = marksPerHour,
): Recommendation {
  return {
    activity: "practice",
    subjectId,
    topicId,
    minutes: 25,
    score,
    reason: "targeted practice",
    explanation: {
      recoverableMarks: marksPerHour / 2,
      marksPerHour,
      lastEvidencePercent: 42,
      daysSinceRetrieval: 3,
      daysToExam: 20,
      paperLabel: null,
      factors: { examGain: 1, urgency: 1, weakness: 1, forgetting: 1, uncertainty: 1 },
    },
  };
}

function activeSession(choice: RevisionTwinChoice, id: string, predictedMarks = choice.predictedMarks): RevisionTwinSession {
  return {
    id,
    userId: "u",
    activity: choice.activity,
    subjectId: choice.subjectId,
    topicId: choice.topicId,
    title: id,
    plannedMinutes: 45,
    predictedMarks,
    startedAt: `2026-08-2${id.length}T10:00:00.000Z`,
    status: "active",
  };
}

describe("Revision Digital Twin", () => {
  it("normalises mixed recommendation durations to the same 45-minute window", () => {
    const choices = buildRevisionTwinChoices({
      recommendations: [recommendation("biology", "respiration", 2.4)],
    });
    expect(choices).toHaveLength(1);
    expect(choices[0].baselineMarks).toBe(1.8);
    expect(choices[0].predictedMarks).toBe(1.8);
    expect(choices[0].marksPerHour).toBe(2.4);
  });

  it("keeps the first comparison diverse across subjects before filling rows", () => {
    const choices = buildRevisionTwinChoices({
      recommendations: [
        recommendation("biology", "respiration", 3.2),
        recommendation("biology", "cells", 3.1),
        recommendation("chemistry", "bonding", 2.2),
        recommendation("physics", "electricity", 1.8),
      ],
    });
    expect(choices.map((choice) => choice.subjectId)).toEqual(["biology", "chemistry", "physics", "biology"]);
  });

  it("uses a conservative multiplier when observed marks disagree with forecast", () => {
    const base = buildRevisionTwinChoices({ recommendations: [recommendation("maths", "algebra", 2)] })[0];
    const first = completeRevisionTwinSession(activeSession(base, "a"), { actualMarks: 0, now: "2026-08-20T10:45:00.000Z" });
    const second = completeRevisionTwinSession(activeSession(base, "b"), { actualMarks: 0, now: "2026-08-21T10:45:00.000Z" });
    const calibration = calibrateRevisionTwin([first, second]).get("practice:maths:algebra");
    expect(calibration?.sampleSize).toBe(2);
    expect(calibration?.multiplier).toBeGreaterThan(0.35);
    expect(calibration?.multiplier).toBeLessThan(1);
    expect(calibration?.confidence).toBe("learning");

    const recalculated = buildRevisionTwinChoices({ recommendations: [recommendation("maths", "algebra", 2)], sessions: [first, second] })[0];
    expect(recalculated.predictedMarks).toBeLessThan(base.predictedMarks);
  });

  it("reports hit rate and keeps abandoned sessions out of calibration", () => {
    const base = buildRevisionTwinChoices({ recommendations: [recommendation("physics", "waves", 2)] })[0];
    const done = completeRevisionTwinSession(activeSession(base, "a"), { actualMarks: base.predictedMarks, now: "2026-08-20T10:45:00.000Z" });
    const state = createRevisionTwinState("u", [done, { ...activeSession(base, "b"), status: "abandoned" }]);
    const report = revisionTwinReport(state);
    expect(report.checks).toBe(1);
    expect(report.hitRate).toBe(1);
    expect(report.activeSession).toBeNull();
    expect(report.calibrations[0].sampleSize).toBe(1);
  });
});

