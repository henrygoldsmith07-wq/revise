import { describe, expect, it } from "vitest";
import {
  buildRevisionTwinChoices,
  calibrateRevisionTwin,
  completeRevisionTwinSession,
  createRevisionTwinState,
  revisionTwinProofForAttempt,
  revisionTwinReport,
  type RevisionTwinChoice,
  type RevisionTwinSession,
} from "@/domain/revision-twin";
import type { Attempt, Question, Recommendation } from "@/domain/types";

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
    plannedMinutes: choice.plannedMinutes,
    predictedMarks,
    startedAt: `2026-08-2${id.length}T10:00:00.000Z`,
    status: "active",
  };
}

function trustedCompleted(session: RevisionTwinSession, gain: number, completedAt: string): RevisionTwinSession {
  return {
    ...session,
    status: "completed",
    completedAt,
    observedGainMarks: gain,
    actualMinutes: session.plannedMinutes,
    outcomeSource: "trusted-attempt",
  };
}

describe("Revision Digital Twin", () => {
  it("normalises mixed recommendation durations to the same 20-minute window", () => {
    const choices = buildRevisionTwinChoices({
      recommendations: [recommendation("biology", "respiration", 2.4)],
    });
    expect(choices).toHaveLength(1);
    expect(choices[0].baselineMarks).toBe(0.8);
    expect(choices[0].predictedMarks).toBe(0.8);
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
    const first = trustedCompleted(activeSession(base, "a"), 0, "2026-08-20T10:45:00.000Z");
    const second = trustedCompleted(activeSession(base, "b"), 0, "2026-08-21T10:45:00.000Z");
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
    const done = trustedCompleted(activeSession(base, "a"), base.predictedMarks, "2026-08-20T10:45:00.000Z");
    const state = createRevisionTwinState("u", [done, { ...activeSession(base, "b"), status: "abandoned" }]);
    const report = revisionTwinReport(state);
    expect(report.checks).toBe(1);
    expect(report.hitRate).toBe(1);
    expect(report.activeSession).toBeNull();
    expect(report.calibrations[0].sampleSize).toBe(1);
  });

  it("keeps manually entered scores out of calibration", () => {
    const base = buildRevisionTwinChoices({ recommendations: [recommendation("biology", "cells", 2)] })[0];
    const manual = completeRevisionTwinSession(activeSession(base, "manual"), {
      actualMarks: 9,
      actualMinutes: base.plannedMinutes,
      now: "2026-08-20T10:45:00.000Z",
    });
    const report = revisionTwinReport(createRevisionTwinState("u", [manual]));
    expect(report.checks).toBe(0);
    expect(report.unverifiedCompleted).toBe(1);
    expect(report.calibrations).toEqual([]);
  });

  it("derives proof from trusted pre/post attempts instead of treating a post score as gain", () => {
    const base = buildRevisionTwinChoices({ recommendations: [recommendation("biology", "cells", 2)] })[0];
    const session = { ...activeSession(base, "proof"), startedAt: "2026-08-20T10:00:00.000Z" };
    const baselineQuestion = {
      id: "q0",
      subjectId: "biology",
      topicIds: ["cells"],
      parts: [{ id: "p1", marks: 4, markScheme: ["a"], modelAnswer: "a", capabilityIds: ["cells-core"] }],
      totalMarks: 4,
      createdAt: "2026-08-01T00:00:00.000Z",
    } as unknown as Question;
    const question = { ...baselineQuestion, id: "q1" } as Question;
    const prior = {
      id: "before",
      userId: "u",
      questionId: "q0",
      subjectId: "biology",
      topicIds: ["cells"],
      answers: { p1: "a" },
      marked: [],
      awarded: 1,
      max: 4,
      feedback: "",
      markedBy: "rubric",
      elapsedMs: 60_000,
      mode: "practice",
      createdAt: "2026-08-19T10:00:00.000Z",
    } as Attempt;
    const post = {
      ...prior,
      id: "after",
      awarded: 3,
      createdAt: "2026-08-20T10:25:00.000Z",
    };
    post.questionId = "q1";
    const proof = revisionTwinProofForAttempt(session, post, [prior, post], [baselineQuestion, question]);
    expect(proof?.baselineAccuracy).toBe(0.25);
    expect(proof?.observedAccuracy).toBe(0.75);
    expect(proof?.observedGainMarks).toBe(2);
  });

  it("does not infer learning gain from a trusted baseline on a different mapped capability", () => {
    const base = buildRevisionTwinChoices({ recommendations: [recommendation("biology", "cells", 2)] })[0];
    const session = { ...activeSession(base, "capability"), startedAt: "2026-08-20T10:00:00.000Z" };
    const question = (id: string, capabilityId: string) => ({
      id,
      subjectId: "biology",
      topicIds: ["cells"],
      parts: [{ id: "p1", marks: 4, markScheme: ["a"], modelAnswer: "a", capabilityIds: [capabilityId] }],
      totalMarks: 4,
      createdAt: "2026-08-01T00:00:00.000Z",
    } as unknown as Question);
    const prior = {
      id: "before-capability",
      userId: "u",
      questionId: "baseline-q",
      subjectId: "biology",
      topicIds: ["cells"],
      answers: { p1: "a" },
      marked: [],
      awarded: 1,
      max: 4,
      feedback: "",
      markedBy: "rubric",
      elapsedMs: 60_000,
      mode: "practice",
      createdAt: "2026-08-19T10:00:00.000Z",
    } as Attempt;
    const post = {
      ...prior,
      id: "after-capability",
      questionId: "observed-q",
      awarded: 3,
      createdAt: "2026-08-20T10:25:00.000Z",
    };
    expect(revisionTwinProofForAttempt(
      session,
      post,
      [prior, post],
      [question("baseline-q", "cells-structure"), question("observed-q", "cell-division")],
    )).toBeNull();
  });
});

