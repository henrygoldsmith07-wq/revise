import { describe, expect, it } from "vitest";
import { OUTCOME_HIERARCHY, isDiagnosticMetric, robustEffect } from "@/domain/experiment-robustness";

describe("experiment robustness", () => {
  it("prioritises delayed retention over engagement theatre", () => {
    expect(OUTCOME_HIERARCHY[0]).toBe("delayed-retrieval");
    expect(OUTCOME_HIERARCHY.indexOf("unseen-transfer")).toBeLessThan(OUTCOME_HIERARCHY.indexOf("timed-paper"));
    for (const metric of ["clicks", "session-starts", "xp", "engagement", "immediate-score"]) {
      expect(isDiagnosticMetric(metric)).toBe(true);
    }
    expect(isDiagnosticMetric("delayed-retrieval")).toBe(false);
  });

  it("stays provisional on small samples and never claims certainty", () => {
    const small = robustEffect({ reviseMean: 70, baselineMean: 60, reviseN: 4, baselineN: 4 });
    expect(small.confidence).toBe("provisional");
    expect(small.claimable).toBe(false);
    expect(small.warnings.some((w) => w.includes("power gate"))).toBe(true);
  });

  it("penalises repeated families, assisted evidence, unequal time and attrition", () => {
    const dirty = robustEffect({
      reviseMean: 75, baselineMean: 65, reviseN: 40, baselineN: 40,
      repeatedFamilyShare: 0.5, assistedShare: 0.4, timeRatio: 1.5, missingFollowUpShare: 0.3,
    });
    expect(dirty.confidence).toBe("provisional");
    expect(dirty.claimable).toBe(false);
    expect(dirty.warnings.length).toBeGreaterThanOrEqual(3);
    const clean = robustEffect({ reviseMean: 75, baselineMean: 65, reviseN: 40, baselineN: 40 });
    expect(clean.claimable).toBe(true);
  });
});
