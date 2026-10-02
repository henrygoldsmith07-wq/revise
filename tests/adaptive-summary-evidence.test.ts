import { describe, expect, it } from "vitest";
import { summariseAdaptiveRun } from "@/domain/adaptive-summary";
import type { AdaptiveSessionPlan, AdaptiveStepRecord } from "@/domain/adaptive-session";

const plan = { topicTitle: "Forces", topicId: "t", subjectId: "s" } as AdaptiveSessionPlan;
const rec = (kind: AdaptiveStepRecord["kind"], result: AdaptiveStepRecord["result"], extra: Partial<AdaptiveStepRecord> = {}): AdaptiveStepRecord =>
  ({ stepId: `${kind}:${result}`, kind, minutes: 4, result, awardedMarks: 2, maxMarks: 3, hintTier: null, elapsedMs: 1000, ...extra });
const run = (completed: AdaptiveStepRecord[], open: string[] = []) => summariseAdaptiveRun({ plan, completed, openMistakeIds: open });

describe("session closure evidence", () => {
  it("says nothing is proven until a delayed check exists", () => {
    const s = run([rec("independent-application", "passed-independent")]);
    expect(s.evidenceStrength).toMatchObject({ independent: 1, hinted: 0, scheduledDelay: false });
    expect(s.evidenceStrength.line).toMatch(/nothing is proven/);
    expect(s.next).toBe("unfamiliar-check");
  });
  it("counts hinted successes as weaker and separate", () => {
    const s = run([rec("supported-practice", "passed-assisted", { hintTier: "cue" }), rec("independent-application", "missed")]);
    expect(s.evidenceStrength).toMatchObject({ independent: 0, hinted: 1, missed: 1 });
    expect(s.evidenceStrength.line).toMatch(/1 with a hint \(weaker evidence\)/);
    expect(s.next).toBe("revisit-fragile");
  });
  it("routes to mistake repair first, then a scheduled delay", () => {
    expect(run([rec("transfer", "passed-independent")], ["m1"]).next).toBe("repair-mistakes");
    const done = run([rec("transfer", "passed-independent"), rec("delayed-retrieval", "scheduled", { maxMarks: 0, awardedMarks: 0 })]);
    expect(done.next).toBe("move-on");
    expect(done.evidenceStrength).toMatchObject({ unfamiliar: 1, scheduledDelay: true });
  });
  it("adds no evidence when nothing was answered", () => {
    const s = run([]);
    expect(s.evidenceStrength.line).toMatch(/no new evidence/);
    expect(s.next).toBe("delayed-retest");
  });
});
