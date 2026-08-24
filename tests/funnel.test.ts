import { describe, expect, it } from "vitest";
import { analyseFunnel, recommendationTaskId, type AttemptRecord, type FunnelEvent } from "@/domain/funnel";

// ---------------------------------------------------------------------------
// Funnel analytics — sessionisation and every goal formula on fixtures where
// the right answer is hand-countable.
// ---------------------------------------------------------------------------

const BASE = "2026-08-22T09:00:00.000Z";
const TASK_ID = recommendationTaskId("review-due", "t1", "s1", "2026-08-22");

function at(min: number): string {
  return new Date(new Date(BASE).getTime() + min * 60_000).toISOString();
}

const anonId = "student-1";
const events: FunnelEvent[] = [
  // Session 1: opened 0:00, recommendation shown 12 s in, accepted 30 s in.
  { anonId, type: "app_opened", at: at(0) },
  { anonId, type: "recommendation_displayed", at: at(0.2), detail: TASK_ID },
  { anonId, type: "recommendation_accepted", at: at(0.5), detail: TASK_ID },
  // Attempt: started 20 s after open (created at 8m20s minus 8 min duration).
  // Feedback read at ~8m23s; follow-up task starts at 15 min (continuation).
  { anonId, type: "feedback_read", at: at(8.4), detail: "attempt-a" },
  // Session 2 (>30 min gap): opened but nothing studied -> wasted session.
  { anonId, type: "app_opened", at: at(90) },
];

function attempt(startMin: number, minutes = 10, over: Partial<AttemptRecord> = {}): AttemptRecord {
  const createdAt = at(startMin + minutes);
  return {
    anonId,
    questionId: `q-${startMin}`,
    topicIds: ["t1"],
    mode: "practice",
    awarded: 2,
    max: 3,
    elapsedMs: minutes * 60_000,
    createdAt,
    ...over,
  };
}

const attempts: AttemptRecord[] = [
  attempt(1 / 3, 8), // started 0:20 after open, completed at ~8m20s
  attempt(15, 10), // continuation task starting 15 min in
];
const baseInput = {
  anonId,
  events,
  attempts,
  mistakes: [] as Array<{ anonId: string; id: string; createdAt: string }>,
  now: new Date(at(200)),
  minDenominator: 1,
};

describe("recommendationTaskId", () => {
  it("prefers topic over subject and includes the day", () => {
    expect(recommendationTaskId("review-due", "t9", "s1", "2026-08-22")).toBe("review-due:t9:2026-08-22");
    expect(recommendationTaskId("review-due", null, "s1", "2026-08-22")).toBe("review-due:s1:2026-08-22");
  });
});

describe("analyseFunnel", () => {
  it("sessionises on the 30-minute gap and flags idle sessions", () => {
    const report = analyseFunnel(baseInput);
    expect(report.sessions).toBe(2);
    const wasted = report.goals.find((g) => g.label === "Sessions without useful work")!;
    expect(wasted.value).toBeCloseTo(0.5);
  });

  it("computes open→studying against the 30-second goal", () => {
    const report = analyseFunnel(baseInput);
    const goal = report.goals.find((g) => g.label === "Open → studying")!;
    expect(goal.value).toBeCloseTo(20, 0); // opened 0:00, first start 0:20
    expect(goal.meets).toBe(true);
    expect(goal.detail).toContain("1/1");
  });

  it("derives acceptance, completion, feedback-read and continuation", () => {
    const report = analyseFunnel(baseInput);
    const acceptance = report.goals.find((g) => g.label === "Recommendation acceptance")!;
    expect(acceptance.value).toBe(1);

    const completion = report.goals.find((g) => g.label === "Started → completed")!;
    expect(completion.value).toBe(1); // both starts completed inside their session window

    const steps = Object.fromEntries(report.steps.map((st) => [st.step, st]));
    expect(steps["Answer submitted"].entered).toBe(2);
    expect(steps["Feedback read"].advanced).toBe(1); // the 15-min continuation
    const continuation = report.goals.find((g) => g.label === "Next-task continuation")!;
    expect(continuation.value).toBe(1);
    expect(continuation.meets).toBe(true);
  });

  it("credits mistake remediation only for successful retests inside 48 h", () => {
    const retestSuccess: AttemptRecord = attempt(20, 8, {
      questionId: "retest-q",
      retestMistakeId: "mistake-1",
      awarded: 3,
      max: 3,
    });
    const failedRetest: AttemptRecord = attempt(30, 8, {
      questionId: "failed-retest",
      retestMistakeId: "mistake-2",
      awarded: 0,
      max: 3,
    });
    const report = analyseFunnel({
      ...baseInput,
      attempts: [...attempts, retestSuccess, failedRetest],
      mistakes: [
        { anonId, id: "mistake-1", createdAt: at(12) },
        { anonId, id: "mistake-2", createdAt: at(13) },
      ],
    });
    const remediation = report.goals.find((g) => g.label === "Mistake → remediation")!;
    expect(remediation.value).toBeCloseTo(0.5);
    expect(remediation.detail).toContain("1/2");
  });

  it("refuses headline percentages while denominators are thin", () => {
    const report = analyseFunnel({
      anonId,
      events: [{ anonId, type: "app_opened", at: at(0) }],
      attempts: [],
      mistakes: [],
      now: new Date(at(200)),
    });
    expect(report.insufficientData).toBe(true);
    for (const goal of report.goals.slice(1)) expect(goal.meets).toBeNull();
    expect(report.note).toContain("still filling");
  });

  it("ignores other participants entirely", () => {
    const strangerEvents: FunnelEvent[] = [
      { anonId: "stranger", type: "app_opened", at: at(0) },
      { anonId: "stranger", type: "recommendation_displayed", at: at(1) },
    ];
    const report = analyseFunnel({ ...baseInput, events: [...events, ...strangerEvents] });
    const displayed = report.steps.find((s) => s.step === "Recommendation displayed")!;
    expect(displayed.entered).toBe(1);
  });
});
