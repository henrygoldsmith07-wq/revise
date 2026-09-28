import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPERIMENT_EVIDENCE_POLICY,
  analyseExperiment,
  type AttemptLike,
  type ExperimentAssignment,
} from "@/domain/recommendation-experiment";

const ASSIGNED = "2026-09-01T09:00:00.000Z";
const NOW = new Date("2026-09-20T09:00:00.000Z");

function assignment(
  anonId: string,
  arm: ExperimentAssignment["arm"],
  extra: Partial<ExperimentAssignment> = {},
): ExperimentAssignment {
  return { anonId, arm, assignedAt: ASSIGNED, version: 2, ...extra };
}

function attempt(anonId: string, createdAt: string): AttemptLike {
  return {
    anonId,
    topicIds: ["topic-1"],
    questionId: `${anonId}-${createdAt}`,
    awarded: 2,
    max: 3,
    elapsedMs: 30 * 60_000,
    createdAt,
  };
}

function analyse(input: {
  assignments: ExperimentAssignment[];
  attempts?: AttemptLike[];
}) {
  return analyseExperiment({
    assignments: input.assignments,
    events: [],
    attempts: input.attempts ?? [],
    reviews: [],
    masteryByTopic: new Map(),
    baselineAssessments: [],
    finalAssessments: [],
    now: NOW,
    minParticipantsPerArm: 1,
  });
}

describe("experiment measurement integrity", () => {
  it("does not count pre-assignment history as activation", () => {
    const result = analyse({
      assignments: [assignment("p1", "revise")],
      attempts: [attempt("p1", "2026-08-31T09:00:00.000Z")],
    });

    expect(result.activatedN).toBe(0);
  });

  it("does not let pre-assignment attempts prevent dropout", () => {
    const result = analyse({
      assignments: [
        assignment("p1", "revise"),
        assignment("p2", "control"),
        assignment("p3", "baseline-mastery"),
        assignment("p4", "baseline-overdue"),
      ],
      attempts: [
        attempt("p1", "2026-08-31T09:00:00.000Z"),
        attempt("p2", "2026-08-31T09:00:00.000Z"),
        attempt("p3", "2026-08-31T09:00:00.000Z"),
        attempt("p4", "2026-08-31T09:00:00.000Z"),
      ],
    });

    for (const arm of result.arms) expect(arm.dropoutRate).toBe(1);
  });

  it("reports explicit withdrawals separately from dropout", () => {
    const result = analyse({
      assignments: [
        assignment("p1", "revise", {
          optedOut: true,
          withdrawnAt: "2026-09-05T09:00:00.000Z",
        }),
      ],
      attempts: [attempt("p1", "2026-09-02T09:00:00.000Z")],
    });

    expect(result.withdrawnN).toBe(1);
    expect(result.activatedN).toBe(1);
    expect(result.arms.find((row) => row.arm === "revise")?.dropoutRate).toBeNull();
  });

  it("excludes post-withdrawal attempts from intervention exposure", () => {
    const result = analyse({
      assignments: [
        assignment("p1", "revise", {
          optedOut: true,
          withdrawnAt: "2026-09-05T09:00:00.000Z",
        }),
      ],
      attempts: [
        attempt("p1", "2026-09-02T09:00:00.000Z"),
        attempt("p1", "2026-09-06T09:00:00.000Z"),
      ],
    });

    const revise = result.arms.find((row) => row.arm === "revise")!;
    expect(revise.hoursPractised).toBe(0.5);
    expect(revise.marksEarned).toBe(2);
  });

  it("does not permit efficacy claims until a preregistered sample threshold is configured", () => {
    expect(DEFAULT_EXPERIMENT_EVIDENCE_POLICY.efficacyMinPairedPerArm).toBeNull();

    const result = analyse({
      assignments: [
        assignment("p1", "revise"),
        assignment("p2", "control"),
        assignment("p3", "baseline-mastery"),
        assignment("p4", "baseline-overdue"),
      ],
      attempts: [
        attempt("p1", "2026-09-02T09:00:00.000Z"),
        attempt("p2", "2026-09-02T09:00:00.000Z"),
        attempt("p3", "2026-09-02T09:00:00.000Z"),
        attempt("p4", "2026-09-02T09:00:00.000Z"),
      ],
    });

    expect(result.gates.efficacyClaimReady).toBe(false);
    expect(result.marksGainedPerHourEffect).toBeNull();
  });
});
