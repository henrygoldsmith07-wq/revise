import { describe, expect, it } from "vitest";
import {
  analyseExperiment,
  assignArm,
  EXPERIMENT_ARMS,
  policyTaskFor,
  type AttemptLike,
  type ExperimentEvent,
  type ExperimentAssignment,
} from "@/domain/recommendation-experiment";

// ---------------------------------------------------------------------------
// The prospective "prove the thesis" experiment: arms, baselines, metrics.
// Fixtures here are synthetic — the module refuses to claim efficacy until
// real participants fill every arm.
// ---------------------------------------------------------------------------

const T0 = "2026-08-01T09:00:00.000Z";

function hoursAgo(h: number): string {
  return new Date(new Date(T0).getTime() + h * 3_600_000).toISOString();
}

describe("assignArm", () => {
  it("is deterministic and covers all four arms", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const a = assignArm(`anon-${i}`, new Date(T0));
      expect(EXPERIMENT_ARMS).toContain(a.arm);
      expect(a.anonId).toBe(`anon-${i}`);
      expect(assignArm(`anon-${i}`).arm).toBe(a.arm); // stable across calls
      seen.add(a.arm);
    }
    // With 200 participants every arm must appear — assignment is not degenerate.
    expect(seen.size).toBe(4);
  });
});

describe("policyTaskFor", () => {
  it("control surfaces nothing", () => {
    expect(policyTaskFor("control", { mastery: [], dueCounts: [] })).toBeNull();
  });

  it("baseline-mastery picks the weakest topic, tie-broken by least recent study", () => {
    const task = policyTaskFor("baseline-mastery", {
      mastery: [
        { topicId: "t-strong", mastery: 0.8, lastStudiedAt: "2026-08-20" },
        { topicId: "t-weak", mastery: 0.3, lastStudiedAt: "2026-08-19" },
        { topicId: "t-weaker-but-stale", mastery: 0.3, lastStudiedAt: "2026-08-01" },
      ],
      dueCounts: [],
    });
    expect(task?.topicId).toBe("t-weaker-but-stale");
    expect(task?.kind).toBe("practice-topic");
  });

  it("baseline-overdue picks the deepest overdue queue", () => {
    const task = policyTaskFor("baseline-overdue", {
      mastery: [],
      dueCounts: [
        { topicId: "t-a", due: 12, oldestDue: "2026-07-01" },
        { topicId: "t-b", due: 30, oldestDue: "2026-07-15" },
      ],
    });
    expect(task?.topicId).toBe("t-b");
    expect(task?.reason).toContain("overdue");
  });

  it("baseline-overdue returns null when nothing is overdue", () => {
    expect(policyTaskFor("baseline-overdue", { mastery: [], dueCounts: [{ topicId: "t", due: 0, oldestDue: "2026-08-01" }] })).toBeNull();
  });
});

describe("analyseExperiment", () => {
  const assignments: ExperimentAssignment[] = ["revise-user", "control-user"].map((anonId) => ({
    anonId,
    arm: anonId.startsWith("revise") ? "revise" : "control",
    assignedAt: T0,
    version: 1,
  }));

  const attempt = (over: Partial<AttemptLike>): AttemptLike => ({
    anonId: "revise-user",
    topicIds: ["t1"],
    questionId: `q-${Math.random().toString(36).slice(2)}`,
    awarded: 2,
    max: 3,
    elapsedMs: 1_800_000, // half an hour
    createdAt: hoursAgo(1),
    ...over,
  });

  it("computes marks-per-hour from post-assignment attempts only", () => {
    const attempts: AttemptLike[] = [
      attempt({}), // 2 marks in 0.5h after assignment
      attempt({ createdAt: hoursAgo(3) }), // another 2 marks three hours after assignment
      attempt({ anonId: "revise-user", createdAt: "2026-07-01T00:00:00.000Z", questionId: "pre-1" }), // pre-assignment: excluded
      attempt({ anonId: "control-user", awarded: 1, elapsedMs: 3_600_000 }), // control arm
    ];
    const analysis = analyseExperiment({
      assignments,
      events: [],
      attempts,
      reviews: [],
      masteryByTopic: new Map(),
      now: new Date(hoursAgo(48)),
      minParticipantsPerArm: 1,
    });
    const revise = analysis.arms.find((a) => a.arm === "revise")!;
    const control = analysis.arms.find((a) => a.arm === "control")!;
    expect(revise.hoursPractised).toBeCloseTo(1, 1);
    expect(revise.marksEarned).toBe(4);
    expect(revise.practiceMarksPerHour).toBe(4);
    expect(control.practiceMarksPerHour).toBe(1);
    expect(analysis.marksPerHourEffect).toBeNull(); // efficacy gate requires all four arms populated
  });

  it("measures completion, rejection and time-to-begin from paired events", () => {
    const events: ExperimentEvent[] = [
      { anonId: "revise-user", taskId: "task-1", activity: "review-due", topicId: "t1", type: "shown", at: hoursAgo(2) },
      { anonId: "revise-user", taskId: "task-1", activity: "review-due", topicId: "t1", type: "started", at: new Date(new Date(hoursAgo(2)).getTime() + 60_000).toISOString() },
      { anonId: "revise-user", taskId: "task-1", activity: "review-due", topicId: "t1", type: "completed", at: hoursAgo(1.5) },
      { anonId: "revise-user", taskId: "task-2", activity: "practice-topic", topicId: "t2", type: "shown", at: hoursAgo(1) },
      { anonId: "revise-user", taskId: "task-2", activity: "practice-topic", topicId: "t2", type: "rejected", at: hoursAgo(0.9) },
    ];
    const analysis = analyseExperiment({
      assignments,
      events,
      attempts: [],
      reviews: [],
      masteryByTopic: new Map(),
      now: new Date(hoursAgo(48)),
      minParticipantsPerArm: 1,
    });
    const revise = analysis.arms.find((a) => a.arm === "revise")!;
    expect(revise.completionRate).toBeCloseTo(0.5);
    expect(revise.rejectionRate).toBeCloseTo(0.5);
    expect(revise.medianSecondsToBegin).toBe(60);
  });

  it("gates the headline behind real participation", () => {
    const analysis = analyseExperiment({
      assignments: assignments.slice(0, 1),
      events: [],
      attempts: [attempt({})],
      reviews: [],
      masteryByTopic: new Map(),
      now: new Date(hoursAgo(48)),
      minParticipantsPerArm: 5,
    });
    expect(analysis.sufficientData).toBe(false);
    expect(analysis.marksPerHourEffect).toBeNull();
    expect(analysis.note).toContain("enrolling");
  });

  it("computes transfer share against pre-assignment exposure", () => {
    const attempts = [
      attempt({ questionId: "seen-q", createdAt: "2026-07-15T00:00:00.000Z" }),
      attempt({ questionId: "unseen-q", createdAt: hoursAgo(1) }),
      attempt({ questionId: "unseen-q2", topicIds: ["t2"], createdAt: hoursAgo(2) }),
    ];
    const analysis = analyseExperiment({
      assignments,
      events: [],
      attempts,
      reviews: [],
      masteryByTopic: new Map(),
      now: new Date(hoursAgo(48)),
      minParticipantsPerArm: 1,
    });
    const revise = analysis.arms.find((a) => a.arm === "revise")!;
    expect(revise.unseenExposureShare).toBeCloseTo(1); // both post-assignment questions unseen before
  });
});
