import { describe, expect, it } from "vitest";
import { buildWjecAuthoringPlan, type WjecAuthoringGap } from "@/domain/wjec-authoring-plan";

describe("WJEC authoring planner", () => {
  it("prioritizes zero coverage and missing core demand", () => {
    const gaps: WjecAuthoringGap[] = [
      { specPointId: "sp-zero", topicId: "topic-a", currentQuestionCount: 0, independentQuestionDeficit: 4, missingCategories: ["recall", "application", "transfer"] },
      { specPointId: "sp-near", topicId: "topic-b", currentQuestionCount: 3, independentQuestionDeficit: 1, missingCategories: [] },
    ];
    const [first] = buildWjecAuthoringPlan(gaps, 1);
    expect(first?.topicId).toBe("topic-a");
    expect(first?.zeroCoverageTargets).toContain("sp-zero");
    expect(first?.closesMissingDemandFor).toContain("sp-zero");
    expect(first?.requiredNewFamily).toBe(true);
  });

  it("groups compatible statements in one topic without exceeding the requested batch", () => {
    const gaps: WjecAuthoringGap[] = [
      { specPointId: "sp-1", topicId: "topic-a", currentQuestionCount: 1, independentQuestionDeficit: 3, missingCategories: ["transfer"] },
      { specPointId: "sp-2", topicId: "topic-a", currentQuestionCount: 1, independentQuestionDeficit: 3, missingCategories: ["transfer"] },
      { specPointId: "sp-3", topicId: "topic-a", currentQuestionCount: 2, independentQuestionDeficit: 2, missingCategories: ["application"] },
    ];
    const plan = buildWjecAuthoringPlan(gaps, 2);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.requiredDemand).toBe("transfer");
    expect(plan[0]?.targetSpecPointIds).toEqual(expect.arrayContaining(["sp-1", "sp-2"]));
  });
});
