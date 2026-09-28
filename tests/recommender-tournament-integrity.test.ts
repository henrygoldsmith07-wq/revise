import { describe, expect, it } from "vitest";
import {
  runTournament,
  type ParticipantTrajectory,
  type TrajectoryEvent,
} from "@/domain/recommender-tournament";

function event(anonId: string, day: number, awarded = 1): TrajectoryEvent {
  return {
    anonId,
    at: new Date(Date.UTC(2026, 8, day, 9)).toISOString(),
    topicId: "subject.topic",
    questionId: `${anonId}-q-${day}`,
    awarded,
    max: 2,
    durationMinutes: 15,
  };
}

function participant(anonId: string, finalAwarded: number): ParticipantTrajectory {
  return {
    anonId,
    subjectWeights: { subject: 1 },
    events: [event(anonId, 1), event(anonId, 2)],
    finalAssessment: [
      { questionId: `${anonId}-held-out`, topicId: "subject.topic", awarded: finalAwarded, max: 4 },
    ],
  };
}

describe("recommender tournament held-out efficiency", () => {
  it("isolates observed exposure by participant before computing marks per hour", () => {
    const outcomes = runTournament(
      [participant("p1", 2), participant("p2", 4)],
      [],
      { minDecisionPoints: 1, seed: 7 },
    );

    const revise = outcomes.find((row) => row.policyId === "revise")!;
    // Each participant has one policy-aligned 15 minute event after the first
    // event establishes topic history: 2 / 0.25h = 8 and 4 / 0.25h = 16.
    // The tournament reports the mean participant-level rate: 12 marks/hour.
    expect(revise.unseenMarksPerHour).toBe(12);
    expect(revise.unseenMarksTotal).toBe(6);
    expect(revise.hoursPractised).toBe(0.5);
  });

  it("keeps held-out marks/hour unavailable when exposure is below 15 minutes", () => {
    const p = participant("p1", 4);
    p.events = [
      event("p1", 1),
      { ...event("p1", 2), durationMinutes: 10 },
    ];

    const revise = runTournament([p], [], { minDecisionPoints: 1, seed: 7 })
      .find((row) => row.policyId === "revise")!;

    expect(revise.unseenMarksPerHour).toBeNull();
    expect(revise.unseenMarksTotal).toBeNull();
  });

  it("does not borrow one participant's exposure for another participant's final assessment", () => {
    const noExposure: ParticipantTrajectory = {
      anonId: "p2",
      subjectWeights: { subject: 1 },
      events: [event("p2", 1)],
      finalAssessment: [
        { questionId: "p2-held-out", topicId: "subject.topic", awarded: 4, max: 4 },
      ],
    };

    const outcomes = runTournament(
      [participant("p1", 2), noExposure],
      [],
      { minDecisionPoints: 1, seed: 7 },
    );
    const revise = outcomes.find((row) => row.policyId === "revise")!;

    expect(revise.unseenMarksPerHour).toBe(8);
    expect(revise.unseenMarksTotal).toBe(2);
  });
});
